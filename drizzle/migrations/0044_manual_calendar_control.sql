-- Explicit calendar commands reuse the canonical event validator, without SMS.
CREATE TABLE public.calendar_manual_actions (
 user_id uuid NOT NULL,id uuid NOT NULL,conversation_id uuid NOT NULL,
 plan_id uuid,plan_version integer,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,id),FOREIGN KEY(conversation_id) REFERENCES conversations(id),
 FOREIGN KEY(user_id,plan_id) REFERENCES social_plans(user_id,id)
);
ALTER TABLE calendar_manual_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON calendar_manual_actions FROM PUBLIC,anon,authenticated;
GRANT ALL ON calendar_manual_actions TO service_role;
ALTER TABLE calendar_action_receipts DROP CONSTRAINT calendar_action_receipts_source_kind_check;
ALTER TABLE calendar_action_receipts ADD CONSTRAINT calendar_action_receipts_source_kind_check CHECK(source_kind IN('message','experience','manual'));

-- Extend the installed authoritative validator rather than create a second scheduler.
-- Stop if its known source/confirmation contract has changed unexpectedly.
DO $repair$
DECLARE definition text;needle text;body_hash text;
BEGIN
 SELECT pg_get_functiondef('public.calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz)'::regprocedure) INTO definition;
 SELECT md5(regexp_replace(prosrc,'[[:space:]]','','g')) INTO body_hash FROM pg_proc WHERE oid='public.calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz)'::regprocedure;
 IF body_hash NOT IN('41f6a8837c5d0fc38856a0988934bf8a','71cb35b38c871a4a4e9a220de0fdbb2e') THEN RAISE EXCEPTION 'Manual calendar: unrecognized canonical event validator (%)',body_hash;END IF;
 needle:=$old$IF p_kind NOT IN('message','experience') OR p_ordinal NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'invalid source'; END IF;$old$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Manual calendar: unrecognized source contract';END IF;
 definition:=replace(definition,needle,$new$IF p_kind<>'manual' THEN RETURN jsonb_build_object('unchanged',true,'reason','calendar_requires_explicit_user_action'); END IF;
 IF p_ordinal<>0 THEN RAISE EXCEPTION 'invalid manual source';END IF;$new$);
 needle:=$old$IF p_kind='message' THEN
  SELECT conversation_id,sender,body,created_at INTO cid,speaker,source_body,clock FROM messages WHERE user_id=p_user AND id=p_source AND visible_at<=p_now;
 ELSE$old$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Manual calendar: unrecognized evidence contract';END IF;
 definition:=replace(definition,needle,$new$IF p_kind='manual' THEN
  SELECT conversation_id,'user',payload::text,created_at INTO cid,speaker,source_body,clock FROM calendar_manual_actions WHERE user_id=p_user AND id=p_source AND payload=p_payload;
 ELSIF p_kind='message' THEN
  SELECT conversation_id,sender,body,created_at INTO cid,speaker,source_body,clock FROM messages WHERE user_id=p_user AND id=p_source AND visible_at<=p_now;
 ELSE$new$);
 needle:=$old$IF a='cancel' THEN p.status:='cancelled';$old$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Manual calendar: unrecognized status contract';END IF;
 definition:=replace(definition,needle,$new$IF p_kind='manual' AND coalesce((p_payload->>'confirmed')::boolean,false) AND a NOT IN('cancel','decline') THEN
      p.user_response:='accepted';p.character_response:='accepted';
    END IF;
    IF a='cancel' THEN p.status:='cancelled';$new$);
 EXECUTE definition;
END $repair$;

