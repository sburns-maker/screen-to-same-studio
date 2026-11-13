CREATE OR REPLACE FUNCTION public.experience_home_invited(p_user uuid,p_experience uuid,p_place text,p_evidence uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT EXISTS (
 SELECT 1 FROM living_experiences e
 JOIN conversations c ON c.user_id=e.user_id AND c.id=e.conversation_id
 JOIN characters ch ON ch.id=c.character_id
 JOIN living_experience_moments u ON u.user_id=e.user_id AND u.experience_id=e.id AND u.id=p_evidence AND u.source='user' AND u.confirmed
 JOIN living_experience_moments invite ON invite.user_id=e.user_id AND invite.experience_id=e.id AND invite.source='character' AND invite.ordinal<u.ordinal
 WHERE e.user_id=p_user AND e.id=p_experience AND e.state IN('interactive','paused')
 AND housing_resident(p_user,p_place,ch.key,u.created_at)
 AND invite.body ~* '(come (in|inside|back to my (place|home|house|apartment))|you can come (in|inside)|let.s go (inside|to my (place|home)))'
 AND invite.body !~* '(do not|don.t|not tonight|not ready|maybe|someday|remember|yesterday)'
 AND NOT EXISTS(SELECT 1 FROM living_experience_moments withdrawn WHERE withdrawn.user_id=e.user_id AND withdrawn.experience_id=e.id AND withdrawn.source='character' AND withdrawn.ordinal>=invite.ordinal AND withdrawn.ordinal<u.ordinal AND withdrawn.body ~* '(don.t come|do not come|not tonight|not ready|changed my mind|you need to leave|please leave|no longer inviting)')
) $$;
REVOKE ALL ON FUNCTION public.experience_home_invited(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.experience_home_invited(uuid,uuid,text,uuid) TO service_role;
DO $$ DECLARE d text; old text := 'AND NOT housing_can_enter(p_user,loc,''user'',m.created_at) AND NOT(p.place_key=loc'; BEGIN
 SELECT pg_get_functiondef('public.experience_scene_apply(uuid,uuid,uuid,integer,jsonb,text)'::regprocedure) INTO d;
 IF position(old in d)=0 THEN RAISE EXCEPTION 'Expected home entry guard missing'; END IF;
 d:=replace(d,old,'AND NOT housing_can_enter(p_user,loc,''user'',m.created_at) AND NOT experience_home_invited(p_user,e.id,loc,m.id) AND NOT(p.place_key=loc');
 EXECUTE d;
END $$;