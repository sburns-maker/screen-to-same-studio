-- Additive opt-in shared-plan proof. No existing character, memory or score is rewritten.
-- 0004 added per-character uniqueness but left the old one-conversation-per-user constraint.
-- Retain conversations_user_character_key; remove only that obsolete narrower constraint.
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_user_id_key;
CREATE TABLE public.world_places(user_id uuid NOT NULL,key text NOT NULL,label text NOT NULL,kind text NOT NULL,PRIMARY KEY(user_id,key));
CREATE TABLE public.social_plans(user_id uuid NOT NULL,id uuid NOT NULL,organizer text NOT NULL,place_key text NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','active','completed','missed','cancelled')),version integer NOT NULL DEFAULT 0,user_attendance text NOT NULL DEFAULT 'not_reported' CHECK(user_attendance='not_reported'),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),FOREIGN KEY(user_id,place_key) REFERENCES public.world_places(user_id,key),CHECK(ends_at>starts_at));
CREATE TABLE public.social_rsvps(user_id uuid NOT NULL,plan_id uuid NOT NULL,character_key text NOT NULL,response text NOT NULL CHECK(response IN('invited','accepted','declined','tentative')),channel text NOT NULL,reason text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,plan_id,character_key),FOREIGN KEY(user_id,plan_id) REFERENCES public.social_plans(user_id,id) ON DELETE CASCADE);
CREATE TABLE public.social_presence(user_id uuid NOT NULL,character_key text NOT NULL,plan_id uuid NOT NULL,place_key text NOT NULL,until_at timestamptz NOT NULL,PRIMARY KEY(user_id,character_key),FOREIGN KEY(user_id,plan_id) REFERENCES public.social_plans(user_id,id),FOREIGN KEY(user_id,place_key) REFERENCES public.world_places(user_id,key));
CREATE TABLE public.social_exchanges(user_id uuid NOT NULL,id uuid NOT NULL,plan_id uuid NOT NULL,participants text[] NOT NULL,summary text NOT NULL,occurred_at timestamptz NOT NULL,PRIMARY KEY(user_id,id),UNIQUE(user_id,plan_id),FOREIGN KEY(user_id,plan_id) REFERENCES public.social_plans(user_id,id));
CREATE INDEX social_plans_due ON public.social_plans(starts_at) WHERE status IN('proposed','active');
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['world_places','social_plans','social_rsvps','social_presence','social_exchanges'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY own_world_read ON public.%I FOR SELECT TO authenticated USING(auth.uid()=user_id)',t);
END LOOP; END $$;
CREATE FUNCTION public.shared_world_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT '{"version":1}'::jsonb $$;
REVOKE ALL ON FUNCTION public.shared_world_status() FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.shared_world_status() TO service_role;

-- Participant knowledge projection only; never reads private messages or unrelated memories.
CREATE FUNCTION public.shared_plan_notice(p_user uuid,p_plan uuid,p_character text,p_phase text,p_summary text,p_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid; BEGIN
 SELECT c.id INTO cid FROM public.conversations c JOIN public.characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=p_character LIMIT 1;
 IF cid IS NULL THEN RAISE EXCEPTION 'character has no owned conversation'; END IF;
 INSERT INTO public.character_knowledge(user_id,character_key,subject_type,subject_id,knowledge_type,summary,source,acquired_at)
 VALUES(p_user,p_character,'shared_plan',p_plan::text||':'||p_phase,CASE WHEN p_phase IN('meeting','completed') THEN 'witnessed' ELSE 'told' END,p_summary,'explicit shared-plan '||p_phase,p_at) ON CONFLICT(user_id,character_key,subject_type,subject_id,knowledge_type) DO NOTHING;
 INSERT INTO public.world_events(id,user_id,conversation_id,character_key,kind,summary,payload,occurs_at,processed_at)
 VALUES(md5(p_user::text||p_plan::text||p_character||p_phase)::uuid,p_user,cid,p_character,'shared_plan',p_summary,jsonb_build_object('planId',p_plan,'phase',p_phase,'visibility','participant_only'),p_at,p_at) ON CONFLICT(id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.shared_plan_notice(uuid,uuid,text,text,text,timestamptz) FROM PUBLIC,authenticated,service_role;

CREATE FUNCTION public.shared_world_command(p_user_id uuid,p_plan_id uuid,p_command text,p_payload jsonb,p_now timestamptz,p_expected_version integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.social_plans; who text; answer text; names text[]; other text; cid uuid; perspective text; start_at timestamptz; end_at timestamptz; phase text; changed boolean:=false; affected integer;
BEGIN
 IF p_user_id IS NULL OR p_plan_id IS NULL OR p_now IS NULL THEN RAISE EXCEPTION 'missing world scope'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,53));
 SELECT * INTO p FROM public.social_plans WHERE user_id=p_user_id AND id=p_plan_id FOR UPDATE;
 IF p_command='create' THEN
  IF p.id IS NOT NULL THEN
   IF p.organizer<>p_payload->>'organizer' OR p.place_key<>p_payload->>'place' OR p.title<>p_payload->>'title' OR p.starts_at<>(p_payload->>'startsAt')::timestamptz OR p.ends_at<>(p_payload->>'endsAt')::timestamptz THEN RAISE EXCEPTION 'plan id reused'; END IF;
   RETURN to_jsonb(p);
  END IF;
  who:=p_payload->>'organizer'; start_at:=(p_payload->>'startsAt')::timestamptz; end_at:=(p_payload->>'endsAt')::timestamptz;
  IF start_at<p_now+interval '30 minutes' OR start_at>p_now+interval '14 days' OR end_at-start_at NOT BETWEEN interval '15 minutes' AND interval '6 hours' THEN RAISE EXCEPTION 'invalid plan window'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.conversations c JOIN public.characters ch ON ch.id=c.character_id WHERE c.user_id=p_user_id AND c.real_time_mode AND ch.key=who) THEN RAISE EXCEPTION 'unknown or non-real-time organizer'; END IF;
  IF p_payload->>'place' NOT IN('home:ben','coffee:local','library:school','park:local','venue:maya','clinic:tess') THEN RAISE EXCEPTION 'unregistered place'; END IF;
  INSERT INTO public.world_places(user_id,key,label,kind) SELECT p_user_id,x.key,x.label,x.kind FROM (VALUES('home:ben','Ben''s home','home'),('coffee:local','Local coffee shop','public'),('library:school','School library','work'),('park:local','Local park','public'),('venue:maya','Maya''s venue','work'),('clinic:tess','Veterinary clinic','work')) x(key,label,kind) ON CONFLICT DO NOTHING;
  IF EXISTS(SELECT 1 FROM public.social_rsvps r JOIN public.social_plans sp ON sp.user_id=r.user_id AND sp.id=r.plan_id WHERE r.user_id=p_user_id AND r.character_key=who AND r.response='accepted' AND sp.status IN('proposed','active') AND sp.starts_at<end_at+interval '30 minutes' AND sp.ends_at>start_at-interval '30 minutes') THEN RAISE EXCEPTION 'organizer schedule conflict'; END IF;
  INSERT INTO public.social_plans(user_id,id,organizer,place_key,title,starts_at,ends_at) VALUES(p_user_id,p_plan_id,who,p_payload->>'place',p_payload->>'title',start_at,end_at) RETURNING * INTO p;
  INSERT INTO public.social_rsvps(user_id,plan_id,character_key,response,channel) VALUES(p_user_id,p_plan_id,who,'accepted','organizer');
  PERFORM public.shared_plan_notice(p_user_id,p_plan_id,who,'proposal','Planned: '||p.title||' at '||p.place_key||' starting '||p.starts_at::text||'. User attendance is not established.',p_now);
  RETURN to_jsonb(p);
 END IF;
 IF p.id IS NULL THEN RAISE EXCEPTION 'plan not found'; END IF;
 IF p.version<>p_expected_version THEN RAISE EXCEPTION 'stale plan version'; END IF;
 IF p_command='invite' THEN
  who:=p_payload->>'character';
  IF p.status<>'proposed' OR p_now>=p.starts_at OR (p_payload->>'actor') IS DISTINCT FROM p.organizer OR coalesce(p_payload->>'channel','') NOT IN('user_relay','direct_invitation') THEN RAISE EXCEPTION 'invalid invitation channel or state'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.conversations c JOIN public.characters ch ON ch.id=c.character_id WHERE c.user_id=p_user_id AND c.real_time_mode AND ch.key=who) THEN RAISE EXCEPTION 'unknown or non-real-time invitee'; END IF;
  INSERT INTO public.social_rsvps(user_id,plan_id,character_key,response,channel) VALUES(p_user_id,p_plan_id,who,'invited',p_payload->>'channel') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT; changed:=affected>0;
  IF changed THEN
   PERFORM public.shared_plan_notice(p_user_id,p_plan_id,who,'invitation:'||p.version,'Invitation from '||p.organizer||' via '||(p_payload->>'channel')||': '||p.title||' at '||p.place_key||', '||p.starts_at::text||'. No attendance yet; decide independently.',p_now);
   PERFORM public.shared_plan_notice(p_user_id,p_plan_id,p.organizer,'sent:'||who||':'||p.version,'Invitation sent to '||who||' for '||p.title||'. Response is pending.',p_now);
  END IF;
 ELSIF p_command='respond' THEN
  who:=p_payload->>'character'; answer:=p_payload->>'response';
  IF p.status<>'proposed' OR answer NOT IN('accepted','declined','tentative') THEN RAISE EXCEPTION 'invalid RSVP'; END IF;
  IF answer='accepted' AND p_now>p.starts_at-interval '30 minutes' THEN RAISE EXCEPTION 'late RSVP cannot create past attendance'; END IF;
  IF answer='accepted' AND EXISTS(SELECT 1 FROM public.social_rsvps r JOIN public.social_plans sp ON sp.user_id=r.user_id AND sp.id=r.plan_id WHERE r.user_id=p_user_id AND r.character_key=who AND r.plan_id<>p.id AND r.response='accepted' AND sp.status IN('proposed','active') AND sp.starts_at<p.ends_at+interval '30 minutes' AND sp.ends_at>p.starts_at-interval '30 minutes') THEN RAISE EXCEPTION 'invitee schedule conflict'; END IF;
  UPDATE public.social_rsvps SET response=answer,reason=left(coalesce(p_payload->>'reason','independent decision'),100),updated_at=p_now WHERE user_id=p_user_id AND plan_id=p.id AND character_key=who AND (response IN('invited','tentative') OR (response='accepted' AND answer='declined')); 
  GET DIAGNOSTICS affected=ROW_COUNT; changed:=affected>0;
  IF changed THEN
   PERFORM public.shared_plan_notice(p_user_id,p.id,who,'response:'||p.version,answer||': '||p.title||' at '||p.place_key||', '||p.starts_at::text||'.',p_now);
   PERFORM public.shared_plan_notice(p_user_id,p.id,p.organizer,'reply:'||who||':'||p.version,who||' responded '||answer||' to '||p.title||'. This says nothing about user attendance.',p_now);
  END IF;
 ELSIF p_command IN('cancel','reschedule') THEN
  IF p.status<>'proposed' THEN RAISE EXCEPTION 'only future proposed plans can change'; END IF;
  IF p_command='cancel' THEN UPDATE public.social_plans SET status='cancelled' WHERE user_id=p_user_id AND id=p.id;
  ELSE
   start_at:=(p_payload->>'startsAt')::timestamptz;end_at:=(p_payload->>'endsAt')::timestamptz;
   IF start_at<p_now+interval '30 minutes' OR start_at>p_now+interval '14 days' OR end_at-start_at NOT BETWEEN interval '15 minutes' AND interval '6 hours' THEN RAISE EXCEPTION 'invalid reschedule window'; END IF;
   IF EXISTS(SELECT 1 FROM public.social_rsvps r JOIN public.social_plans sp ON sp.user_id=r.user_id AND sp.id=r.plan_id WHERE r.user_id=p_user_id AND r.character_key=p.organizer AND r.plan_id<>p.id AND r.response='accepted' AND sp.status IN('proposed','active') AND sp.starts_at<end_at+interval '30 minutes' AND sp.ends_at>start_at-interval '30 minutes') THEN RAISE EXCEPTION 'organizer schedule conflict'; END IF;
   UPDATE public.social_plans SET starts_at=start_at,ends_at=end_at WHERE user_id=p_user_id AND id=p.id;
   UPDATE public.social_rsvps SET response='invited',reason='rescheduled; renewed response required' WHERE user_id=p_user_id AND plan_id=p.id AND character_key<>p.organizer;
  END IF;
  FOR who IN SELECT character_key FROM public.social_rsvps WHERE user_id=p_user_id AND plan_id=p.id LOOP
   PERFORM public.shared_plan_notice(p_user_id,p.id,who,p_command||':'||p.version,p.title||' was '||p_command||'. '||CASE WHEN p_command='reschedule' THEN 'New proposed time: '||start_at::text||' at '||p.place_key||'. ' ELSE '' END||'Prior attendance assumptions no longer apply.',p_now);
  END LOOP; changed:=true;
 ELSIF p_command='advance' THEN
  IF p.status IN('completed','missed','cancelled') OR p_now<p.starts_at THEN RETURN to_jsonb(p); END IF;
  SELECT array_agg(r.character_key ORDER BY r.character_key) INTO names FROM public.social_rsvps r WHERE r.user_id=p_user_id AND r.plan_id=p.id AND r.response='accepted' AND EXISTS(SELECT 1 FROM public.conversations c JOIN public.characters ch ON ch.id=c.character_id WHERE c.user_id=p_user_id AND ch.key=r.character_key AND c.real_time_mode);
  IF coalesce(array_length(names,1),0)<2 OR NOT coalesce(p.organizer=ANY(names),false) THEN
   IF p_now>=p.ends_at THEN UPDATE public.social_plans SET status='missed' WHERE user_id=p_user_id AND id=p.id; changed:=true; END IF;
  ELSE
   IF p.status='proposed' THEN
    IF EXISTS(SELECT 1 FROM public.social_presence WHERE user_id=p_user_id AND character_key=ANY(names) AND plan_id<>p.id AND until_at>p.starts_at) THEN RAISE EXCEPTION 'character already occupies another location'; END IF;
    INSERT INTO public.social_exchanges(user_id,id,plan_id,participants,summary,occurred_at) VALUES(p_user_id,md5(p_user_id::text||p.id::text||'exchange')::uuid,p.id,names,'A brief, cordial introduction and ordinary conversation at '||p.title||'. No private user conversations were shared; friendship is not assumed.',p.starts_at) ON CONFLICT DO NOTHING;
    FOREACH who IN ARRAY names LOOP
     INSERT INTO public.social_presence(user_id,character_key,plan_id,place_key,until_at) VALUES(p_user_id,who,p.id,p.place_key,p.ends_at) ON CONFLICT(user_id,character_key) DO UPDATE SET plan_id=excluded.plan_id,place_key=excluded.place_key,until_at=excluded.until_at;
     perspective:=CASE WHEN who=p.organizer THEN 'I hosted ' ELSE 'I attended ' END||p.title||' at '||p.place_key||'. I had a brief introduction with '||array_to_string(array_remove(names,who),', ')||'. It was cordial; this does not establish friendship. User attendance is not known.';
     PERFORM public.shared_plan_notice(p_user_id,p.id,who,'meeting',perspective,p.starts_at);
     SELECT c.id INTO cid FROM public.conversations c JOIN public.characters ch ON ch.id=c.character_id WHERE c.user_id=p_user_id AND ch.key=who LIMIT 1;
     INSERT INTO public.memories(id,conversation_id,user_id,memory_type,summary,importance,created_at) VALUES(md5(p_user_id::text||p.id::text||who||'meeting-memory')::uuid,cid,p_user_id,'personal',perspective,3,p.starts_at) ON CONFLICT(id) DO NOTHING;
     FOREACH other IN ARRAY array_remove(names,who) LOOP
      INSERT INTO public.social_links(user_id,character_key,other_type,other_key,level,opinion,reason) VALUES(p_user_id,who,'character',other,'acquaintance','Met briefly','Actual introduction at shared plan '||p.id)
       ON CONFLICT(user_id,character_key,other_type,other_key) DO UPDATE SET level='acquaintance',reason=excluded.reason,updated_at=p_now WHERE social_links.level IN('stranger','knows_of');
     END LOOP;
    END LOOP;
    UPDATE public.social_plans SET status='active' WHERE user_id=p_user_id AND id=p.id;changed:=true;
   END IF;
   IF p_now>=p.ends_at THEN
    UPDATE public.social_plans SET status='completed' WHERE user_id=p_user_id AND id=p.id;
    DELETE FROM public.social_presence WHERE user_id=p_user_id AND plan_id=p.id;
    FOREACH who IN ARRAY names LOOP
     PERFORM public.shared_plan_notice(p_user_id,p.id,who,'completed','Completed: '||p.title||'. The gathering has ended; return to your normal schedule. User attendance remains unreported.',p.ends_at);
     SELECT c.id INTO cid FROM public.conversations c JOIN public.characters ch ON ch.id=c.character_id WHERE c.user_id=p_user_id AND ch.key=who LIMIT 1;
     INSERT INTO public.world_records(id,conversation_id,user_id,character_key,kind,key,summary,status,source_quote,due_at,expires_at) VALUES(md5(p_user_id::text||p.id::text||who||'follow-up')::uuid,cid,p_user_id,who,'check_in','shared-plan:'||p.id,'Optionally share your own experience of the completed gathering: '||p.title||'. Never assume user attendance or disclose private chats.','pending','Structured completed shared event',p.ends_at+interval '30 minutes',p.ends_at+interval '48 hours') ON CONFLICT(user_id,conversation_id,kind,key) DO NOTHING;
    END LOOP; changed:=true;
   END IF;
  END IF;
 ELSE RAISE EXCEPTION 'unknown shared-world command'; END IF;
 IF changed THEN UPDATE public.social_plans SET version=version+1 WHERE user_id=p_user_id AND id=p.id; END IF;
 SELECT * INTO p FROM public.social_plans WHERE user_id=p_user_id AND id=p.id;
 RETURN to_jsonb(p);
END $$;
REVOKE ALL ON FUNCTION public.shared_world_command(uuid,uuid,text,jsonb,timestamptz,integer) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.shared_world_command(uuid,uuid,text,jsonb,timestamptz,integer) TO service_role;
