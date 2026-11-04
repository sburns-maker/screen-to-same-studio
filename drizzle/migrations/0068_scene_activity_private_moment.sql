-- Keep the live-scene database contract aligned with the app's private_moment
-- state. This is an additive upgrade for databases with earlier migrations
-- already applied; do not rewrite their historical migration hashes.
DO $private_moment$
DECLARE
  signature text;
  definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.experience_scene_apply(uuid,uuid,uuid,integer,jsonb,text)',
    'public.experience_scene_reconcile(uuid,uuid,integer,jsonb,uuid,text)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'Required experience scene function missing: %', signature;
    END IF;
    SELECT pg_get_functiondef(to_regprocedure(signature)) INTO definition;
    IF position($needle$'private_moment'$needle$ IN definition) > 0 THEN
      CONTINUE;
    END IF;
    IF position($needle$'reviewing_roommate_plan'$needle$ IN definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected scene activity contract: %', signature;
    END IF;
    definition := replace(
      definition,
      $needle$'reviewing_roommate_plan'$needle$,
      $replacement$'reviewing_roommate_plan','private_moment'$replacement$
    );
    EXECUTE definition;
  END LOOP;
END $private_moment$;
