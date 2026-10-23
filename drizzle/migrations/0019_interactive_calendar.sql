-- Additive conversation calendar / venue sessions. Review in a transaction; no backfill of old chat.
ALTER TABLE public.social_plans
  ADD COLUMN origin text NOT NULL DEFAULT 'legacy' CHECK(origin IN('legacy','conversation')),
  ADD COLUMN conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN category text NOT NULL DEFAULT 'meetup',
  ADD COLUMN proposer text,
  ADD COLUMN date_local text,
  ADD COLUMN time_local text,
  ADD COLUMN duration_minutes integer NOT NULL DEFAULT 60 CHECK(duration_minutes BETWEEN 15 AND 360),
  ADD COLUMN user_response text NOT NULL DEFAULT 'invited',
  ADD COLUMN character_response text NOT NULL DEFAULT 'invited',
  ADD COLUMN missing_details text[] NOT NULL DEFAULT '{}',
  ADD COLUMN conflicts jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN followthrough jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN last_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.social_plans ALTER COLUMN starts_at DROP NOT NULL, ALTER COLUMN ends_at DROP NOT NULL, ALTER COLUMN place_key DROP NOT NULL;
ALTER TABLE public.social_plans DROP CONSTRAINT social_plans_status_check;
ALTER TABLE public.social_plans ADD CONSTRAINT social_plans_status_check CHECK(status IN('proposed','active','completed','missed','cancelled','awaiting_details','accepted','declined','rescheduled','in_progress'));
ALTER TABLE public.social_plans DROP CONSTRAINT social_plans_user_attendance_check;
ALTER TABLE public.social_plans ADD CONSTRAINT social_plans_user_attendance_check CHECK(user_attendance IN('not_reported','arrived','participated','left'));
ALTER TABLE public.social_plans ADD CONSTRAINT legacy_plan_details CHECK(origin<>'legacy' OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND place_key IS NOT NULL));
CREATE TABLE public.interactive_world_installation(id boolean PRIMARY KEY DEFAULT true CHECK(id),installed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.interactive_world_installation DEFAULT VALUES;
REVOKE ALL ON public.interactive_world_installation FROM PUBLIC,authenticated;
GRANT ALL ON public.interactive_world_installation TO service_role;
CREATE TABLE public.calendar_evidence(user_id uuid NOT NULL,message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,plan_id uuid,action text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,message_id),FOREIGN KEY(user_id,plan_id) REFERENCES public.social_plans(user_id,id));
CREATE TABLE public.calendar_transitions(user_id uuid NOT NULL,id uuid NOT NULL,plan_id uuid NOT NULL,from_status text,to_status text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),FOREIGN KEY(user_id,plan_id) REFERENCES public.social_plans(user_id,id));
CREATE TABLE public.venue_sessions(user_id uuid NOT NULL,id uuid NOT NULL,place_key text NOT NULL,arrived_at timestamptz NOT NULL,departed_at timestamptz,state jsonb NOT NULL DEFAULT '{}',PRIMARY KEY(user_id,id),FOREIGN KEY(user_id,place_key) REFERENCES public.world_places(user_id,key));
CREATE UNIQUE INDEX one_active_venue_session ON public.venue_sessions(user_id) WHERE departed_at IS NULL;
CREATE TABLE public.venue_actions(user_id uuid NOT NULL,id uuid NOT NULL,session_id uuid NOT NULL,plan_id uuid,action text NOT NULL,detail text NOT NULL DEFAULT '',result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),FOREIGN KEY(user_id,session_id) REFERENCES public.venue_sessions(user_id,id),FOREIGN KEY(user_id,plan_id) REFERENCES public.social_plans(user_id,id));
CREATE INDEX calendar_sync_pending ON public.messages(user_id,created_at,visible_at);
CREATE INDEX conversation_plans_current ON public.social_plans(user_id,conversation_id,created_at) WHERE origin='conversation';
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['calendar_evidence','calendar_transitions','venue_sessions','venue_actions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY owner_read ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
END LOOP; END $$;
CREATE FUNCTION public.interactive_world_status() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT 19 $$;
CREATE FUNCTION public.calendar_pending(p_user uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(x ORDER BY x.created_at,x.id),'[]') FROM (
 SELECT m.id,m.conversation_id,m.sender,m.body,m.created_at,m.metadata,ch.key character_key
 FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.user_id=m.user_id JOIN characters ch ON ch.id=c.character_id
 WHERE m.user_id=p_user AND m.visible_at<=p_now AND m.created_at >= (SELECT installed_at FROM interactive_world_installation)
 AND NOT EXISTS(SELECT 1 FROM calendar_evidence e WHERE e.user_id=p_user AND e.message_id=m.id)
 ORDER BY m.created_at,m.id LIMIT 120) x;
$$;
-- Same geographic approximation as existing travelMinutes, with a conservative floor.
CREATE FUNCTION public.calendar_travel_buffer(p_user uuid,p_from text,p_to text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH coords AS (SELECT (a.metadata->>'latitude')::double precision lat1,(a.metadata->>'longitude')::double precision lon1,(b.metadata->>'latitude')::double precision lat2,(b.metadata->>'longitude')::double precision lon2 FROM world_places a JOIN world_places b ON b.user_id=a.user_id WHERE a.user_id=p_user AND a.key=p_from AND b.key=p_to)
 SELECT coalesce((SELECT greatest(30,least(120,ceil(6371*2*asin(least(1,sqrt(power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2))))/35*60+5)::integer)) FROM coords),30);
$$;
REVOKE ALL ON FUNCTION public.calendar_travel_buffer(uuid,text,text) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_travel_buffer(uuid,text,text) TO service_role;
CREATE FUNCTION public.calendar_apply(p_user uuid,p_message uuid,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
   VALUES(p_user,pid,who,NULL,left(p_payload->>'title',120),NULL,NULL,'conversation',m.conversation_id,p_payload->>'category',CASE WHEN m.sender='user' THEN 'user' ELSE who END,m.id,m.id,CASE WHEN m.sender='user' THEN 'accepted' ELSE 'invited' END,CASE WHEN m.sender='tess' THEN 'accepted' ELSE 'invited' END);
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
 IF a='reschedule' OR changed_details THEN
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
  IF EXISTS(SELECT 1 FROM social_plans sp WHERE sp.user_id=p_user AND sp.id<>p.id AND sp.starts_at IS NOT NULL AND (sp.origin='legacy' OR sp.conversation_id IS NOT NULL) AND sp.status IN('accepted','in_progress','proposed','active')
    AND (sp.origin='legacy' AND EXISTS(SELECT 1 FROM social_rsvps r WHERE r.user_id=p_user AND r.plan_id=sp.id AND r.character_key=who AND r.response='accepted') OR sp.origin='conversation' AND (sp.user_response='accepted' OR sp.organizer=who AND sp.character_response='accepted'))
    AND sp.starts_at<end_at+make_interval(mins=>public.calendar_travel_buffer(p_user,sp.place_key,p.place_key)) AND sp.ends_at>start_at-make_interval(mins=>public.calendar_travel_buffer(p_user,sp.place_key,p.place_key))) THEN conflict:=conflict||'"calendar_or_travel_overlap"'::jsonb; END IF;
 END IF;
 IF a='cancel' THEN p.status:='cancelled';
 ELSIF a='decline' THEN p.status:='declined';IF m.sender='user' THEN p.user_response:='declined';ELSE p.character_response:='declined'; END IF;
 ELSIF cardinality(missing)>0 THEN p.status:='awaiting_details';
 ELSIF jsonb_array_length(conflict)>0 THEN p.status:='proposed';
 ELSIF p.user_response='accepted' AND p.character_response='accepted' THEN p.status:=CASE WHEN old_status='in_progress' AND NOT changed_details THEN 'in_progress' ELSE 'accepted' END;
 ELSIF a='reschedule' OR changed_details THEN p.status:='rescheduled';
 ELSE p.status:='proposed'; END IF;
 IF p_payload ? 'followthrough' OR p.followthrough ? 'kind' THEN p.followthrough:=jsonb_build_object('kind',coalesce(p_payload->>'followthrough',p.followthrough->>'kind'),'status',CASE WHEN coalesce(p_payload->>'followthrough',p.followthrough->>'kind')='host_unavailable' THEN 'unavailable_no_host_tool' WHEN p.place_key IS NOT NULL AND p.time_local IS NOT NULL THEN 'map_available_no_verified_address' ELSE 'awaiting_details' END,'source',coalesce(p.followthrough->>'source',m.id::text)); END IF;
 UPDATE social_plans SET place_key=p.place_key,date_local=p.date_local,time_local=p.time_local,starts_at=start_at,ends_at=end_at,status=p.status,user_response=p.user_response,character_response=p.character_response,conflicts=conflict,missing_details=missing,followthrough=p.followthrough,last_message_id=m.id,version=version+1 WHERE user_id=p_user AND id=p.id;
 IF p.status<>'in_progress' THEN DELETE FROM social_presence WHERE user_id=p_user AND plan_id=p.id; END IF;
 INSERT INTO social_rsvps(user_id,plan_id,character_key,response,channel,reason) VALUES(p_user,p.id,who,p.character_response,'conversation','Explicit conversation evidence; no attendance inferred') ON CONFLICT(user_id,plan_id,character_key) DO UPDATE SET response=excluded.response,updated_at=p_now;
 INSERT INTO calendar_evidence VALUES(p_user,m.id,p.id,a,p_payload,p_now);
 INSERT INTO calendar_transitions VALUES(p_user,md5(m.id::text||':transition')::uuid,p.id,old_status,p.status,a,p_now) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('id',p.id,'status',p.status);
END $$;
-- Clock progression creates only character presence. User participation and completion require actions.
CREATE FUNCTION public.calendar_advance(p_user uuid,p_now timestamptz,p_blocked jsonb DEFAULT '[]') RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.social_plans; n integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 DELETE FROM social_presence pr WHERE pr.user_id=p_user AND (pr.until_at<=p_now OR EXISTS(SELECT 1 FROM social_plans sp WHERE sp.user_id=p_user AND sp.id=pr.plan_id AND sp.origin='conversation' AND sp.conversation_id IS NULL));
 FOR p IN SELECT * FROM social_plans WHERE user_id=p_user AND origin='conversation' AND conversation_id IS NOT NULL AND status IN('accepted','in_progress') AND starts_at<=p_now FOR UPDATE LOOP
  IF p.ends_at<=p_now THEN
   -- Explicitly unresolved if the user arrived; never infer completion from elapsed time.
   IF p.user_attendance='not_reported' THEN
    UPDATE social_plans SET status='missed',version=version+1 WHERE user_id=p_user AND id=p.id;
    INSERT INTO calendar_transitions VALUES(p_user,md5(p.id::text||p.version::text||':missed')::uuid,p.id,p.status,'missed','elapsed_without_recorded_attendance',p_now) ON CONFLICT DO NOTHING;
   END IF;
   CONTINUE;
  END IF;
  IF p_blocked ? p.organizer THEN
   DELETE FROM social_presence WHERE user_id=p_user AND plan_id=p.id;
   CONTINUE;
  END IF;
  IF EXISTS(SELECT 1 FROM social_presence WHERE user_id=p_user AND character_key=p.organizer AND plan_id<>p.id AND until_at>p_now) THEN CONTINUE;END IF;
  INSERT INTO social_presence VALUES(p_user,p.organizer,p.id,p.place_key,p.ends_at) ON CONFLICT(user_id,character_key) DO UPDATE SET plan_id=excluded.plan_id,place_key=excluded.place_key,until_at=excluded.until_at;
  UPDATE social_plans SET status='in_progress',version=version+CASE WHEN status='accepted' THEN 1 ELSE 0 END WHERE user_id=p_user AND id=p.id;
  IF p.status='accepted' THEN
   INSERT INTO calendar_transitions VALUES(p_user,md5(p.id::text||p.version::text||':started')::uuid,p.id,'accepted','in_progress','scheduled_character_arrival_user_not_assumed',p_now) ON CONFLICT DO NOTHING;
  END IF;
  n:=n+1;
 END LOOP;RETURN n;
END $$;
CREATE FUNCTION public.venue_session(p_user uuid,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pos public.town_presence; s public.venue_sessions; sid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('town:'||p_user::text,0));
 SELECT * INTO pos FROM town_presence WHERE user_id=p_user;
 UPDATE venue_sessions SET departed_at=p_now WHERE user_id=p_user AND departed_at IS NULL AND (place_key IS DISTINCT FROM pos.place_key OR arrived_at IS DISTINCT FROM pos.arrives_at);
 IF pos.place_key IS NULL OR pos.place_key='home:user' OR pos.arrives_at>p_now THEN RETURN NULL;END IF;
 sid:=md5(p_user::text||pos.place_key||pos.arrives_at::text)::uuid;
 INSERT INTO venue_sessions(user_id,id,place_key,arrived_at) VALUES(p_user,sid,pos.place_key,pos.arrives_at) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM venue_sessions WHERE user_id=p_user AND id=sid;
 RETURN to_jsonb(s);
END $$;
CREATE FUNCTION public.venue_act(p_user uuid,p_id uuid,p_place text,p_action text,p_detail text,p_now timestamptz,p_plan uuid DEFAULT NULL,p_character text DEFAULT NULL,p_quantity integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pos public.town_presence;s public.venue_sessions; result jsonb;p public.social_plans; who text;cid uuid;label text;action_list jsonb;present boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('town:'||p_user::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 IF EXISTS(SELECT 1 FROM venue_actions WHERE user_id=p_user AND id=p_id) THEN
  IF NOT EXISTS(SELECT 1 FROM venue_actions a JOIN venue_sessions vs ON vs.user_id=a.user_id AND vs.id=a.session_id WHERE a.user_id=p_user AND a.id=p_id AND a.action=p_action AND a.detail=coalesce(p_detail,'') AND a.plan_id IS NOT DISTINCT FROM p_plan AND vs.place_key=p_place AND (a.result->'request' IS NULL OR a.result->'request'=jsonb_build_object('character',p_character,'quantity',p_quantity))) THEN RAISE EXCEPTION 'Action ID belongs to a different request';END IF;
  SELECT a.result INTO result FROM venue_actions a WHERE a.user_id=p_user AND a.id=p_id;RETURN result||'{"replayed":true}';
 END IF;
 SELECT * INTO pos FROM town_presence WHERE user_id=p_user;
 IF pos.place_key IS DISTINCT FROM p_place OR pos.arrives_at>p_now THEN RAISE EXCEPTION 'Arrive before interacting';END IF;
 PERFORM public.venue_session(p_user,p_now);
 SELECT * INTO s FROM venue_sessions WHERE user_id=p_user AND place_key=p_place AND departed_at IS NULL;
 SELECT metadata->'activities',world_places.label INTO action_list,label FROM world_places WHERE user_id=p_user AND key=p_place;
 IF p_action NOT IN('leave','speak') AND NOT coalesce(action_list ? p_action,false) THEN RAISE EXCEPTION 'Activity not available at this venue';END IF;
 IF p_action='leave' THEN
  UPDATE venue_sessions SET departed_at=p_now WHERE user_id=p_user AND id=s.id;
  -- Existing travel still controls moving home. Leave only exits the scene, without teleporting.
  PERFORM public.town_command(p_user,p_id,'visit',jsonb_build_object('place','home:user','minutes',15),p_now);
 ELSE
  IF ((p_now AT TIME ZONE 'America/New_York')::time)<make_time((SELECT (metadata->>'opens')::int FROM world_places WHERE user_id=p_user AND key=p_place),0,0) OR
     ((p_now AT TIME ZONE 'America/New_York')::time)>=make_time((SELECT (metadata->>'closes')::int FROM world_places WHERE user_id=p_user AND key=p_place),0,0) THEN RAISE EXCEPTION 'The fictional venue is closed';END IF;
 END IF;
 IF p_plan IS NOT NULL THEN
  SELECT * INTO p FROM social_plans WHERE user_id=p_user AND id=p_plan AND origin='conversation' AND place_key=p_place AND status='in_progress' AND starts_at<=p_now AND ends_at>p_now FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A current accepted event here is required';END IF;
  SELECT EXISTS(SELECT 1 FROM social_presence WHERE user_id=p_user AND character_key=p.organizer AND plan_id=p.id AND place_key=p_place AND until_at>p_now) INTO present;
  IF NOT present THEN RAISE EXCEPTION 'Your companion has not arrived'; END IF;
  IF p_action IN('join','discuss','walk','order_food','order_coffee','seat','speak') THEN
   UPDATE social_plans SET user_attendance=CASE WHEN user_attendance='participated' OR p_action IN('join','discuss','speak') THEN 'participated' ELSE 'arrived' END WHERE user_id=p_user AND id=p.id;
  END IF;
 END IF;
 IF p_action='speak' THEN
  IF p_plan IS NULL OR p_character IS DISTINCT FROM p.organizer THEN RAISE EXCEPTION 'Confirmed companion required';END IF;
  SELECT c.id INTO cid FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=p_character;
  IF length(trim(p_detail)) NOT BETWEEN 1 AND 1500 THEN RAISE EXCEPTION 'Write a short message';END IF;
  INSERT INTO messages(id,conversation_id,user_id,sender,body,visible_at,created_at,metadata) VALUES(p_id,cid,p_user,'user',p_detail,p_now,p_now,jsonb_build_object('venue_session',s.id,'shared_plan',p.id,'virtual_place',p_place));
 END IF;
 result:=jsonb_build_object('action',p_action,'sessionId',s.id,'conversationId',cid,'place',p_place,'virtual',true,'request',jsonb_build_object('character',p_character,'quantity',p_quantity));
 IF p_action IN('order_coffee','order_food') THEN
  result:=result||jsonb_build_object('order',jsonb_build_object('item',CASE WHEN p_action='order_coffee' THEN 'coffee' ELSE 'meal' END,'quantity',LEAST(2,GREATEST(1,p_quantity)),'status','virtual_order_placed'));
  UPDATE venue_sessions SET state=state||jsonb_build_object('order',result->'order') WHERE user_id=p_user AND id=s.id;
 ELSIF p_action='seat' THEN UPDATE venue_sessions SET state=state||'{"position":"public seating"}'::jsonb WHERE user_id=p_user AND id=s.id;
 ELSIF p_action IN('join','discuss','walk','browse') THEN UPDATE venue_sessions SET state=state||jsonb_build_object('last_activity',p_action) WHERE user_id=p_user AND id=s.id;
 END IF;
 IF p_action='leave' THEN
  FOR p IN SELECT * FROM social_plans WHERE user_id=p_user AND origin='conversation' AND place_key=p_place AND status='in_progress' AND user_attendance='participated' AND EXISTS(SELECT 1 FROM venue_actions va WHERE va.user_id=p_user AND va.plan_id=social_plans.id AND va.session_id=s.id AND va.action IN('join','discuss','speak')) FOR UPDATE LOOP
   UPDATE social_plans SET status='completed',user_attendance='left',version=version+1 WHERE user_id=p_user AND id=p.id;
   DELETE FROM social_presence WHERE user_id=p_user AND plan_id=p.id;
   SELECT c.id INTO cid FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=p.organizer;
   INSERT INTO memories(id,user_id,conversation_id,memory_type,summary,importance) VALUES(md5(p.id::text||':user-participation')::uuid,p_user,cid,'relationship','You and the user participated in '||p.title||' at '||label||'. Their virtual arrival and participation were recorded; no other user actions or private NPC conversations are implied.',3) ON CONFLICT DO NOTHING;
   PERFORM public.shared_plan_notice(p_user,p.id,p.organizer,'completed','Participated with the user in '||p.title||' at '||label||'.',p_now);
   INSERT INTO calendar_transitions VALUES(p_user,md5(p_id::text||p.id::text)::uuid,p.id,'in_progress','completed','explicit_participation_and_departure',p_now) ON CONFLICT DO NOTHING;
  END LOOP;
 END IF;
 INSERT INTO venue_actions VALUES(p_user,p_id,s.id,p_plan,p_action,left(coalesce(p_detail,''),1500),result,p_now);
 RETURN result;
END $$;
-- Legacy functions retain their original behavior and cannot advance conversational drafts.
ALTER FUNCTION public.shared_world_command(uuid,uuid,text,jsonb,timestamptz,integer) RENAME TO shared_world_legacy_command;
CREATE FUNCTION public.shared_world_command(p_user_id uuid,p_plan_id uuid,p_command text,p_payload jsonb,p_now timestamptz,p_expected_version integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.social_plans;who text;start_at timestamptz;end_at timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user_id::text,0));
 SELECT * INTO p FROM social_plans WHERE user_id=p_user_id AND id=p_plan_id;
 IF p.origin='conversation' THEN RAISE EXCEPTION 'Use the conversation calendar lifecycle';END IF;
 IF p_command IN('create','reschedule','respond') THEN
  who:=CASE WHEN p_command='respond' THEN p_payload->>'character' ELSE coalesce(p_payload->>'organizer',p.organizer) END;
  start_at:=coalesce((p_payload->>'startsAt')::timestamptz,p.starts_at);end_at:=coalesce((p_payload->>'endsAt')::timestamptz,p.ends_at);
  IF EXISTS(SELECT 1 FROM social_plans sp WHERE sp.user_id=p_user_id AND sp.origin='conversation' AND sp.conversation_id IS NOT NULL AND sp.organizer=who AND sp.character_response='accepted' AND sp.status IN('accepted','in_progress') AND sp.starts_at<end_at+make_interval(mins=>public.calendar_travel_buffer(p_user_id,sp.place_key,coalesce(p_payload->>'place',p.place_key))) AND sp.ends_at>start_at-make_interval(mins=>public.calendar_travel_buffer(p_user_id,sp.place_key,coalesce(p_payload->>'place',p.place_key)))) THEN RAISE EXCEPTION 'invitee schedule conflict';END IF;
 END IF;
 RETURN public.shared_world_legacy_command(p_user_id,p_plan_id,p_command,p_payload,p_now,p_expected_version);
END $$;
DO $$ DECLARE f regprocedure; BEGIN FOREACH f IN ARRAY ARRAY['interactive_world_status()'::regprocedure,'calendar_pending(uuid,timestamptz)'::regprocedure,'calendar_apply(uuid,uuid,jsonb,timestamptz)'::regprocedure,'calendar_advance(uuid,timestamptz,jsonb)'::regprocedure,'venue_session(uuid,timestamptz)'::regprocedure,'venue_act(uuid,uuid,text,text,text,timestamptz,uuid,text,integer)'::regprocedure,'shared_world_command(uuid,uuid,text,jsonb,timestamptz,integer)'::regprocedure] LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,authenticated',f);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
END LOOP;END $$;
