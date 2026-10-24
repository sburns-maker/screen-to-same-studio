-- Apply after migration 0034. Remove the per-day experience-operations count cap
-- without changing the retry-recovery limit, ownership checks or other protections.
DO $$
DECLARE definition text; before_count int;
BEGIN
 SELECT pg_get_functiondef('public.experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure) INTO definition;
 before_count := length(definition);
 -- Only remove the guard for the exact existing production-compatible revisions.
 definition := regexp_replace(definition,
  'IF \(SELECT count\(\*\) FROM experience_operations WHERE user_id=p_user AND created_at>=date_trunc\(''day'',p_now\)\)>=([0-9]+) AND o.id IS NULL THEN RAISE EXCEPTION ''Daily experience limit reached''; END IF;',
  '', 'g');
 IF length(definition)=before_count THEN
  RAISE EXCEPTION 'Daily guard not found; inspect deployed experience_command before changing it';
 END IF;
 EXECUTE definition;
END $$;
