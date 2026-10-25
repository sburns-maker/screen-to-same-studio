-- Additive canonical scheduling: social_plans remains the authoritative event table.
ALTER TABLE public.social_plans ADD COLUMN description text NOT NULL DEFAULT '',ADD COLUMN time_zone text NOT NULL DEFAULT 'America/New_York',ADD COLUMN time_hint text,ADD COLUMN parent_plan_id uuid;
ALTER TABLE social_plans ADD CONSTRAINT plan_parent_owner FOREIGN KEY(user_id,parent_plan_id) REFERENCES social_plans(user_id,id),ADD CONSTRAINT plan_not_self_parent CHECK(parent_plan_id IS DISTINCT FROM id);
CREATE INDEX calendar_owner_start ON social_plans(user_id,starts_at);
CREATE TABLE public.calendar_action_receipts(user_id uuid NOT NULL,source_kind text NOT NULL CHECK(source_kind IN('message','experience')),source_id uuid NOT NULL,ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 3),plan_id uuid,result jsonb NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,source_kind,source_id,ordinal),FOREIGN KEY(user_id,plan_id) REFERENCES social_plans(user_id,id));
ALTER TABLE calendar_action_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_receipts_owner ON calendar_action_receipts FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON calendar_action_receipts TO authenticated; GRANT ALL ON calendar_action_receipts TO service_role;
CREATE FUNCTION public.calendar_contract_status() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT 38 $$;

