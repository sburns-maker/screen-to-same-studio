-- Additive, per-user virtual exploration. No existing chat/profile/state is rewritten.
ALTER TABLE public.world_places ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
CREATE TABLE public.town_people(user_id uuid NOT NULL,key text NOT NULL,profile jsonb NOT NULL,PRIMARY KEY(user_id,key));
CREATE TABLE public.town_presence(user_id uuid PRIMARY KEY,place_key text NOT NULL DEFAULT 'home:user',arrives_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.town_connections(user_id uuid NOT NULL,npc_key text NOT NULL,encountered_at timestamptz NOT NULL DEFAULT now(),contact boolean NOT NULL DEFAULT false,contact_offered boolean NOT NULL DEFAULT false,read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,npc_key));
CREATE TABLE public.town_actions(user_id uuid NOT NULL,id uuid NOT NULL,npc_key text NOT NULL,input text NOT NULL,mode text NOT NULL CHECK(mode IN('scene','message')),status text NOT NULL CHECK(status IN('reserved','completed','failed')),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id));
CREATE INDEX town_actions_budget ON public.town_actions(user_id,created_at);
CREATE TABLE public.town_messages(user_id uuid NOT NULL,id uuid NOT NULL,npc_key text NOT NULL,action_id uuid NOT NULL,role text NOT NULL CHECK(role IN('user','assistant')),text text NOT NULL CHECK(length(text) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),UNIQUE(user_id,action_id,role),FOREIGN KEY(user_id,npc_key) REFERENCES public.town_connections(user_id,npc_key),FOREIGN KEY(user_id,action_id) REFERENCES public.town_actions(user_id,id));
CREATE INDEX town_messages_thread ON public.town_messages(user_id,npc_key,created_at);
CREATE TABLE public.town_known_plans(user_id uuid NOT NULL,plan_id uuid NOT NULL,PRIMARY KEY(user_id,plan_id),FOREIGN KEY(user_id,plan_id) REFERENCES public.social_plans(user_id,id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['town_people','town_presence','town_connections','town_actions','town_messages','town_known_plans'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY owner_read ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
END LOOP; END $$;
CREATE FUNCTION public.town_status() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT 12 $$;
REVOKE ALL ON FUNCTION public.town_status() FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.town_status() TO service_role;
-- All actions are server-authorized; the caller's verified user ID is supplied by server middleware.
CREATE FUNCTION public.town_command(p_user uuid,p_id uuid,p_command text,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.town_actions; c public.town_connections; pos public.town_presence; dest text; npc text; n integer; arrival timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('town:'||p_user::text,0));
 IF p_command='visit' THEN
  dest:=p_payload->>'place';
  IF dest<>'home:user' AND NOT EXISTS(SELECT 1 FROM world_places WHERE user_id=p_user AND key=dest AND metadata->>'public'='true') THEN RAISE EXCEPTION 'unknown public place'; END IF;
  SELECT * INTO pos FROM town_presence WHERE user_id=p_user;
  IF pos.arrives_at>p_now THEN RAISE EXCEPTION 'virtual travel still in progress'; END IF;
  IF pos.place_key=dest THEN RETURN to_jsonb(pos); END IF;
  n:=(p_payload->>'minutes')::integer;
  IF n NOT BETWEEN 0 AND 120 THEN RAISE EXCEPTION 'invalid travel'; END IF;
  arrival:=p_now+make_interval(mins=>n);
  INSERT INTO town_presence VALUES(p_user,dest,arrival,p_now) ON CONFLICT(user_id) DO UPDATE SET place_key=excluded.place_key,arrives_at=excluded.arrives_at,updated_at=p_now RETURNING * INTO pos;
  RETURN to_jsonb(pos);
 ELSIF p_command='start' THEN
  npc:=p_payload->>'npc';
  IF npc NOT IN('rowan-ellis','leah-moss','nolan-reed') OR length(p_payload->>'text') NOT BETWEEN 1 AND 1500 OR p_payload->>'mode' NOT IN('scene','message') THEN RAISE EXCEPTION 'invalid encounter'; END IF;
  SELECT * INTO a FROM town_actions WHERE user_id=p_user AND id=p_id;
  IF FOUND THEN
   IF a.npc_key<>npc OR a.input<>p_payload->>'text' OR a.mode<>p_payload->>'mode' THEN RAISE EXCEPTION 'action id reused'; END IF;
   RETURN jsonb_build_object('status',a.status,'claimed',false);
  END IF;
  SELECT * INTO c FROM town_connections WHERE user_id=p_user AND npc_key=npc;
  IF p_payload->>'mode'='message' AND NOT coalesce(c.contact,false) THEN RAISE EXCEPTION 'contact exchange required'; END IF;
  IF p_payload->>'mode'='scene' THEN
   SELECT * INTO pos FROM town_presence WHERE user_id=p_user;
   IF pos.place_key IS DISTINCT FROM p_payload->>'place' OR pos.arrives_at>p_now THEN RAISE EXCEPTION 'not at scene'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM town_actions WHERE user_id=p_user AND status='reserved' AND created_at>p_now-interval '2 minutes') THEN RAISE EXCEPTION 'another response is processing'; END IF;
  IF (SELECT count(*) FROM town_actions WHERE user_id=p_user AND created_at>=date_trunc('day',p_now))>=LEAST(40,GREATEST(0,coalesce((p_payload->>'daily_limit')::integer,40))) THEN RAISE EXCEPTION 'daily encounter AI limit reached'; END IF;
  UPDATE town_actions SET status='failed' WHERE user_id=p_user AND status='reserved';
  INSERT INTO town_connections(user_id,npc_key,encountered_at) VALUES(p_user,npc,p_now) ON CONFLICT DO NOTHING;
  INSERT INTO town_actions VALUES(p_user,p_id,npc,p_payload->>'text',p_payload->>'mode','reserved',p_now);
  RETURN jsonb_build_object('status','reserved','claimed',true);
 ELSIF p_command IN('finish','fail') THEN
  SELECT * INTO a FROM town_actions WHERE user_id=p_user AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown action'; END IF;
  IF a.status<>'reserved' THEN RETURN jsonb_build_object('status',a.status); END IF;
  IF p_command='fail' THEN UPDATE town_actions SET status='failed' WHERE user_id=p_user AND id=p_id; RETURN '{"status":"failed"}'; END IF;
  IF length(p_payload->>'reply') NOT BETWEEN 1 AND 1800 THEN RAISE EXCEPTION 'invalid reply'; END IF;
  INSERT INTO town_messages VALUES(p_user,md5(p_id::text||'user')::uuid,a.npc_key,p_id,'user',a.input,p_now), (p_user,md5(p_id::text||'assistant')::uuid,a.npc_key,p_id,'assistant',p_payload->>'reply',p_now+interval '1 millisecond');
  UPDATE town_connections SET contact_offered=coalesce((p_payload->>'contact')::boolean,false) WHERE user_id=p_user AND npc_key=a.npc_key;
  UPDATE town_actions SET status='completed' WHERE user_id=p_user AND id=p_id;
  RETURN '{"status":"completed"}';
 ELSIF p_command='contact' THEN
  UPDATE town_connections SET contact=true WHERE user_id=p_user AND npc_key=p_payload->>'npc' AND contact_offered;
  IF NOT FOUND THEN RAISE EXCEPTION 'mutual contact consent required'; END IF;
  RETURN '{"status":"contact_exchanged"}';
 ELSIF p_command='read' THEN
  UPDATE town_connections SET read_at=p_now WHERE user_id=p_user AND npc_key=p_payload->>'npc'; RETURN '{}';
 ELSE RAISE EXCEPTION 'unknown town action'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.town_command(uuid,uuid,text,jsonb,timestamptz) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.town_command(uuid,uuid,text,jsonb,timestamptz) TO service_role;
-- User-arranged proposals reuse the canonical shared-plan transaction and participant knowledge.
CREATE FUNCTION public.town_propose_plan(p_user uuid,p_id uuid,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p jsonb; v integer; who text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('town:'||p_user::text,0));
 IF EXISTS(SELECT 1 FROM town_known_plans WHERE user_id=p_user AND plan_id=p_id) THEN
  p:=public.shared_world_command(p_user,p_id,'create',p_payload,p_now,0);
  FOR who IN SELECT jsonb_array_elements_text(p_payload->'invitees') LOOP
   IF NOT EXISTS(SELECT 1 FROM social_rsvps WHERE user_id=p_user AND plan_id=p_id AND character_key=who) THEN RAISE EXCEPTION 'plan id reused'; END IF;
  END LOOP;
  RETURN p;
 END IF;
 IF (SELECT count(*) FROM social_plans sp JOIN town_known_plans k ON k.user_id=sp.user_id AND k.plan_id=sp.id WHERE sp.user_id=p_user AND sp.created_at>=date_trunc('day',p_now))>=4 THEN RAISE EXCEPTION 'daily plan limit reached'; END IF;
 IF p_payload->>'place' NOT IN('coffee:local','park:local') THEN RAISE EXCEPTION 'choose public meeting place'; END IF;
 p:=public.shared_world_command(p_user,p_id,'create',p_payload,p_now,0); v:=(p->>'version')::integer;
 FOR who IN SELECT jsonb_array_elements_text(p_payload->'invitees') LOOP
  p:=public.shared_world_command(p_user,p_id,'invite',jsonb_build_object('actor',p_payload->>'organizer','character',who,'channel','user_relay'),p_now,v); v:=(p->>'version')::integer;
 END LOOP;
 INSERT INTO town_known_plans VALUES(p_user,p_id);
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.town_propose_plan(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.town_propose_plan(uuid,uuid,jsonb,timestamptz) TO service_role;
