-- Additive world expansion; no existing histories, scores, portraits or storage assets are replaced.
ALTER TABLE public.town_connections ADD COLUMN followups_enabled boolean NOT NULL DEFAULT false, ADD COLUMN last_followup_at timestamptz;
ALTER TABLE public.town_actions DROP CONSTRAINT town_actions_mode_check;
ALTER TABLE public.town_actions ADD CONSTRAINT town_actions_mode_check CHECK(mode IN('scene','message','autonomous'));
CREATE TABLE public.town_memories(user_id uuid NOT NULL,npc_key text NOT NULL,action_id uuid NOT NULL,summary text NOT NULL,source_quote text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,npc_key,action_id,source_quote));
CREATE INDEX npc_memory_recall ON public.town_memories(user_id,npc_key,created_at DESC);
CREATE TABLE public.town_intentions(user_id uuid NOT NULL,id uuid NOT NULL,npc_key text NOT NULL,summary text NOT NULL,source_quote text NOT NULL,due_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','completed','declined','failed','expired')),PRIMARY KEY(user_id,id));
CREATE INDEX npc_intention_due ON public.town_intentions(user_id,due_at) WHERE status='pending';
CREATE UNIQUE INDEX pending_npc_promise_once ON public.town_intentions(user_id,npc_key,source_quote) WHERE status='pending';
CREATE TABLE public.visual_identity_registry(user_id uuid NOT NULL,entity_key text NOT NULL,canonical_asset text,canonical_sha256 text,approval text NOT NULL CHECK(approval IN('approved','missing')),active_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,active_reason text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,entity_key),CHECK((approval='approved' AND canonical_asset IS NOT NULL AND canonical_sha256 IS NOT NULL) OR (approval='missing' AND canonical_asset IS NULL AND canonical_sha256 IS NULL AND active_message_id IS NULL)));
CREATE UNIQUE INDEX canonical_asset_not_reused ON public.visual_identity_registry(user_id,canonical_sha256) WHERE approval='approved';
CREATE TABLE public.town_introductions(user_id uuid NOT NULL,npc_key text NOT NULL,source_message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,source_character text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,npc_key,source_message_id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['town_memories','town_intentions','visual_identity_registry','town_introductions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY owner_read ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
END LOOP; END $$;
CREATE FUNCTION public.world_expansion_status() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT 15 $$;
REVOKE ALL ON FUNCTION public.world_expansion_status() FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.world_expansion_status() TO service_role;
CREATE OR REPLACE FUNCTION public.town_command(p_user uuid,p_id uuid,p_command text,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
  IF NOT EXISTS(SELECT 1 FROM town_people WHERE user_id=p_user AND key=npc) OR length(p_payload->>'text') NOT BETWEEN 1 AND 1500 OR p_payload->>'mode' NOT IN('scene','message','autonomous') THEN RAISE EXCEPTION 'invalid encounter'; END IF;
  SELECT * INTO a FROM town_actions WHERE user_id=p_user AND id=p_id;
  IF FOUND THEN
   IF a.npc_key<>npc OR a.input<>p_payload->>'text' OR a.mode<>p_payload->>'mode' THEN RAISE EXCEPTION 'action id reused'; END IF;
   RETURN jsonb_build_object('status',a.status,'claimed',false);
  END IF;
  SELECT * INTO c FROM town_connections WHERE user_id=p_user AND npc_key=npc;
  IF p_payload->>'mode' IN('message','autonomous') AND NOT coalesce(c.contact,false) THEN RAISE EXCEPTION 'contact exchange required'; END IF;
  IF p_payload->>'mode'='autonomous' AND (NOT coalesce(c.followups_enabled,false) OR c.last_followup_at>p_now-interval '24 hours' OR NOT EXISTS(SELECT 1 FROM town_intentions WHERE user_id=p_user AND id=p_id AND npc_key=npc AND status='pending' AND due_at<=p_now AND expires_at>p_now)) THEN RAISE EXCEPTION 'follow-up not eligible'; END IF;
  IF p_payload->>'mode'='scene' THEN
   SELECT * INTO pos FROM town_presence WHERE user_id=p_user;
   IF pos.place_key IS DISTINCT FROM p_payload->>'place' OR pos.arrives_at>p_now THEN RAISE EXCEPTION 'not at scene'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM town_actions WHERE user_id=p_user AND status='reserved' AND created_at>p_now-interval '2 minutes') THEN RAISE EXCEPTION 'another response is processing'; END IF;
  IF (SELECT count(*) FROM town_actions WHERE user_id=p_user AND created_at>=date_trunc('day',p_now))>=LEAST(40,GREATEST(0,coalesce((p_payload->>'daily_limit')::integer,40))) THEN RAISE EXCEPTION 'daily encounter AI limit reached'; END IF;
  UPDATE town_actions SET status='failed' WHERE user_id=p_user AND status='reserved';
  INSERT INTO town_actions VALUES(p_user,p_id,npc,p_payload->>'text',p_payload->>'mode','reserved',p_now);
  RETURN jsonb_build_object('status','reserved','claimed',true);
 ELSIF p_command IN('finish','fail') THEN
  SELECT * INTO a FROM town_actions WHERE user_id=p_user AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown action'; END IF;
  IF a.status<>'reserved' THEN RETURN jsonb_build_object('status',a.status); END IF;
  IF p_command='fail' THEN UPDATE town_actions SET status='failed' WHERE user_id=p_user AND id=p_id; RETURN '{"status":"failed"}'; END IF;
  IF length(p_payload->>'reply') NOT BETWEEN 1 AND 1800 THEN RAISE EXCEPTION 'invalid reply'; END IF;
  INSERT INTO town_connections(user_id,npc_key,encountered_at) VALUES(p_user,a.npc_key,a.created_at) ON CONFLICT DO NOTHING;
  IF a.mode<>'autonomous' THEN INSERT INTO town_messages VALUES(p_user,md5(p_id::text||'user')::uuid,a.npc_key,p_id,'user',a.input,p_now); END IF;
  INSERT INTO town_messages VALUES(p_user,md5(p_id::text||'assistant')::uuid,a.npc_key,p_id,'assistant',p_payload->>'reply',p_now+interval '1 millisecond');
  IF a.mode='autonomous' THEN
   UPDATE town_connections SET last_followup_at=p_now WHERE user_id=p_user AND npc_key=a.npc_key;
   UPDATE town_intentions SET status='completed' WHERE user_id=p_user AND id=p_id;
  ELSE
   INSERT INTO town_memories(user_id,npc_key,action_id,summary,source_quote) SELECT p_user,a.npc_key,p_id,left(x->>'summary',300),left(x->>'source_quote',300) FROM jsonb_array_elements(coalesce(p_payload->'memories','[]')) x
    WHERE length(x->>'source_quote')>=8 AND position(x->>'source_quote' in a.input)>0 AND length(x->>'summary')>0 LIMIT 3 ON CONFLICT DO NOTHING;
   IF p_payload->'followup' IS NOT NULL AND p_payload->'followup'<>'null'::jsonb AND length(p_payload->'followup'->>'quote')>=8 AND position(p_payload->'followup'->>'quote' in p_payload->>'reply')>0 AND (p_payload->'followup'->>'due_at')::timestamptz BETWEEN p_now+interval '30 minutes' AND p_now+interval '7 days' THEN
    INSERT INTO town_intentions(user_id,id,npc_key,summary,source_quote,due_at,expires_at) VALUES(p_user,md5(p_id::text||'intention')::uuid,a.npc_key,left(p_payload->'followup'->>'summary',300),left(p_payload->'followup'->>'quote',300),(p_payload->'followup'->>'due_at')::timestamptz,(p_payload->'followup'->>'due_at')::timestamptz+interval '48 hours') ON CONFLICT DO NOTHING;
   END IF;
  END IF;
  UPDATE town_connections SET contact_offered=coalesce((p_payload->>'contact')::boolean,false) WHERE user_id=p_user AND npc_key=a.npc_key;
  UPDATE town_actions SET status='completed' WHERE user_id=p_user AND id=p_id;
  RETURN '{"status":"completed"}';
 ELSIF p_command='contact' THEN
  UPDATE town_connections SET contact=true WHERE user_id=p_user AND npc_key=p_payload->>'npc' AND contact_offered;
  IF NOT FOUND THEN RAISE EXCEPTION 'mutual contact consent required'; END IF;
  RETURN '{"status":"contact_exchanged"}';
 ELSIF p_command='followups' THEN
  UPDATE town_connections SET followups_enabled=coalesce((p_payload->>'enabled')::boolean,false) WHERE user_id=p_user AND npc_key=p_payload->>'npc' AND contact;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact exchange required'; END IF; RETURN '{}';
 ELSIF p_command='read' THEN
  UPDATE town_connections SET read_at=p_now WHERE user_id=p_user AND npc_key=p_payload->>'npc'; RETURN '{}';
 ELSE RAISE EXCEPTION 'unknown town action'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.town_command(uuid,uuid,text,jsonb,timestamptz) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.town_command(uuid,uuid,text,jsonb,timestamptz) TO service_role;
CREATE FUNCTION public.update_active_portrait(p_user uuid,p_key text,p_message uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.visual_identity_registry;m public.messages;cid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('portrait:'||p_user::text||p_key,0));
 SELECT * INTO r FROM visual_identity_registry WHERE user_id=p_user AND entity_key=p_key FOR UPDATE;
 IF NOT FOUND OR r.approval<>'approved' THEN RAISE EXCEPTION 'approved canonical identity required'; END IF;
 SELECT c.id INTO cid FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=p_key;
 IF cid IS NULL OR length(p_reason) NOT BETWEEN 5 AND 200 THEN RAISE EXCEPTION 'owned character and explanation required'; END IF;
 IF p_message IS NOT NULL THEN
  SELECT * INTO m FROM messages WHERE id=p_message AND user_id=p_user AND conversation_id=cid AND sender='tess' AND visible_at<=now();
  IF NOT FOUND OR coalesce(m.metadata->>'photo_type','') NOT IN('casual_selfie','tess_candid') OR coalesce(m.metadata->>'generated_path','') NOT LIKE p_user::text||'/%' OR m.metadata->'photo_identity'->>'canonicalSha256' IS DISTINCT FROM r.canonical_sha256 OR m.metadata->'photo_identity'->>'canonicalAsset' IS DISTINCT FROM r.canonical_asset OR m.metadata->'photo_identity'->>'validationStatus' IS DISTINCT FROM 'screen_passed' OR m.metadata->'photo_identity'->>'referenceConditioning' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'approved identity-consistent delivered portrait required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM media_attempts ma JOIN job_runs j ON j.id=ma.action_id WHERE ma.user_id=p_user AND ma.conversation_id=cid AND ma.status='generated' AND ma.storage_path=m.metadata->>'generated_path' AND j.status='ok') THEN RAISE EXCEPTION 'private generation receipt required'; END IF;
 END IF;
 IF r.active_message_id IS NOT DISTINCT FROM p_message THEN RETURN to_jsonb(r); END IF;
 UPDATE visual_identity_registry SET active_message_id=p_message,active_reason=p_reason,updated_at=now() WHERE user_id=p_user AND entity_key=p_key RETURNING * INTO r;
 INSERT INTO world_events(user_id,conversation_id,character_key,kind,summary,payload) VALUES(p_user,cid,p_key,'profile_photo_changed','Reviewed profile photo updated: '||p_reason,jsonb_build_object('canonical_unchanged',true,'source_message',p_message));
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.update_active_portrait(uuid,text,uuid,text) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.update_active_portrait(uuid,text,uuid,text) TO service_role;
CREATE FUNCTION public.record_npc_introduction(p_user uuid,p_message uuid,p_npc text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.messages;k text;n text;
BEGIN
 SELECT * INTO m FROM messages WHERE id=p_message AND user_id=p_user AND sender='tess' AND visible_at<=now();
 IF NOT FOUND THEN RAISE EXCEPTION 'visible owned introduction required'; END IF;
 SELECT ch.key INTO k FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.id=m.conversation_id AND c.user_id=p_user;
 SELECT profile->>'name' INTO n FROM town_people WHERE user_id=p_user AND key=p_npc;
 IF k IS NULL OR n IS NULL OR position(lower(n) in lower(m.body))=0 THEN RAISE EXCEPTION 'unknown introduction target'; END IF;
 INSERT INTO town_introductions(user_id,npc_key,source_message_id,source_character) VALUES(p_user,p_npc,p_message,k) ON CONFLICT DO NOTHING;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_npc_introduction(uuid,uuid,text) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.record_npc_introduction(uuid,uuid,text) TO service_role;

-- Preserve UTC daily/monthly budgets and prevent bursts across midnight.
CREATE OR REPLACE FUNCTION public.reserve_image_attempt(p_action_id uuid,p_conversation_id uuid,p_user_id uuid,p_daily integer,p_monthly integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n_day integer; n_month integer; c_day integer; c_month integer;
BEGIN
  IF p_daily IS NULL OR p_monthly IS NULL OR p_daily < 0 OR p_daily > 50 OR p_monthly < 0 OR p_monthly > 1000 THEN RAISE EXCEPTION 'invalid image budget'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,47));
  IF NOT EXISTS (SELECT 1 FROM public.job_runs WHERE id=p_action_id AND status='running' AND detail->>'userId'=p_user_id::text AND detail->>'conversationId'=p_conversation_id::text) THEN RAISE EXCEPTION 'unreserved image action'; END IF;
  IF EXISTS (SELECT 1 FROM public.media_attempts WHERE action_id=p_action_id) THEN RETURN false; END IF;
  SELECT count(*) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), count(*),
    count(*) FILTER (WHERE conversation_id=p_conversation_id AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), count(*) FILTER (WHERE conversation_id=p_conversation_id)
    INTO n_day,n_month,c_day,c_month FROM public.media_attempts WHERE user_id=p_user_id AND created_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF c_day >= p_daily OR c_month >= p_monthly OR n_day >= p_daily*3 OR n_month >= p_monthly*3 THEN RETURN false; END IF;
  IF (SELECT count(*) FROM public.media_attempts WHERE user_id=p_user_id AND conversation_id=p_conversation_id AND created_at>=now()-interval '24 hours')>=p_daily OR (SELECT count(*) FROM public.media_attempts WHERE user_id=p_user_id AND created_at>=now()-interval '24 hours')>=p_daily*3 THEN RETURN false; END IF;
  INSERT INTO public.media_attempts(action_id,conversation_id,user_id) VALUES(p_action_id,p_conversation_id,p_user_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_image_attempt(uuid,uuid,uuid,integer,integer) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_image_attempt(uuid,uuid,uuid,integer,integer) TO service_role;

