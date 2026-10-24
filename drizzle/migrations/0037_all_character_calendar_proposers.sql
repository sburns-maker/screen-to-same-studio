-- A proposal from ANY AI character means that character has consented, not only Tess.
-- Full replacement preserves the 0036 ownership, conflict, idempotency and date safeguards.
-- Reconcile active conversational calendar state without touching completed outings.
-- This function maintains owned/idempotent messages and checks genuine commitments only.
CREATE OR REPLACE FUNCTION public.calendar_apply(p_user uuid,p_message uuid,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.messages; p public.social_plans; cid uuid; who text; a text; old_status text; pid uuid; missing text[]; conflict jsonb:='[]'; start_at timestamptz; end_at timestamptz; who_response text; buffer_min integer:=30; changed_details boolean; installed timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 IF EXISTS(SELECT 1 FROM calendar_evidence WHERE user_id=p_user AND message_id=p_message) THEN RETURN '{"replayed":true}'; END IF;
 SELECT * INTO m FROM messages WHERE user_id=p_user AND id=p_message AND visible_at<=p_now;
 SELECT ch.key INTO who FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND c.id=m.conversation_id;
 SELECT installed_at INTO installed FROM interactive_world_installation;
 IF who IS NULL OR m.created_at<installed THEN RAISE EXCEPTION 'visible owned source required'; END IF;
 a:=p_payload->>'action';
 IF a NOT IN('none','invite','accept','details','reschedule','decline','cancel') THEN RAISE EXCEPTION 'invalid calendar action'; END IF;
 IF a='none' THEN INSERT INTO calendar_evidence VALUES(p_user,p_message,NULL,a,'{}',p_now); RETURN '{}'; END IF;
 IF a='invite' THEN
  pid:=md5(m.id::text||':invitation')::uuid;
  IF p_payload->>'category' NOT IN('book_club','coffee','dinner','walk','meetup') THEN RAISE EXCEPTION 'unsupported event'; END IF;
  INSERT INTO social_plans(user_id,id,organizer,place_key,title,starts_at,ends_at,origin,conversation_id,category,proposer,source_message_id,last_message_id,user_response,character_response)
   VALUES(p_user,pid,who,NULL,left(p_payload->>'title',120),NULL,NULL,'conversation',m.conversation_id,p_payload->>'category',CASE WHEN m.sender='user' THEN 'user' ELSE who END,m.id,m.id,CASE WHEN m.sender='user' THEN 'accepted' ELSE 'invited' END,CASE WHEN m.sender<>'user' THEN 'accepted' ELSE 'invited' END);
  INSERT INTO town_known_plans VALUES(p_user,pid) ON CONFLICT DO NOTHING;
 ELSE pid:=(p_payload->>'planId')::uuid; END IF;
 SELECT * INTO p FROM social_plans WHERE user_id=p_user AND id=pid AND origin='conversation' AND conversation_id=m.conversation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'owned conversation plan required'; END IF;
 IF p.status IN('completed','missed','cancelled','declined') THEN RAISE EXCEPTION 'closed plan'; END IF;
 old_status:=p.status;
 changed_details:=p.status IN('accepted','in_progress') AND ((p_payload ? 'date' AND p.date_local IS DISTINCT FROM p_payload->>'date') OR (p_payload ? 'time' AND p.time_local IS DISTINCT FROM p_payload->>'time') OR (p_payload ? 'place' AND p.place_key IS DISTINCT FROM p_payload->>'place'));
 IF (p_payload ? 'place') AND NOT EXISTS(SELECT 1 FROM world_places WHERE user_id=p_user AND key=p_payload->>'place' AND metadata->>'public'='true') THEN RAISE EXCEPTION 'registered public venue required'; END IF;
 p.date_local:=coalesce(p_payload->>'date',p.date_local);p.time_local:=coalesce(p_payload->>'time',p.time_local);p.place_key:=coalesce(p_payload->>'place',p.place_key);
 IF a='accept' THEN IF m.sender='user' THEN p.user_response:='accepted'; ELSE p.character_response:='accepted'; END IF; END IF;
 IF changed_details THEN
  -- Only a genuinely changed agreed detail needs renewed mutual acceptance.
  -- An acknowledgement of already agreed date, time or venue is not a reschedule.
  IF m.sender='user' THEN p.user_response:='accepted';p.character_response:='invited'; ELSE p.character_response:='accepted';p.user_response:='invited'; END IF;
 END IF;
 missing:=ARRAY[]::text[];
 IF p.date_local IS NULL THEN missing:=array_append(missing,'date'); END IF;
 IF p.time_local IS NULL THEN missing:=array_append(missing,'time (include AM/PM)'); END IF;
 IF p.place_key IS NULL THEN missing:=array_append(missing,'venue'); END IF;
 start_at:=NULL;
 IF p.date_local IS NOT NULL AND p.time_local IS NOT NULL THEN
  start_at:= (p.date_local||' '||p.time_local)::timestamp AT TIME ZONE 'America/New_York';
  -- Reject DST holes and folds instead of silently guessing an offset.
  IF to_char(start_at AT TIME ZONE 'America/New_York','YYYY-MM-DD HH24:MI')<>p.date_local||' '||p.time_local OR
     to_char((start_at-interval '1 hour') AT TIME ZONE 'America/New_York','YYYY-MM-DD HH24:MI')=p.date_local||' '||p.time_local OR
     to_char((start_at+interval '1 hour') AT TIME ZONE 'America/New_York','YYYY-MM-DD HH24:MI')=p.date_local||' '||p.time_local THEN
    start_at:=NULL;missing:=array_append(missing,'unambiguous Eastern time');
  ELSIF start_at<p_now AND NOT(p.status IN('accepted','in_progress') AND NOT changed_details AND start_at+make_interval(mins=>p.duration_minutes)>p_now) THEN missing:=array_append(missing,'future time confirmation'); END IF;
 END IF;
 end_at:=start_at+make_interval(mins=>p.duration_minutes);
 IF start_at IS NOT NULL THEN
  IF coalesce((p_payload->>'schedule_ok')::boolean,false)=false THEN conflict:=conflict||'"character_schedule_or_venue_hours"'::jsonb; END IF;
  -- Conservative minimum 30 minute travel buffer, increased for more distant registered pins.
  IF EXISTS(SELECT 1 FROM social_plans sp WHERE sp.user_id=p_user AND sp.id<>p.id AND sp.starts_at IS NOT NULL AND (sp.origin='legacy' OR sp.conversation_id IS NOT NULL) AND sp.status IN('accepted','in_progress','active')
    AND (sp.origin='legacy' AND EXISTS(SELECT 1 FROM social_rsvps r WHERE r.user_id=p_user AND r.plan_id=sp.id AND r.character_key=who AND r.response='accepted') OR sp.origin='conversation' AND sp.user_response='accepted' AND sp.character_response='accepted')
    AND sp.starts_at<end_at+make_interval(mins=>public.calendar_travel_buffer(p_user,sp.place_key,p.place_key)) AND sp.ends_at>start_at-make_interval(mins=>public.calendar_travel_buffer(p_user,sp.place_key,p.place_key))) THEN conflict:=conflict||'"calendar_or_travel_overlap"'::jsonb; END IF;
 END IF;
 IF a='cancel' THEN p.status:='cancelled';
 ELSIF a='decline' THEN p.status:='declined';IF m.sender='user' THEN p.user_response:='declined';ELSE p.character_response:='declined'; END IF;
 ELSIF cardinality(missing)>0 THEN p.status:='awaiting_details';
 ELSIF jsonb_array_length(conflict)>0 THEN p.status:='proposed';
 ELSIF p.user_response='accepted' AND p.character_response='accepted' THEN p.status:=CASE WHEN old_status='in_progress' AND NOT changed_details THEN 'in_progress' ELSE 'accepted' END;
 ELSIF changed_details THEN p.status:='rescheduled';
 ELSE p.status:='proposed'; END IF;
 IF p_payload ? 'followthrough' OR p.followthrough ? 'kind' THEN p.followthrough:=jsonb_build_object('kind',coalesce(p_payload->>'followthrough',p.followthrough->>'kind'),'status',CASE WHEN coalesce(p_payload->>'followthrough',p.followthrough->>'kind')='host_unavailable' THEN 'unavailable_no_host_tool' WHEN p.place_key IS NOT NULL AND p.time_local IS NOT NULL THEN 'map_available_no_verified_address' ELSE 'awaiting_details' END,'source',coalesce(p.followthrough->>'source',m.id::text)); END IF;
 UPDATE social_plans SET place_key=p.place_key,date_local=p.date_local,time_local=p.time_local,starts_at=start_at,ends_at=end_at,status=p.status,user_response=p.user_response,character_response=p.character_response,conflicts=conflict,missing_details=missing,followthrough=p.followthrough,last_message_id=m.id,version=version+1 WHERE user_id=p_user AND id=p.id;
 IF p.status<>'in_progress' THEN DELETE FROM social_presence WHERE user_id=p_user AND plan_id=p.id; END IF;
 INSERT INTO social_rsvps(user_id,plan_id,character_key,response,channel,reason) VALUES(p_user,p.id,who,p.character_response,'conversation','Explicit conversation evidence; no attendance inferred') ON CONFLICT(user_id,plan_id,character_key) DO UPDATE SET response=excluded.response,updated_at=p_now;
 INSERT INTO calendar_evidence VALUES(p_user,m.id,p.id,a,p_payload,p_now);
 INSERT INTO calendar_transitions VALUES(p_user,md5(m.id::text||':transition')::uuid,p.id,old_status,p.status,a,p_now) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('id',p.id,'status',p.status);
END $$;
