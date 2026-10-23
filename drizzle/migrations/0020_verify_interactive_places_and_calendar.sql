DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'interactive_world_status'
  ) THEN
    RAISE EXCEPTION 'interactive world migration 0019 not applied';
  END IF;
END $$;