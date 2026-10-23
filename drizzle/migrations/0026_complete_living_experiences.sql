-- Follow-up to published 0025. No historical backfill; enable explicitly after validation.
CREATE TABLE public.experience_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,installed_at timestamptz NOT NULL DEFAULT now(),window_hours integer NOT NULL DEFAULT 4 CHECK(window_hours BETWEEN 1 AND 24));
INSERT INTO experience_settings(singleton) VALUES(true);
ALTER TABLE experience_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON experience_settings TO service_role;
ALTER TABLE living_experiences ADD COLUMN last_failure text,ADD COLUMN synced_at timestamptz,ADD COLUMN plan_version integer;
CREATE TABLE public.experience_operations(
 user_id uuid NOT NULL,id uuid NOT NULL,experience_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('turn','finish','automatic')),
 body text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'running' CHECK(status IN('running','failed','done')),
 token uuid NOT NULL,attempts integer NOT NULL DEFAULT 1,lease_until timestamptz NOT NULL,revision integer NOT NULL,result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,experience_id) REFERENCES living_experiences(user_id,id) ON DELETE CASCADE);
CREATE TABLE public.experience_action_receipts(user_id uuid NOT NULL,id uuid NOT NULL,plan_id uuid NOT NULL,command text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id,plan_id) REFERENCES living_experiences(user_id,plan_id) ON DELETE CASCADE);
ALTER TABLE experience_action_receipts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON experience_action_receipts TO service_role;
CREATE UNIQUE INDEX experience_one_running ON experience_operations(user_id,experience_id) WHERE status='running';
ALTER TABLE experience_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY experience_operations_read ON experience_operations FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON experience_operations TO authenticated; GRANT ALL ON experience_operations TO service_role;
CREATE INDEX experience_due_index ON living_experiences(user_id,state,claim_deadline);

CREATE FUNCTION public.experience_status() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT CASE WHEN enabled THEN 26 ELSE 0 END FROM experience_settings $$;
CREATE FUNCTION public.experience_seed(p_user uuid,p_now timestamptz) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 IF NOT (SELECT enabled FROM experience_settings) THEN RETURN 0; END IF;
 INSERT INTO living_experiences(user_id,plan_id,conversation_id,start_at,claim_deadline,plan_version)
 SELECT p.user_id,p.id,p.conversation_id,p.starts_at,p.starts_at+make_interval(hours=>s.window_hours),p.version
 FROM social_plans p CROSS JOIN experience_settings s JOIN conversations c ON c.user_id=p_user
 WHERE p.user_id=p_user AND c.id=p.conversation_id AND p.status IN('accepted','in_progress')
 AND p.origin='conversation' AND p.place_key IS NOT NULL AND p.starts_at>=s.installed_at
 AND p.organizer IN('tess','maya','claire','jordan','ben') AND p.category IN('dinner','coffee','date','meetup','walk','book_club','trivia','outing','social')
 ORDER BY p.starts_at LIMIT 50 ON CONFLICT(user_id,plan_id) DO UPDATE
 SET start_at=excluded.start_at,claim_deadline=excluded.start_at+(living_experiences.claim_deadline-living_experiences.start_at),plan_version=excluded.plan_version,revision=living_experiences.revision+1,last_failure=NULL
 WHERE living_experiences.state='scheduled' AND living_experiences.claimed_at IS NULL AND living_experiences.plan_version IS DISTINCT FROM excluded.plan_version;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;

-- Filter exhausted/leased/practice candidates BEFORE limiting the batch, avoiding starvation.
CREATE FUNCTION public.experience_candidates(p_user uuid,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
 SELECT e.* FROM living_experiences e JOIN social_plans p ON p.user_id=e.user_id AND p.id=e.plan_id JOIN conversations c ON c.user_id=e.user_id AND c.id=e.conversation_id
 WHERE e.user_id=p_user AND c.real_time_mode AND p.status IN('accepted','in_progress') AND coalesce(e.last_failure,'') NOT LIKE 'Schedule or venue conflict%' AND e.state IN('scheduled','auto_running') AND e.claim_deadline<=p_now
 AND NOT EXISTS(SELECT 1 FROM experience_operations o WHERE o.user_id=e.user_id AND o.experience_id=e.id AND ((o.status='failed' AND o.attempts>=3) OR (o.status='running' AND o.lease_until>p_now)))
 ORDER BY e.claim_deadline LIMIT 1) x),'[]'::jsonb);
END $$;

