DO $repair$
DECLARE d text; old_guard text := 'AND NOT housing_can_enter(p_user,loc,''user'',m.created_at)';
BEGIN
 SELECT pg_get_functiondef('public.experience_home_invited(uuid,uuid,text,uuid)'::regprocedure) INTO d;
 IF position('not tonight|not ready' in d)=0 THEN RAISE EXCEPTION 'Expected invitation withdrawal contract missing'; END IF;
 d:=replace(d,'not tonight|not ready','not tonight (for company|for visitors|for a visit)|not ready (for company|for visitors|to host|to have you over|to let you in|for you to come (in|over))');
 EXECUTE d;
 SELECT pg_get_functiondef('public.experience_scene_apply(uuid,uuid,uuid,integer,jsonb,text)'::regprocedure) INTO d;
 IF position(old_guard in d)=0 OR position('experience_home_invited(p_user,e.id,loc,m.id)' in d)=0 THEN RAISE EXCEPTION 'Expected scene entry contract missing'; END IF;
 d:=replace(d,old_guard,'AND NOT (current_scene->>''locationKey''=loc AND current_scene->>''locationKind''=''home'' AND length(btrim(coalesce(current_scene->>''area'','''')))>0 AND current_scene->>''area'' !~* ''(outside|front door|porch|doorstep|driveway)'') '||old_guard);
 EXECUTE d;
END $repair$;
REVOKE ALL ON FUNCTION public.experience_home_invited(uuid,uuid,text,uuid),public.experience_scene_apply(uuid,uuid,uuid,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.experience_home_invited(uuid,uuid,text,uuid),public.experience_scene_apply(uuid,uuid,uuid,integer,jsonb,text) TO service_role;