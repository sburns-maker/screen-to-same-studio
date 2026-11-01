DO $fix$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('experience_scene_apply(uuid,uuid,uuid,integer,jsonb,text)'::regprocedure) INTO d;
 IF position($o$'household_chore','relaxing')$o$ IN d)=0 THEN RAISE EXCEPTION 'unknown scene activity contract'; END IF;
 d:=replace(d,$o$'household_chore','relaxing')$o$,$n$'household_chore','relaxing','sitting','reviewing_roommate_plan')$n$);
 EXECUTE d;
END $fix$;