-- Fix applied after 0026_complete_living_experiences.sql.

-- Keep the entire existing experience_command function; remove only the daily cap.
-- The owner asked to remove the daily experience limit entirely, so the guard is
-- raised to the maximum integer value (effectively unlimited) while the per-operation
-- retry limit and all other safeguards stay exactly as they were.

DO $$

DECLARE definition text;

BEGIN

 SELECT pg_get_functiondef('public.experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure) INTO definition;

 IF position('>=40 AND o.id IS NULL' IN definition)=0 THEN

  RAISE EXCEPTION 'Unexpected experience_command version; refusing unsafe automated rewrite';

 END IF;

 definition:=replace(definition, '>=40 AND o.id IS NULL', '>=2147483647 AND o.id IS NULL');

 EXECUTE definition;

END $$;



-- One-owner, one-operation recovery with a bound on repeated resets.

-- Does not change the user's turns, operation ID, character state or prior scene moments.

CREATE OR REPLACE FUNCTION public.recover_experience_operation(

 p_user uuid, p_plan uuid, p_operation uuid

) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$

DECLARE op public.experience_operations; ex public.living_experiences; resets integer;

BEGIN

 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));

 SELECT * INTO ex FROM public.living_experiences WHERE user_id=p_user AND plan_id=p_plan FOR UPDATE;

 IF NOT FOUND OR ex.state NOT IN ('interactive','paused') THEN RAISE EXCEPTION 'Owned active experience required'; END IF;

 SELECT * INTO op FROM public.experience_operations

 WHERE user_id=p_user AND id=p_operation AND experience_id=ex.id FOR UPDATE;

 IF NOT FOUND OR op.kind NOT IN ('turn','finish') OR op.status<>'failed' OR op.attempts<3

 THEN RAISE EXCEPTION 'No exhausted failed operation to recover'; END IF;

 IF EXISTS (SELECT 1 FROM public.experience_operations

  WHERE user_id=p_user AND experience_id=ex.id AND status='running') THEN

  RAISE EXCEPTION 'A scene is still generating';

 END IF;

 resets:=coalesce((op.result->>'manual_recoveries')::integer,0);

 IF resets>=2 THEN RAISE EXCEPTION 'Maximum manual recoveries reached; developer review needed'; END IF;

 UPDATE public.experience_operations SET attempts=0,

 result=jsonb_build_object('manual_recoveries',resets+1)

 WHERE user_id=p_user AND id=p_operation;

 UPDATE public.living_experiences SET last_failure=NULL WHERE user_id=p_user AND id=ex.id;

 RETURN jsonb_build_object('recovered',true,'operation_id',p_operation,'remaining_recoveries',1-resets);

END $$;

REVOKE ALL ON FUNCTION public.recover_experience_operation(uuid,uuid,uuid) FROM PUBLIC,authenticated;

GRANT EXECUTE ON FUNCTION public.recover_experience_operation(uuid,uuid,uuid) TO service_role;