-- All legacy calendar/venue writers must respect this ownership boundary.
CREATE FUNCTION public.protect_living_plan() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_setting('app.experience_finalize',true)='on' THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM living_experiences e WHERE e.user_id=OLD.user_id AND e.plan_id=OLD.id AND e.state IN('interactive','paused','auto_running','completed')) THEN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.place_key IS DISTINCT FROM OLD.place_key OR NEW.user_attendance IS DISTINCT FROM OLD.user_attendance THEN
   RAISE EXCEPTION 'Resolve the Living Experience before changing this plan';
  END IF;
 END IF;
 IF NEW.status IN('missed','completed') AND OLD.status IN('accepted','in_progress') AND EXISTS(SELECT 1 FROM experience_settings s WHERE s.enabled AND OLD.starts_at>=s.installed_at) AND OLD.organizer IN('tess','maya','claire','jordan','ben') AND OLD.origin='conversation' AND OLD.conversation_id IS NOT NULL AND OLD.place_key IS NOT NULL AND OLD.category IN('dinner','coffee','date','meetup','walk','book_club','trivia','outing','social') THEN
  RAISE EXCEPTION 'Living Experience owns completion of this outing';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_living_plan BEFORE UPDATE ON social_plans FOR EACH ROW EXECUTE FUNCTION protect_living_plan();
-- Skip protected plans inside older batch processors (rather than aborting unrelated plans).
DO $$ DECLARE f text; d text; needle text;
BEGIN
 FOREACH f IN ARRAY ARRAY['calendar_advance(uuid,timestamptz,jsonb)','venue_reconcile_departures(uuid,timestamptz)'] LOOP
  SELECT pg_get_functiondef(f::regprocedure) INTO d;
  needle:=CASE WHEN f LIKE 'venue_reconcile%' THEN 'FOR UPDATE LOOP'||chr(10)||'   UPDATE social_plans' ELSE 'FOR UPDATE LOOP' END;
  IF position(needle in d)=0 THEN RAISE EXCEPTION 'Unknown calendar processor signature %',f; END IF;
  d:=replace(d,needle,$guard$FOR UPDATE LOOP
   IF EXISTS(SELECT 1 FROM living_experiences x WHERE x.user_id=p.user_id AND x.plan_id=p.id)
    OR (p.organizer IN('tess','maya','claire','jordan','ben') AND p.origin='conversation' AND p.conversation_id IS NOT NULL AND p.place_key IS NOT NULL AND p.category IN('dinner','coffee','date','meetup','walk','book_club','trivia','outing','social') AND EXISTS(SELECT 1 FROM experience_settings s WHERE s.enabled AND p.starts_at>=s.installed_at)) THEN CONTINUE; END IF;
$guard$ || CASE WHEN f LIKE 'venue_reconcile%' THEN '   UPDATE social_plans' ELSE '' END);
  EXECUTE d;
 END LOOP;
END $$;

-- Supersede incomplete public service-only foundations; no route may bypass the job ledger.
ALTER FUNCTION living_experience_action(uuid,uuid,text,timestamptz,integer,uuid) RENAME TO living_experience_action_v25;
ALTER FUNCTION living_experience_complete(uuid,uuid,integer,uuid,text,timestamptz) RENAME TO living_experience_complete_v25;
REVOKE ALL ON FUNCTION living_experience_action_v25(uuid,uuid,text,timestamptz,integer,uuid),living_experience_complete_v25(uuid,uuid,integer,uuid,text,timestamptz),living_experience_moment(uuid,uuid,uuid,text,timestamptz) FROM service_role;

