-- Additive repair: manual edits use the existing canonical scheduling contract.
-- No historical data rewrite, new event table or automatic acceptance by a character.
CREATE FUNCTION public.calendar_edit_status() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT 40 $$;
CREATE FUNCTION public.calendar_edit_plan(p_user uuid,p_plan uuid,p_action uuid,p_version integer,p_payload jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p social_plans; prior messages; receipt calendar_action_receipts; body text; result jsonb; changed boolean; payload jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 SELECT * INTO p FROM social_plans WHERE user_id=p_user AND id=p_plan FOR UPDATE;
 IF NOT FOUND OR p.origin<>'conversation' OR p.conversation_id IS NULL THEN RAISE EXCEPTION 'owned conversation event required'; END IF;
 SELECT * INTO receipt FROM calendar_action_receipts WHERE user_id=p_user AND source_kind='message' AND source_id=p_action AND ordinal=0;
 IF FOUND THEN
  SELECT * INTO prior FROM messages WHERE user_id=p_user AND id=p_action;
  IF receipt.plan_id IS DISTINCT FROM p_plan OR (prior.metadata->'calendar_edit')-'schedule_ok' IS DISTINCT FROM p_payload-'schedule_ok' THEN RAISE EXCEPTION 'edit action id conflict'; END IF;
  RETURN receipt.result||jsonb_build_object('replayed',true,'conversationId',p.conversation_id);
 END IF;
 IF p_version IS NULL OR p.version<>p_version THEN RAISE EXCEPTION 'plan changed; reload before editing'; END IF;
 IF p.status IN('completed','cancelled','declined','missed') THEN RAISE EXCEPTION 'terminal plan cannot be edited'; END IF;
 IF EXISTS(SELECT 1 FROM living_experiences WHERE user_id=p_user AND plan_id=p_plan AND (claimed_at IS NOT NULL OR state<>'scheduled')) THEN RAISE EXCEPTION 'resolve the experience before editing'; END IF;
 IF length(trim(coalesce(p_payload->>'title','')))=0 THEN RAISE EXCEPTION 'activity title required'; END IF;
 IF p_payload->>'date' IS NULL OR p_payload->>'time' IS NULL THEN RAISE EXCEPTION 'date and time required'; END IF;
 -- Canonical action validates duration, venue, local time, overlap, travel and agency.
 changed:=p.date_local IS DISTINCT FROM p_payload->>'date' OR p.time_local IS DISTINCT FROM p_payload->>'time' OR p.duration_minutes IS DISTINCT FROM (p_payload->>'durationMinutes')::integer OR p.place_key IS DISTINCT FROM coalesce(p_payload->>'place',p.place_key);
 payload:=p_payload||jsonb_build_object('planId',p.id,'action',CASE WHEN changed THEN 'reschedule' WHEN coalesce((p_payload->>'confirmed')::boolean,false) THEN 'accept' ELSE 'details' END,'timeZone','America/New_York');
 body:='Please update our plan to '||left(p_payload->>'title',120)||' on '||(p_payload->>'date')||' at '||(p_payload->>'time')||' America/New_York, for '||(p_payload->>'durationMinutes')||' minutes. Venue: '||coalesce((SELECT label FROM world_places WHERE user_id=p_user AND key=coalesce(p_payload->>'place',p.place_key)),'undecided')||'. Please confirm any changed arrangements.';
 INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at,metadata)
 VALUES(p_action,p_user,p.conversation_id,'user',body,p_now,p_now,jsonb_build_object('calendar_edit',p_payload,'calendar_plan',p.id));
 result:=calendar_apply(p_user,p_action,payload,p_now);
 IF coalesce((result->>'blocked')::boolean,false) THEN RAISE EXCEPTION 'experience changed; reload'; END IF;
 -- Reuse existing seed/version reconciliation under the same calendar lock.
 PERFORM experience_seed(p_user,p_now);
 RETURN result||jsonb_build_object('conversationId',p.conversation_id);
END $$;
REVOKE ALL ON FUNCTION public.calendar_edit_status(),public.calendar_edit_plan(uuid,uuid,uuid,integer,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_edit_status(),public.calendar_edit_plan(uuid,uuid,uuid,integer,jsonb,timestamptz) TO service_role;