CREATE FUNCTION public.calendar_event_action(p_user uuid,p_kind text,p_source uuid,p_ordinal integer,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p social_plans; parent social_plans; cid uuid; who text; speaker text; source_body text; clock timestamptz; receipt calendar_action_receipts; result jsonb; a text; pid uuid; old_status text; fresh boolean:=false; changed boolean:=false; start_at timestamptz; end_at timestamptz; missing text[]:='{}'; v_conflicts jsonb:='[]'; prior_user uuid; prior_body text; uid uuid; kw text; duration integer; protected boolean; previous_finalize text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 IF p_kind NOT IN('message','experience') OR p_ordinal NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'invalid source'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 SELECT * INTO receipt FROM calendar_action_receipts WHERE user_id=p_user AND source_kind=p_kind AND source_id=p_source AND ordinal=p_ordinal;
 IF FOUND THEN RETURN receipt.result; END IF;
 IF p_kind='message' THEN
  SELECT conversation_id,sender,body,created_at INTO cid,speaker,source_body,clock FROM messages WHERE user_id=p_user AND id=p_source AND visible_at<=p_now;
 ELSE
  SELECT e.conversation_id,m.source,m.body,e.start_at+make_interval(mins=>least(180,(SELECT count(*)::integer*4 FROM living_experience_moments x WHERE x.user_id=p_user AND x.experience_id=e.id AND x.source='user' AND x.ordinal<=m.ordinal))) INTO cid,speaker,source_body,clock
  FROM living_experience_moments m JOIN living_experiences e ON e.user_id=m.user_id AND e.id=m.experience_id WHERE m.user_id=p_user AND m.id=p_source AND m.source IN('user','character');
 END IF;
 SELECT ch.key INTO who FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.id=cid AND c.user_id=p_user;
 IF who IS NULL OR source_body IS NULL THEN RAISE EXCEPTION 'visible owned scheduling evidence required'; END IF;
 a:=p_payload->>'action';
 IF a NOT IN('none','invite','accept','details','reschedule','decline','cancel') THEN RAISE EXCEPTION 'unsupported scheduling action'; END IF;
 IF a='none' THEN result:='{}';
 ELSE
  IF nullif(p_payload->>'parentPlanId','') IS NOT NULL THEN
   SELECT * INTO parent FROM social_plans WHERE user_id=p_user AND id=(p_payload->>'parentPlanId')::uuid AND conversation_id=cid AND organizer=who FOR UPDATE;
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM living_experiences e WHERE e.user_id=p_user AND e.plan_id=parent.id AND e.mode='interactive' AND e.state IN('interactive','paused','completed')) THEN RAISE EXCEPTION 'owned actual parent experience required'; END IF;
  END IF;
  IF a='invite' THEN
   pid:=md5(p_user::text||':'||p_kind||':'||p_source::text||':'||p_ordinal::text||':invitation')::uuid;fresh:=true;
   IF p_payload->>'category' NOT IN('walk','coffee','dinner','book_club','meetup') OR length(trim(coalesce(p_payload->>'title','')))=0 THEN RAISE EXCEPTION 'valid activity required'; END IF;
   INSERT INTO social_plans(user_id,id,organizer,title,description,starts_at,ends_at,origin,conversation_id,category,proposer,source_message_id,last_message_id,user_response,character_response,parent_plan_id)
    VALUES(p_user,pid,who,left(p_payload->>'title',120),left(coalesce(p_payload->>'description',''),600),NULL,NULL,'conversation',cid,p_payload->>'category',CASE WHEN speaker='user' THEN 'user' ELSE who END,CASE WHEN p_kind='message' THEN p_source END,CASE WHEN p_kind='message' THEN p_source END,CASE WHEN speaker='user' THEN 'accepted' ELSE 'invited' END,CASE WHEN speaker<>'user' THEN 'accepted' ELSE 'invited' END,parent.id);
   INSERT INTO town_known_plans VALUES(p_user,pid) ON CONFLICT DO NOTHING;
  ELSE pid:=(p_payload->>'planId')::uuid; END IF;
  SELECT * INTO p FROM social_plans WHERE user_id=p_user AND id=pid AND conversation_id=cid AND organizer=who FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'owned conversation event required'; END IF;
  IF p.parent_plan_id IS NOT NULL THEN SELECT * INTO parent FROM social_plans WHERE user_id=p_user AND id=p.parent_plan_id AND conversation_id=cid;END IF;
  old_status:=p.status;
  IF p.status IN('completed','missed','declined','cancelled') THEN
   result:=jsonb_build_object('id',p.id,'status',p.status,'unchanged',true);
  ELSE
   protected:=EXISTS(SELECT 1 FROM living_experiences e WHERE e.user_id=p_user AND e.plan_id=p.id AND e.state IN('interactive','paused','auto_running'));
   changed:=NOT fresh AND ((p_payload->>'date' IS NOT NULL AND p.date_local IS DISTINCT FROM p_payload->>'date') OR (p_payload->>'time' IS NOT NULL AND p.time_local IS DISTINCT FROM p_payload->>'time') OR (p_payload->>'place' IS NOT NULL AND p.place_key IS NOT NULL AND p.place_key IS DISTINCT FROM p_payload->>'place') OR (p_payload->>'timeZone' IS NOT NULL AND p.time_zone IS DISTINCT FROM p_payload->>'timeZone') OR (p_payload->>'durationMinutes' IS NOT NULL AND p.duration_minutes<>(p_payload->>'durationMinutes')::integer) OR (p_payload->>'category' IS NOT NULL AND p.category IS DISTINCT FROM p_payload->>'category') OR (nullif(p_payload->>'timeHint','') IS NOT NULL AND p_payload->>'timeHint'<>'after_parent' AND p_payload->>'time' IS NULL AND p.time_local IS NOT NULL));
      IF protected THEN result:=jsonb_build_object('id',p.id,'status',p.status,'unchanged',true,'blocked',changed OR a IN('cancel','decline','reschedule'),'reason','active_experience_requires_explicit_resolution');
   ELSE
    IF p_payload->>'place' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM world_places WHERE user_id=p_user AND key=p_payload->>'place' AND metadata->>'public'='true') THEN RAISE EXCEPTION 'registered public venue required'; END IF;
    IF p_payload->>'timeZone' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_payload->>'timeZone') THEN RAISE EXCEPTION 'valid IANA timezone required'; END IF;
    IF p_payload->>'durationMinutes' IS NOT NULL AND (p_payload->>'durationMinutes')::integer NOT BETWEEN 15 AND 360 THEN RAISE EXCEPTION 'invalid duration'; END IF;
    IF p_payload->>'category' IS NOT NULL AND p_payload->>'category' NOT IN('walk','coffee','dinner','book_club','meetup') THEN RAISE EXCEPTION 'valid activity required'; END IF;
    p.category:=coalesce(p_payload->>'category',p.category);p.title:=coalesce(nullif(trim(p_payload->>'title'),''),p.title);
    p.date_local:=coalesce(p_payload->>'date',p.date_local);p.time_local:=coalesce(p_payload->>'time',p.time_local);p.time_zone:=coalesce(p_payload->>'timeZone',p.time_zone);p.place_key:=coalesce(p_payload->>'place',p.place_key);p.duration_minutes:=coalesce((p_payload->>'durationMinutes')::integer,p.duration_minutes);p.time_hint:=coalesce(p_payload->>'timeHint',p.time_hint);
    IF p_payload->>'time' IS NOT NULL THEN p.time_hint:=NULL;
    ELSIF nullif(p_payload->>'timeHint','') IS NOT NULL AND p_payload->>'timeHint'<>'after_parent' THEN p.time_local:=NULL;END IF;
    IF a IN('accept','reschedule') OR changed THEN
     IF speaker='user' THEN p.user_response:='accepted';IF changed THEN p.character_response:='invited'; END IF;
     ELSE p.character_response:='accepted';IF changed THEN p.user_response:='invited'; END IF; END IF;
    END IF;
    -- An exact acceptance of the current proposal may be carried with a structured character action.
    IF speaker<>'user' AND NOT changed AND nullif(p_payload->>'userQuote','') IS NOT NULL THEN
     IF p_kind='message' THEN SELECT id,body INTO prior_user,prior_body FROM messages WHERE user_id=p_user AND conversation_id=cid AND sender='user' AND visible_at<=p_now AND created_at<=clock ORDER BY created_at DESC,id DESC LIMIT 1;
     ELSE SELECT m.id,m.body INTO prior_user,prior_body FROM living_experience_moments m JOIN living_experiences e ON e.user_id=m.user_id AND e.id=m.experience_id WHERE m.user_id=p_user AND e.conversation_id=cid AND m.source='user' AND m.experience_id=(SELECT experience_id FROM living_experience_moments WHERE user_id=p_user AND id=p_source) ORDER BY m.ordinal DESC LIMIT 1; END IF;
     IF position(p_payload->>'userQuote' IN coalesce(prior_body,''))=0 OR prior_body !~* '^(yes\y|yeah\y|yep\y|absolutely\y|sure\y|definitely\y|sounds (good|great|perfect)\y|that (works|sounds good)\y|i.d love to\y|i would love to\y|count me in\y|let.s do it\y|i.m in\y|you bet\y)' OR prior_body ~* '\y(maybe|might|can.t|cannot|but not|if we|if i)\y' THEN RAISE EXCEPTION 'current explicit user acceptance required'; END IF;
     p.user_response:='accepted';
    END IF;
    IF parent.id IS NOT NULL AND ((p.date_local IS NULL AND p.time_local IS NULL) OR (p.time_hint='after_parent' AND p_payload->>'date' IS NULL AND p_payload->>'time' IS NULL)) THEN
     start_at:=parent.ends_at+make_interval(mins=>calendar_travel_buffer(p_user,parent.place_key,p.place_key));
     p.date_local:=to_char(start_at AT TIME ZONE p.time_zone,'YYYY-MM-DD');p.time_local:=to_char(start_at AT TIME ZONE p.time_zone,'HH24:MI');p.time_hint:='after_parent';
    END IF;
    IF p.date_local IS NULL THEN missing:=array_append(missing,'date'); END IF;
    IF p.time_local IS NULL THEN missing:=array_append(missing,'time (include AM/PM)'); END IF;
    IF p.place_key IS NULL THEN missing:=array_append(missing,'venue'); END IF;
    IF p.date_local IS NOT NULL AND p.time_local IS NOT NULL THEN
     BEGIN start_at:=(p.date_local||' '||p.time_local)::timestamp AT TIME ZONE p.time_zone; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'valid local calendar date and time required'; END;
     IF to_char(start_at AT TIME ZONE p.time_zone,'YYYY-MM-DD HH24:MI')<>p.date_local||' '||p.time_local OR EXISTS(SELECT 1 FROM generate_series(-120,120,15) minute_offset WHERE minute_offset<>0 AND to_char((start_at+make_interval(mins=>minute_offset)) AT TIME ZONE p.time_zone,'YYYY-MM-DD HH24:MI')=p.date_local||' '||p.time_local) THEN start_at:=NULL;missing:=array_append(missing,'unambiguous local time'); END IF;
     IF start_at+interval '4 hours'<clock AND old_status NOT IN('accepted','in_progress') AND parent.id IS NULL THEN missing:=array_append(missing,'future time confirmation'); END IF;
    END IF;
    end_at:=start_at+make_interval(mins=>p.duration_minutes);
    IF start_at IS NOT NULL AND NOT(old_status IN('accepted','in_progress') AND NOT changed) THEN
     IF coalesce((p_payload->>'schedule_ok')::boolean,false)=false THEN v_conflicts:=v_conflicts||'"character_schedule_or_venue_hours"'::jsonb; END IF;
     IF EXISTS(SELECT 1 FROM social_plans other WHERE other.user_id=p_user AND other.id<>p.id AND other.starts_at IS NOT NULL AND (other.status IN('accepted','in_progress','active') OR (other.origin='legacy' AND other.status='proposed')) AND (other.origin='legacy' OR other.conversation_id IS NOT NULL) AND (other.origin='conversation' AND other.user_response='accepted' AND other.character_response='accepted' OR other.origin='legacy' AND EXISTS(SELECT 1 FROM social_rsvps r WHERE r.user_id=p_user AND r.plan_id=other.id AND r.character_key=who AND r.response='accepted')) AND NOT(other.id=p.parent_plan_id AND start_at>=other.ends_at+make_interval(mins=>calendar_travel_buffer(p_user,other.place_key,p.place_key))) AND other.starts_at<end_at+make_interval(mins=>calendar_travel_buffer(p_user,other.place_key,p.place_key)) AND other.ends_at>start_at-make_interval(mins=>calendar_travel_buffer(p_user,other.place_key,p.place_key))) THEN v_conflicts:=v_conflicts||'"calendar_or_travel_overlap"'::jsonb; END IF;
    END IF;
    IF a='cancel' THEN p.status:='cancelled';
    ELSIF a='decline' THEN p.status:='declined';IF speaker='user' THEN p.user_response:='declined';ELSE p.character_response:='declined'; END IF;
    ELSIF cardinality(missing)>0 THEN p.status:='awaiting_details';
    ELSIF jsonb_array_length(v_conflicts)>0 THEN p.status:='proposed';
    ELSIF p.user_response='accepted' AND p.character_response='accepted' THEN p.status:='accepted';
    ELSIF changed THEN p.status:='rescheduled';ELSE p.status:='proposed'; END IF;
    IF p_payload ? 'followthrough' OR p.followthrough ? 'kind' THEN p.followthrough:=jsonb_build_object('kind',coalesce(p_payload->>'followthrough',p.followthrough->>'kind'),'status',CASE WHEN coalesce(p_payload->>'followthrough',p.followthrough->>'kind')='host_unavailable' THEN 'unavailable_no_host_tool' WHEN p.place_key IS NOT NULL AND p.time_local IS NOT NULL THEN 'map_available_no_verified_address' ELSE 'awaiting_details' END,'source',coalesce(p.followthrough->>'source',p_source::text)); END IF;
    UPDATE social_plans SET category=p.category,title=p.title,followthrough=p.followthrough,description=coalesce(p_payload->>'description',p.description),date_local=p.date_local,time_local=p.time_local,time_zone=p.time_zone,time_hint=p.time_hint,place_key=p.place_key,duration_minutes=p.duration_minutes,starts_at=start_at,ends_at=end_at,status=p.status,user_response=p.user_response,character_response=p.character_response,missing_details=missing,conflicts=v_conflicts,last_message_id=CASE WHEN p_kind='message' THEN p_source ELSE last_message_id END,version=version+1 WHERE user_id=p_user AND id=p.id;
    INSERT INTO social_rsvps(user_id,plan_id,character_key,response,channel,reason) VALUES(p_user,p.id,who,p.character_response,p_kind,'Canonical scheduling evidence; attendance not inferred') ON CONFLICT(user_id,plan_id,character_key) DO UPDATE SET response=excluded.response,updated_at=p_now;
    INSERT INTO calendar_transitions VALUES(p_user,md5(p_user::text||p_kind||p_source::text||p_ordinal::text||':transition')::uuid,p.id,old_status,p.status,a,p_now);
    result:=jsonb_build_object('id',p.id,'status',p.status,'missing_details',missing,'conflicts',v_conflicts);
   END IF;
  END IF;
 END IF;
 INSERT INTO calendar_action_receipts VALUES(p_user,p_kind,p_source,p_ordinal,pid,result,p_payload,p_now);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.calendar_apply(p_user uuid,p_message uuid,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 IF EXISTS(SELECT 1 FROM calendar_evidence WHERE user_id=p_user AND message_id=p_message) THEN RETURN '{"replayed":true}'; END IF;
 r:=calendar_event_action(p_user,'message',p_message,0,p_payload,p_now);
 INSERT INTO calendar_evidence VALUES(p_user,p_message,(r->>'id')::uuid,p_payload->>'action',p_payload,p_now);
 RETURN r;
END $$;

CREATE FUNCTION public.calendar_apply_actions(p_user uuid,p_kind text,p_source uuid,p_actions jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE action jsonb;r jsonb;results jsonb:='[]';i integer:=1;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 IF jsonb_typeof(p_actions)<>'array' OR jsonb_array_length(p_actions)>3 THEN RAISE EXCEPTION 'bounded scheduling actions required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 FOR action IN SELECT value FROM jsonb_array_elements(p_actions) LOOP r:=calendar_event_action(p_user,p_kind,p_source,i,action,p_now);results:=results||jsonb_build_array(r);i:=i+1;END LOOP;
 IF p_kind='message' AND jsonb_array_length(p_actions)>0 THEN INSERT INTO calendar_evidence VALUES(p_user,p_source,(results->0->>'id')::uuid,'structured',jsonb_build_object('results',results),p_now) ON CONFLICT DO NOTHING; END IF;
 RETURN results;
END $$;

CREATE OR REPLACE FUNCTION public.calendar_pending(p_user uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(x ORDER BY x.created_at,x.conversation_id,CASE WHEN x.sender='user' THEN 0 ELSE 1 END,x.id),'[]') FROM (
 SELECT m.id,m.conversation_id,m.sender,m.body,m.created_at,m.metadata,ch.key character_key
 FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.user_id=m.user_id JOIN characters ch ON ch.id=c.character_id
 WHERE m.user_id=p_user AND m.visible_at<=p_now AND m.created_at >= (SELECT installed_at FROM interactive_world_installation)
 AND NOT EXISTS(SELECT 1 FROM calendar_evidence e WHERE e.user_id=p_user AND e.message_id=m.id)
 ORDER BY m.created_at,m.conversation_id,CASE WHEN m.sender='user' THEN 0 ELSE 1 END,m.id LIMIT 120) x;
$$;

-- The context memory mirrors only this event's current status; no attendance is invented.
CREATE FUNCTION public.calendar_context_memory() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.conversation_id IS NOT NULL AND NEW.origin='conversation' AND NEW.status IN('accepted','in_progress','completed','cancelled','declined','rescheduled') AND EXISTS(SELECT 1 FROM conversations WHERE id=NEW.conversation_id AND user_id=NEW.user_id) THEN
 INSERT INTO memories(id,user_id,conversation_id,memory_type,summary,importance) VALUES(md5(NEW.user_id::text||NEW.id::text||':calendar-context-v38')::uuid,NEW.user_id,NEW.conversation_id,'relationship','[Canonical plan context, not proof of attendance] '||NEW.title||'; status '||NEW.status||'; scheduled '||coalesce(NEW.date_local,'undecided')||' '||coalesce(NEW.time_local,'undecided')||' '||NEW.time_zone||'; venue '||coalesce(NEW.place_key,'undecided')||'; proposed by '||coalesce(NEW.proposer,NEW.organizer),4) ON CONFLICT(id) DO UPDATE SET summary=excluded.summary;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER canonical_plan_context AFTER INSERT OR UPDATE OF status,starts_at,place_key ON social_plans FOR EACH ROW EXECUTE FUNCTION calendar_context_memory();

-- Commit scheduling effects inside the EXISTING text/media outbox transaction.
ALTER FUNCTION public.deliver_photo_turn(uuid) RENAME TO deliver_photo_turn_before_calendar38;
CREATE FUNCTION public.deliver_photo_turn(p_job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE detail jsonb;r jsonb;source uuid;
BEGIN
 SELECT j.detail INTO detail FROM job_runs j WHERE j.id=p_job_id;
 IF detail->>'userId' IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||(detail->>'userId'),0)); END IF;
 SELECT j.detail INTO detail FROM job_runs j WHERE j.id=p_job_id FOR UPDATE;
 r:=deliver_photo_turn_before_calendar38(p_job_id);
 IF coalesce((r->>'count')::integer,0)>0 AND jsonb_array_length(coalesce(detail->'plan'->'scheduleActions','[]'))>0 THEN
  source:=(detail->'plan'->'rows'->0->>'id')::uuid;
  PERFORM calendar_apply_actions((detail->>'userId')::uuid,'message',source,detail->'plan'->'scheduleActions',now());
 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION deliver_photo_turn_before_calendar38(uuid) FROM service_role;

-- Extend the experience transaction; preserve its locking, fencing and outcome logic.
ALTER FUNCTION public.experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz) RENAME TO experience_command_before_calendar38;
CREATE FUNCTION public.experience_command(p_user uuid,p_plan uuid,p_id uuid,p_command text,p_revision integer,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb;op experience_operations;ex living_experiences;previous_finalize text;already_done boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 IF p_command IN('claim','automatic') AND EXISTS(SELECT 1 FROM social_plans child JOIN living_experiences parent ON parent.user_id=child.user_id AND parent.plan_id=child.parent_plan_id WHERE child.user_id=p_user AND child.id=p_plan AND parent.state<>'completed') THEN RAISE EXCEPTION 'Finish the earlier experience before continuing this outing'; END IF;
 SELECT status='done' INTO already_done FROM experience_operations WHERE user_id=p_user AND id=p_id;
 r:=experience_command_before_calendar38(p_user,p_plan,p_id,p_command,p_revision,p_payload,p_now);
 IF p_command='claim' AND EXISTS(SELECT 1 FROM living_experiences WHERE user_id=p_user AND plan_id=p_plan AND state IN('interactive','paused')) THEN
  SELECT * INTO ex FROM living_experiences WHERE user_id=p_user AND plan_id=p_plan;
  previous_finalize:=current_setting('app.experience_finalize',true);PERFORM set_config('app.experience_finalize','on',true);
  UPDATE social_plans SET status='in_progress',version=version+CASE WHEN status='in_progress' THEN 0 ELSE 1 END WHERE user_id=p_user AND id=p_plan;
  PERFORM set_config('app.experience_finalize',coalesce(previous_finalize,''),true);
 END IF;
 IF p_command='commit' AND NOT coalesce(already_done,false) THEN
  SELECT * INTO op FROM experience_operations WHERE user_id=p_user AND id=p_id;
  IF op.kind='turn' AND jsonb_array_length(coalesce(p_payload->'scheduleActions','[]'))>0 THEN PERFORM calendar_apply_actions(p_user,'experience',p_id,p_payload->'scheduleActions',p_now); END IF;
  IF op.kind<>'turn' THEN
   -- A days-late parent completion must not let the worker steal its follow-up immediately.
   -- Keep fictional appointment times; grant the user a real four-hour continuation window.
   PERFORM experience_seed(p_user,p_now);
   UPDATE living_experiences child SET claim_deadline=greatest(child.claim_deadline,p_now+interval '4 hours'),revision=child.revision+1,updated_at=p_now
   WHERE child.user_id=p_user AND child.state='scheduled' AND child.claimed_at IS NULL AND EXISTS(SELECT 1 FROM social_plans cp WHERE cp.user_id=p_user AND cp.id=child.plan_id AND cp.parent_plan_id=p_plan);
  END IF;

 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION experience_command_before_calendar38(uuid,uuid,uuid,text,integer,jsonb,timestamptz) FROM service_role;

CREATE FUNCTION public.calendar_followup_ready(p_user uuid,p_plan uuid,p_now timestamptz) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM social_plans child JOIN social_plans parent ON parent.user_id=child.user_id AND parent.id=child.parent_plan_id JOIN living_experiences e ON e.user_id=parent.user_id AND e.plan_id=parent.id WHERE child.user_id=p_user AND child.id=p_plan AND child.status='accepted' AND e.mode='interactive' AND e.state='completed' AND e.updated_at>=p_now-interval '4 hours' AND child.starts_at>=parent.ends_at AND child.starts_at<=parent.ends_at+interval '3 hours')
$$;
DO $$ DECLARE d text;BEGIN
 SELECT pg_get_functiondef('experience_command_before_calendar38(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure) INTO d;
 IF position('p_now>=e.start_at AND p_now<e.claim_deadline' IN d)=0 THEN RAISE EXCEPTION 'Unknown experience claim predicate';END IF;
 IF position('other.id<>p.id AND other.status IN(''accepted'',''in_progress'',''active'')' IN d)=0 THEN RAISE EXCEPTION 'Unknown experience overlap predicate'; END IF;
 d:=replace(d,'other.id<>p.id AND other.status IN(''accepted'',''in_progress'',''active'')','other.id<>p.id AND (other.origin=''conversation'' AND other.user_response=''accepted'' AND other.character_response=''accepted'' OR other.origin=''legacy'' AND EXISTS(SELECT 1 FROM social_rsvps r WHERE r.user_id=p_user AND r.plan_id=other.id AND r.character_key=p.organizer AND r.response=''accepted'')) AND other.status IN(''accepted'',''in_progress'',''active'')');
 IF position('SET claim_deadline=start_at+make_interval(hours=>' IN d)=0 THEN RAISE EXCEPTION 'Unknown experience window predicate'; END IF;
 d:=replace(d,'SET claim_deadline=start_at+make_interval(hours=>','SET claim_deadline=greatest(start_at,coalesce((SELECT pe.updated_at FROM living_experiences pe WHERE pe.user_id=p_user AND pe.plan_id=p.parent_plan_id AND pe.state=''completed''),start_at))+make_interval(hours=>');
 EXECUTE replace(d,'p_now>=e.start_at AND p_now<e.claim_deadline','((p_now>=e.start_at AND p_now<e.claim_deadline) OR calendar_followup_ready(p_user,p_plan,p_now))');
END $$;

-- A dependent outing cannot be simulated while its actual parent is unfinished.
DO $$ DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('experience_candidates(uuid,timestamptz)'::regprocedure) INTO definition;
 IF position('WHERE e.user_id=p_user AND c.real_time_mode' IN definition)=0 THEN RAISE EXCEPTION 'Unknown experience candidate predicate';END IF;
 EXECUTE replace(definition,'WHERE e.user_id=p_user AND c.real_time_mode','WHERE e.user_id=p_user AND (p.parent_plan_id IS NULL OR EXISTS(SELECT 1 FROM living_experiences parent WHERE parent.user_id=e.user_id AND parent.plan_id=p.parent_plan_id AND parent.state=''completed'')) AND c.real_time_mode');
END $$;

DO $$ DECLARE f regprocedure;BEGIN FOREACH f IN ARRAY ARRAY['calendar_contract_status()'::regprocedure,'calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz)'::regprocedure,'calendar_apply_actions(uuid,text,uuid,jsonb,timestamptz)'::regprocedure,'calendar_apply(uuid,uuid,jsonb,timestamptz)'::regprocedure,'deliver_photo_turn(uuid)'::regprocedure,'experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure,'calendar_followup_ready(uuid,uuid,timestamptz)'::regprocedure] LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);END LOOP;END $$;
-- Subscribe only where the deployment already provides Supabase Realtime. RLS remains owner-only.
DO $$ DECLARE t text;BEGIN IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN FOREACH t IN ARRAY ARRAY['social_plans','living_experiences'] LOOP IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t); END IF; END LOOP; END IF;END $$;