CREATE FUNCTION public.experience_command(p_user uuid,p_plan uuid,p_id uuid,p_command text,p_revision integer,p_payload jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e living_experiences;p social_plans;o experience_operations;ordinal integer;dest text;delta jsonb;st tess_state;k text;v integer;cid uuid;vsummary text;receipt experience_action_receipts;output jsonb;cur integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 IF NOT (SELECT enabled FROM experience_settings) THEN RAISE EXCEPTION 'Living Experiences not enabled'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 SELECT * INTO p FROM social_plans WHERE user_id=p_user AND id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owned plan required'; END IF;
 SELECT * INTO e FROM living_experiences WHERE user_id=p_user AND plan_id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Eligible experience required'; END IF;
 IF e.conversation_id IS DISTINCT FROM p.conversation_id OR NOT EXISTS(SELECT 1 FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND c.id=e.conversation_id AND ch.key=p.organizer) THEN RAISE EXCEPTION 'Owned matching character required'; END IF;
 SELECT * INTO receipt FROM experience_action_receipts WHERE user_id=p_user AND id=p_id;
 IF FOUND THEN IF receipt.plan_id<>p_plan OR receipt.command<>p_command THEN RAISE EXCEPTION 'Action ID conflict'; END IF;RETURN receipt.result;END IF;
 SELECT * INTO o FROM experience_operations WHERE user_id=p_user AND id=p_id;
 IF FOUND AND (o.experience_id<>e.id OR (p_command IN('turn','finish','automatic') AND (o.kind<>p_command OR o.body<>coalesce(p_payload->>'body','')))) THEN RAISE EXCEPTION 'Action ID conflict'; END IF;
 IF FOUND AND o.status='done' THEN RETURN jsonb_build_object('experience',to_jsonb(e),'operation',to_jsonb(o),'done',true); END IF;
 IF p_command IN('claim','automatic') AND e.state='scheduled' AND (p.status NOT IN('accepted','in_progress') OR e.start_at IS DISTINCT FROM p.starts_at OR e.plan_version IS DISTINCT FROM p.version) THEN RAISE EXCEPTION 'Confirmed plan changed; refresh'; END IF;
 IF p_command IN('claim','automatic') AND e.state='scheduled' AND EXISTS(SELECT 1 FROM social_plans other WHERE other.user_id=p_user AND other.id<>p.id AND other.status IN('accepted','in_progress','active') AND other.starts_at<p.ends_at AND other.ends_at>p.starts_at) THEN RAISE EXCEPTION 'Resolve conflicting accepted plans before this outing'; END IF;
 IF p_command IN('commit','fail') THEN
  IF o.id IS NULL OR o.status<>'running' OR o.token::text IS DISTINCT FROM p_payload->>'token' OR o.revision<>e.revision THEN RAISE EXCEPTION 'Stale generation'; END IF;
  IF p_command='fail' THEN
   UPDATE experience_operations SET status='failed' WHERE user_id=p_user AND id=o.id;
   UPDATE living_experiences SET last_failure='Generation interrupted; retry the same action safely' WHERE user_id=p_user AND id=e.id;
   RETURN '{}'::jsonb;
  END IF;
  vsummary:=trim(p_payload->>'body');
  IF vsummary IS NULL OR length(vsummary)<1 OR length(vsummary)>3000 THEN RAISE EXCEPTION 'Invalid generated scene'; END IF;
  SELECT coalesce(max(m.ordinal),0)+1 INTO ordinal FROM living_experience_moments m WHERE m.user_id=p_user AND m.experience_id=e.id;
  INSERT INTO living_experience_moments VALUES(p_user,o.id,e.id,ordinal,'conversation',vsummary,CASE WHEN o.kind='turn' THEN 'character' ELSE 'simulation' END,false,p_now);
  IF o.kind<>'turn' THEN
   IF e.state NOT IN('interactive','paused','auto_running') THEN RAISE EXCEPTION 'Not completable'; END IF;
   cid:=md5(p_user::text||':experience-outcome:'||o.id::text)::uuid;
   PERFORM set_config('app.experience_finalize','on',true);
   UPDATE social_plans SET status='completed',user_attendance=CASE WHEN e.mode='interactive' THEN 'participated' ELSE user_attendance END,version=version+1 WHERE user_id=p_user AND id=p.id;
   INSERT INTO calendar_transitions VALUES(p_user,cid,p.id,p.status,'completed','living_experience_outcome',p_now);
   INSERT INTO memories(id,user_id,conversation_id,memory_type,summary,importance) VALUES(cid,p_user,e.conversation_id,'relationship',
    CASE WHEN e.mode='automatic' THEN '[Off-screen fictional outing; no recorded user dialogue or new intimate milestone] ' ELSE '[Completed in-person experience] ' END||p.title||': '||vsummary,4);
   INSERT INTO shared_events(user_id,id,title,kind,location,occurs_at,facts,source) VALUES(p_user,'experience:'||cid,p.title,'living_experience',coalesce(p.place_key,''),e.start_at,jsonb_build_object('outcome_id',cid,'plan_id',p.id,'mode',e.mode,'summary',vsummary),'experience');
   INSERT INTO event_participants(user_id,event_id,participant_type,participant_key,perspective) VALUES(p_user,'experience:'||cid,'character',p.organizer,vsummary);
   IF e.mode='interactive' THEN INSERT INTO event_participants(user_id,event_id,participant_type,participant_key,perspective) VALUES(p_user,'experience:'||cid,'user',p_user::text,'Explicitly played outing; actual choices are in the experience journal'); END IF;
   INSERT INTO character_knowledge(user_id,character_key,subject_type,subject_id,knowledge_type,summary,source,acquired_at)
    VALUES(p_user,p.organizer,'experience',cid::text,'completed',vsummary,'shared experience',p_now) ON CONFLICT DO NOTHING;
   -- Apply one bounded aggregate at completion against CURRENT state; never overwrite later SMS deltas.
   SELECT * INTO st FROM tess_state WHERE user_id=p_user AND conversation_id=e.conversation_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Character state missing'; END IF;
   delta:=coalesce(p_payload->'delta','{}');
   FOR k IN SELECT jsonb_object_keys(delta) LOOP
    IF k NOT IN('comfort','trust','romantic_attraction','physical_attraction','curiosity','emotional_intimacy','perceived_pressure','irritation','respect','playfulness','relationship_momentum','romantic_intent') THEN RAISE EXCEPTION 'Unknown dimension'; END IF;
    v:=greatest(-3,least(3,(delta->>k)::integer));
    IF e.mode='automatic' THEN v:=0; END IF;
    IF p.organizer='ben' AND k IN('romantic_attraction','physical_attraction','romantic_intent') THEN v:=0; END IF;
    cur:=(to_jsonb(st)->>k)::integer;
    IF v>0 AND k NOT IN('perceived_pressure','irritation') AND cur>50 THEN v:=greatest(CASE WHEN v>=2 AND cur<100 THEN 1 ELSE 0 END,floor(v*(100-cur)/50.0+0.5)::integer); END IF;
    delta:=jsonb_set(delta,ARRAY[k],to_jsonb(v));
    EXECUTE format('UPDATE tess_state SET %I=greatest(0,least(100,%I+$1)) WHERE user_id=$2 AND conversation_id=$3',k,k) USING v,p_user,e.conversation_id;
   END LOOP;
   UPDATE tess_state SET updated_at=p_now,last_delta=delta WHERE user_id=p_user AND conversation_id=e.conversation_id;
   UPDATE living_experiences SET state='completed',summary=vsummary,outcome_id=cid,synced_at=p_now WHERE user_id=p_user AND id=e.id;
   DELETE FROM social_presence WHERE user_id=p_user AND plan_id=p.id;
  END IF;
  UPDATE living_experiences SET revision=revision+1,last_failure=NULL,updated_at=p_now WHERE user_id=p_user AND id=e.id;
  IF o.kind<>'turn' THEN UPDATE experience_operations SET status='failed' WHERE user_id=p_user AND experience_id=e.id AND status='running' AND id<>o.id; END IF;
  UPDATE experience_operations SET status='done',result=jsonb_build_object('body',vsummary,'delta',coalesce(p_payload->'delta','{}')) WHERE user_id=p_user AND id=o.id;
 ELSE
  UPDATE experience_operations SET status='failed' WHERE user_id=p_user AND experience_id=e.id AND status='running' AND lease_until<=p_now;
  IF EXISTS(SELECT 1 FROM experience_operations WHERE user_id=p_user AND experience_id=e.id AND status='running') THEN RAISE EXCEPTION 'A scene is still generating; retry shortly'; END IF;
  IF p_revision IS NOT NULL AND p_revision<>e.revision THEN RAISE EXCEPTION 'Experience changed; refresh'; END IF;
  IF p_command='eligibility_fail' THEN
   IF e.state<>'scheduled' THEN RAISE EXCEPTION 'Only unclaimed eligibility can be deferred'; END IF;
   UPDATE living_experiences SET last_failure='Schedule or venue conflict; update the plan before starting',revision=revision+1 WHERE user_id=p_user AND id=e.id;
  ELSIF p_command='window' THEN
   IF e.state<>'scheduled' OR (p_payload->>'hours')::integer NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Only unclaimed start windows can be adjusted (1-24 hours)'; END IF;
   UPDATE living_experiences SET claim_deadline=start_at+make_interval(hours=>(p_payload->>'hours')::integer),revision=revision+1,updated_at=p_now WHERE user_id=p_user AND id=e.id;
  ELSIF p_command IN('claim','pause','resume') THEN
   dest:=CASE WHEN p_command='claim' AND e.state='scheduled' AND p_now>=e.start_at AND p_now<e.claim_deadline AND p.status IN('accepted','in_progress') THEN 'interactive'
    WHEN p_command='pause' AND e.state='interactive' THEN 'paused' WHEN p_command='resume' AND e.state='paused' THEN 'interactive' END;
   IF dest IS NULL THEN RAISE EXCEPTION 'Experience transition unavailable'; END IF;
   UPDATE living_experiences SET state=dest,mode=coalesce(mode,'interactive'),claimed_at=coalesce(claimed_at,p_now),revision=revision+1,updated_at=p_now WHERE user_id=p_user AND id=e.id;
  ELSIF p_command IN('turn','finish','automatic') THEN
   IF p_command='turn' AND o.id IS NULL AND EXISTS(SELECT 1 FROM experience_operations WHERE user_id=p_user AND experience_id=e.id AND status='failed' AND kind='turn') THEN RAISE EXCEPTION 'Retry the pending scene first'; END IF;
   IF p_command='turn' AND o.id IS NULL AND (SELECT count(*) FROM experience_operations WHERE user_id=p_user AND experience_id=e.id)>=80 THEN RAISE EXCEPTION 'Experience moment limit reached; finish the outing'; END IF;
   IF (p_command='turn' AND e.state<>'interactive') OR (p_command='finish' AND e.state NOT IN('interactive','paused')) OR (p_command='automatic' AND e.state NOT IN('scheduled','auto_running')) THEN RAISE EXCEPTION 'Experience ownership does not permit this action'; END IF;
   IF p_command='automatic' AND e.state='scheduled' THEN
    IF p_now<e.start_at OR (coalesce((p_payload->>'explicit')::boolean,false)=false AND p_now<e.claim_deadline) THEN RAISE EXCEPTION 'Not due'; END IF;
    UPDATE living_experiences SET state='auto_running',mode='automatic',claimed_at=p_now WHERE user_id=p_user AND id=e.id;
   END IF;
   IF (SELECT count(*) FROM experience_operations WHERE user_id=p_user AND created_at>=date_trunc('day',p_now))>=40 AND o.id IS NULL THEN RAISE EXCEPTION 'Daily experience limit reached'; END IF;
   IF o.attempts>=3 THEN RAISE EXCEPTION 'Retry limit reached; developer recovery needed'; END IF;
   IF p_command='turn' AND o.id IS NULL THEN
    IF length(coalesce(p_payload->>'body',''))>1500 THEN RAISE EXCEPTION 'Contribution too long'; END IF;
    IF length(trim(coalesce(p_payload->>'body','')))>0 THEN
     SELECT coalesce(max(m.ordinal),0)+1 INTO ordinal FROM living_experience_moments m WHERE m.user_id=p_user AND m.experience_id=e.id;
     INSERT INTO living_experience_moments VALUES(p_user,md5(p_id::text||':user')::uuid,e.id,ordinal,'conversation',p_payload->>'body','user',true,p_now);
    END IF;
   END IF;
   INSERT INTO experience_operations(user_id,id,experience_id,kind,body,token,lease_until,revision,created_at)
    VALUES(p_user,p_id,e.id,p_command,coalesce(p_payload->>'body',''),gen_random_uuid(),p_now+interval '2 minutes',e.revision,p_now)
    ON CONFLICT(user_id,id) DO UPDATE SET status='running',attempts=experience_operations.attempts+1,token=gen_random_uuid(),lease_until=excluded.lease_until,revision=e.revision;
  ELSE RAISE EXCEPTION 'Unknown experience command'; END IF;
 END IF;
 SELECT * INTO e FROM living_experiences WHERE user_id=p_user AND plan_id=p_plan;
 SELECT * INTO o FROM experience_operations WHERE user_id=p_user AND id=p_id;
 output:=jsonb_build_object('experience',to_jsonb(e),'operation',CASE WHEN o.id IS NOT NULL THEN to_jsonb(o) ELSE NULL END);
 IF p_command IN('claim','pause','resume','window') THEN INSERT INTO experience_action_receipts VALUES(p_user,p_id,p_plan,p_command,output); END IF;
 RETURN output;
END $$;
DO $$ DECLARE f regprocedure; BEGIN FOREACH f IN ARRAY ARRAY['experience_status()'::regprocedure,'experience_candidates(uuid,timestamptz)'::regprocedure,'experience_seed(uuid,timestamptz)'::regprocedure,'experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure] LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,authenticated',f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);END LOOP; END $$;