CREATE FUNCTION public.calendar_manual_status() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT 44$$;
CREATE FUNCTION public.calendar_manual_action(p_user uuid,p_id uuid,p_conversation uuid,p_plan uuid,p_version integer,p_payload jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old calendar_manual_actions;p social_plans;result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 IF NOT EXISTS(SELECT 1 FROM conversations WHERE user_id=p_user AND id=p_conversation) THEN RAISE EXCEPTION 'owned contact required';END IF;
 SELECT * INTO old FROM calendar_manual_actions WHERE user_id=p_user AND id=p_id;
 IF FOUND THEN
  IF old.conversation_id IS DISTINCT FROM p_conversation OR old.plan_id IS DISTINCT FROM p_plan OR old.plan_version IS DISTINCT FROM p_version OR old.payload-'schedule_ok' IS DISTINCT FROM p_payload-'schedule_ok' THEN RAISE EXCEPTION 'manual calendar action id conflict';END IF;
  SELECT r.result INTO result FROM calendar_action_receipts r WHERE user_id=p_user AND source_kind='manual' AND source_id=p_id AND ordinal=0;
  IF result IS NOT NULL THEN RETURN result||jsonb_build_object('replayed',true,'conversationId',p_conversation); END IF;
 END IF;
 IF p_plan IS NOT NULL THEN
  SELECT * INTO p FROM social_plans WHERE user_id=p_user AND id=p_plan AND conversation_id=p_conversation FOR UPDATE;
  IF NOT FOUND OR p.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'plan changed; reload';END IF;
  IF p.status IN('completed','cancelled','declined','missed') THEN RAISE EXCEPTION 'terminal plan cannot be edited';END IF;
  IF EXISTS(SELECT 1 FROM living_experiences WHERE user_id=p_user AND plan_id=p_plan AND (claimed_at IS NOT NULL OR state<>'scheduled')) THEN RAISE EXCEPTION 'resolve the experience before editing';END IF;
  IF p_payload->>'planId' IS DISTINCT FROM p_plan::text OR p_payload->>'action' NOT IN('accept','details','reschedule','cancel','decline') THEN RAISE EXCEPTION 'matching plan action required';END IF;
 ELSE
  IF p_payload->>'action'<>'invite' OR nullif(p_payload->>'planId','') IS NOT NULL THEN RAISE EXCEPTION 'new invitation required';END IF;
 END IF;
 INSERT INTO calendar_manual_actions VALUES(p_user,p_id,p_conversation,p_plan,p_version,p_payload,p_now);
 result:=calendar_event_action(p_user,'manual',p_id,0,p_payload,p_now);
 IF coalesce((result->>'blocked')::boolean,false) THEN RAISE EXCEPTION 'resolve the experience before editing';END IF;
 PERFORM experience_seed(p_user,p_now);
 RETURN result||jsonb_build_object('conversationId',p_conversation);
END $$;
-- A queue replay or old prepared AI reply cannot alter a plan after this migration.
CREATE OR REPLACE FUNCTION public.calendar_pending(p_user uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT '[]'::jsonb$$;
-- Presence may follow an accepted schedule; elapsed time never changes the plan.
CREATE OR REPLACE FUNCTION public.calendar_advance(p_user uuid,p_now timestamptz,p_blocked jsonb DEFAULT '[]') RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p social_plans;n integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 DELETE FROM social_presence pr WHERE pr.user_id=p_user AND (pr.until_at<=p_now OR NOT EXISTS(SELECT 1 FROM social_plans sp WHERE sp.user_id=p_user AND sp.id=pr.plan_id AND sp.status IN('accepted','in_progress')));
 FOR p IN SELECT * FROM social_plans WHERE user_id=p_user AND origin='conversation' AND conversation_id IS NOT NULL AND status IN('accepted','in_progress') AND starts_at<=p_now AND ends_at>p_now ORDER BY starts_at,id FOR UPDATE LOOP
  IF p_blocked ? p.organizer THEN DELETE FROM social_presence WHERE user_id=p_user AND plan_id=p.id; CONTINUE;END IF;
  IF EXISTS(SELECT 1 FROM social_presence WHERE user_id=p_user AND character_key=p.organizer AND plan_id<>p.id AND until_at>p_now) THEN CONTINUE;END IF;
  INSERT INTO social_presence VALUES(p_user,p.organizer,p.id,p.place_key,p.ends_at) ON CONFLICT(user_id,character_key) DO UPDATE SET plan_id=excluded.plan_id,place_key=excluded.place_key,until_at=excluded.until_at;
  n:=n+1;
 END LOOP;
 RETURN n;
END$$;
-- Existing venue actions may begin an accepted event only through actual user
-- participation, with their existing presence, arrival and ownership guards.
DO $venue$
DECLARE f regprocedure;definition text;needle text;
BEGIN
 FOREACH f IN ARRAY ARRAY['public.venue_act(uuid,uuid,text,text,text,timestamptz,uuid,text,integer)'::regprocedure,'public.venue_progress(uuid,uuid,text,text,integer,integer,timestamptz,uuid)'::regprocedure] LOOP
  SELECT pg_get_functiondef(f) INTO definition;
  IF position('status=''in_progress'' AND' IN definition)=0 THEN RAISE EXCEPTION 'Manual calendar: unrecognized venue eligibility';END IF;
  definition:=replace(definition,'status=''in_progress'' AND','status IN(''accepted'',''in_progress'') AND');
  needle:='UPDATE social_plans SET user_attendance=';
  IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Manual calendar: unrecognized participation contract';END IF;
  definition:=replace(definition,needle,'UPDATE social_plans SET status=''in_progress'',version=version+CASE WHEN status=''accepted'' THEN 1 ELSE 0 END,user_attendance=');
  EXECUTE definition;
 END LOOP;
END $venue$;
REVOKE ALL ON FUNCTION calendar_manual_status(),calendar_manual_action(uuid,uuid,uuid,uuid,integer,jsonb,timestamptz),calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz),calendar_pending(uuid,timestamptz),calendar_advance(uuid,timestamptz,jsonb),venue_act(uuid,uuid,text,text,text,timestamptz,uuid,text,integer),venue_progress(uuid,uuid,text,text,integer,integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION calendar_manual_status(),calendar_manual_action(uuid,uuid,uuid,uuid,integer,jsonb,timestamptz),calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz),calendar_pending(uuid,timestamptz),calendar_advance(uuid,timestamptz,jsonb),venue_act(uuid,uuid,text,text,text,timestamptz,uuid,text,integer),venue_progress(uuid,uuid,text,text,integer,integer,timestamptz,uuid) TO service_role;
