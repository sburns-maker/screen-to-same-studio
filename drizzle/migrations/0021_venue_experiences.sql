-- Reuse existing private visit/action records. No new world, event or media table.
CREATE FUNCTION public.venue_experience_status() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT 21 $$;
CREATE FUNCTION public.venue_progress(p_user uuid,p_id uuid,p_place text,p_kind text,p_step integer,p_choice integer,p_now timestamptz,p_plan uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pos public.town_presence; s public.venue_sessions; p public.social_plans; template jsonb; e jsonb; existing public.venue_actions; result jsonb; request jsonb; k text; prompt jsonb; answer jsonb; selected text; step integer; score integer; cid uuid; summary text; label text; finished boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('town:'||p_user::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 request:=jsonb_build_object('place',p_place,'kind',p_kind,'step',p_step,'choice',p_choice,'plan',p_plan);
 SELECT * INTO existing FROM venue_actions WHERE user_id=p_user AND id=p_id;
 IF FOUND THEN
  IF existing.result->'request' IS DISTINCT FROM request THEN RAISE EXCEPTION 'Action ID belongs to a different request';END IF;
  RETURN existing.result||'{"replayed":true}';
 END IF;
 SELECT * INTO pos FROM town_presence WHERE user_id=p_user;
 IF pos.place_key IS DISTINCT FROM p_place OR pos.arrives_at>p_now THEN RAISE EXCEPTION 'Arrive before interacting';END IF;
 SELECT metadata->'experience_templates'->p_kind,world_places.label INTO template,label FROM world_places WHERE user_id=p_user AND key=p_place AND metadata->>'public'='true'
  AND ((p_now AT TIME ZONE 'America/New_York')::time)>=make_time((metadata->>'opens')::int,0,0)
  AND ((p_now AT TIME ZONE 'America/New_York')::time)<make_time((metadata->>'closes')::int,0,0);
 IF template IS NULL OR p_kind NOT IN('book_club','trivia') THEN RAISE EXCEPTION 'This activity is unavailable or the venue is closed';END IF;
 IF p_plan IS NOT NULL THEN
  SELECT * INTO p FROM social_plans WHERE user_id=p_user AND id=p_plan AND origin='conversation' AND status='in_progress' AND place_key=p_place AND starts_at<=p_now AND ends_at>p_now FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM social_presence WHERE user_id=p_user AND plan_id=p_plan AND character_key=p.organizer AND place_key=p_place AND until_at>p_now) THEN RAISE EXCEPTION 'A confirmed companion must be present';END IF;
  IF p.category<>p_kind AND p.category<>'meetup' THEN RAISE EXCEPTION 'This activity does not match the event';END IF;
 END IF;
 PERFORM public.venue_session(p_user,p_now);
 SELECT * INTO s FROM venue_sessions WHERE user_id=p_user AND place_key=p_place AND departed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open visit required';END IF;
 k:=coalesce(p_plan::text,'solo:'||p_kind);
 e:=s.state->'experiences'->k;
 IF e IS NULL THEN
  IF p_step<>-1 OR p_choice<>-1 THEN RAISE EXCEPTION 'Start the activity first';END IF;
  e:=jsonb_build_object('kind',p_kind,'step',0,'status','active','score',0,'answers','[]'::jsonb,'summary',template->>'intro','plan_id',p_plan,'team',CASE WHEN p_kind='trivia' THEN 'Window Table' ELSE NULL END);
 ELSIF p_step<>-1 THEN
  IF e->>'kind'<>p_kind OR e->>'status'<>'active' OR (e->>'step')::int<>p_step THEN RAISE EXCEPTION 'Activity changed; refresh before choosing';END IF;
  step:=(e->>'step')::int;prompt:=template->'steps'->step;
  IF p_choice<0 OR p_choice>=jsonb_array_length(prompt->'choices') THEN RAISE EXCEPTION 'Choose an available option';END IF;
  selected:=prompt->'choices'->>p_choice;
  answer:=jsonb_build_object('prompt',prompt->>'prompt','choice',selected);
  score:=(e->>'score')::int;
  IF p_kind='trivia' THEN
   answer:=answer||jsonb_build_object('correct',(prompt->>'answer')::int=p_choice);
   IF (prompt->>'answer')::int=p_choice THEN score:=score+1;END IF;
  END IF;
  finished:=step+1>=jsonb_array_length(template->'steps');
  summary:=CASE WHEN p_kind='trivia' THEN 'Window Table: '||score||' of '||(step+1)||' submitted answers correct.' ELSE 'Reading discussion contribution: '||selected||'.' END;
  e:=e||jsonb_build_object('step',step+1,'score',score,'answers',(e->'answers')||jsonb_build_array(answer),'status',CASE WHEN finished THEN 'completed' ELSE 'active' END,'summary',summary);
 END IF;
 UPDATE venue_sessions SET state=state||jsonb_build_object('experiences',coalesce(state->'experiences','{}')||jsonb_build_object(k,e),'last_activity',CASE WHEN p_step=-1 THEN 'join' ELSE 'discuss' END) WHERE user_id=p_user AND id=s.id;
 IF p_plan IS NOT NULL THEN
  UPDATE social_plans SET user_attendance='participated' WHERE user_id=p_user AND id=p_plan;
  IF e->>'status'='completed' THEN
   SELECT id INTO cid FROM conversations WHERE user_id=p_user AND id=p.conversation_id;
   summary:='At '||label||', the user participated in '||p.title||'. Recorded choices: '||(SELECT string_agg(a->>'choice','; ') FROM jsonb_array_elements(e->'answers') a)||'. '||(e->>'summary')||' No other attendee opinions or user actions are implied.';
   IF cid IS NOT NULL THEN
    INSERT INTO memories(id,user_id,conversation_id,memory_type,summary,importance) VALUES(md5(p.id::text||':activity:'||p_kind)::uuid,p_user,cid,'relationship',summary,3) ON CONFLICT DO NOTHING;
   END IF;
   PERFORM public.shared_plan_notice(p_user,p.id,p.organizer,'activity:'||p_kind,summary,p_now);
  END IF;
 END IF;
 result:=jsonb_build_object('request',request,'experience',e,'sessionId',s.id,'virtual',true);
 INSERT INTO venue_actions(user_id,id,session_id,plan_id,action,detail,result,created_at) VALUES(p_user,p_id,s.id,p_plan,CASE WHEN p_step=-1 THEN 'join' ELSE 'discuss' END,CASE WHEN p_step=-1 THEN template->>'title' ELSE selected END,result,p_now);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.venue_experience_status(),public.venue_progress(uuid,uuid,text,text,integer,integer,timestamptz,uuid) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.venue_experience_status(),public.venue_progress(uuid,uuid,text,text,integer,integer,timestamptz,uuid) TO service_role;
-- Favorites live in the existing owner-scoped preferences store; serialize concurrent edits.
CREATE FUNCTION public.town_favorite(p_user uuid,p_place text,p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE saved jsonb; next_saved jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('town:'||p_user::text,0));
 IF NOT EXISTS(SELECT 1 FROM world_places WHERE user_id=p_user AND key=p_place AND metadata->>'public'='true') THEN RAISE EXCEPTION 'Known public place required';END IF;
 SELECT value::jsonb INTO saved FROM user_profile WHERE user_id=p_user AND key='town_favorites';
 SELECT coalesce(jsonb_agg(k ORDER BY k),'[]') INTO next_saved FROM (SELECT DISTINCT value k FROM jsonb_array_elements_text(coalesce(saved,'[]')||CASE WHEN p_enabled THEN jsonb_build_array(p_place) ELSE '[]'::jsonb END) WHERE p_enabled OR value<>p_place) x;
 INSERT INTO user_profile(user_id,key,value,updated_at) VALUES(p_user,'town_favorites',next_saved::text,now()) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
 RETURN next_saved;
END $$;
REVOKE ALL ON FUNCTION public.town_favorite(uuid,text,boolean) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.town_favorite(uuid,text,boolean) TO service_role;
-- Travel through Explore/Home is also an explicit departure. Recover it durably on a tick/load.
CREATE FUNCTION public.venue_reconcile_departures(p_user uuid,p_now timestamptz) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pos public.town_presence; s public.venue_sessions; p public.social_plans; label text; cid uuid; n integer:=0; aid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('town:'||p_user::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 SELECT * INTO pos FROM town_presence WHERE user_id=p_user;
 IF pos.place_key IS NULL OR pos.updated_at>p_now THEN RETURN 0;END IF;
 FOR s IN SELECT * FROM venue_sessions WHERE user_id=p_user AND departed_at IS NULL AND place_key<>pos.place_key AND arrived_at<=pos.updated_at FOR UPDATE LOOP
  SELECT world_places.label INTO label FROM world_places WHERE user_id=p_user AND key=s.place_key;
  aid:=md5(s.id::text||':travel-departure')::uuid;
  FOR p IN SELECT * FROM social_plans WHERE user_id=p_user AND origin='conversation' AND conversation_id IS NOT NULL AND place_key=s.place_key AND status='in_progress' AND user_attendance='participated' AND EXISTS(SELECT 1 FROM venue_actions a WHERE a.user_id=p_user AND a.session_id=s.id AND a.plan_id=social_plans.id AND a.action IN('join','discuss','speak')) FOR UPDATE LOOP
   UPDATE social_plans SET status='completed',user_attendance='left',version=version+1 WHERE user_id=p_user AND id=p.id;
   DELETE FROM social_presence WHERE user_id=p_user AND plan_id=p.id;
   SELECT id INTO cid FROM conversations WHERE user_id=p_user AND id=p.conversation_id;
   IF cid IS NOT NULL THEN INSERT INTO memories(id,user_id,conversation_id,memory_type,summary,importance) VALUES(md5(p.id::text||':user-participation')::uuid,p_user,cid,'relationship','You and the user participated in '||p.title||' at '||label||'. The user then started virtual travel away. No other user actions or private NPC conversations are implied.',3) ON CONFLICT DO NOTHING;END IF;
   PERFORM public.shared_plan_notice(p_user,p.id,p.organizer,'completed','Participated with the user in '||p.title||' at '||label||'. The user then left virtually.',pos.updated_at);
   INSERT INTO calendar_transitions VALUES(p_user,md5(aid::text||p.id::text)::uuid,p.id,'in_progress','completed','explicit_participation_and_departure',pos.updated_at) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE venue_sessions SET departed_at=pos.updated_at WHERE user_id=p_user AND id=s.id;
  INSERT INTO venue_actions(user_id,id,session_id,action,detail,result,created_at) VALUES(p_user,aid,s.id,'leave','Started virtual travel away',jsonb_build_object('virtual',true,'destination',pos.place_key,'source','recorded_travel'),pos.updated_at) ON CONFLICT DO NOTHING;
  n:=n+1;
 END LOOP;RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.venue_reconcile_departures(uuid,timestamptz) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.venue_reconcile_departures(uuid,timestamptz) TO service_role;
