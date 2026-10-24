-- Extend only the existing Living Experience cast guards; preserve all other
-- installed function logic, grants, ownership and historical records.
DO $migration$
DECLARE signature text; definition text; old_cast text := 'IN(''tess'',''maya'',''claire'',''jordan'',''ben'')';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.experience_seed(uuid,timestamptz)',
    'public.protect_living_plan()',
    'public.calendar_advance(uuid,timestamptz,jsonb)',
    'public.venue_reconcile_departures(uuid,timestamptz)'
  ] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF position(old_cast in definition) = 0 THEN
      RAISE EXCEPTION 'Expected Living Experience cast guard missing in %', signature;
    END IF;
    EXECUTE replace(definition, old_cast, 'IN(''tess'',''maya'',''claire'',''jordan'',''ben'',''riley'')');
  END LOOP;
END $migration$;