-- Platform default relation ACLs may grant ALL to browser roles, including
-- TRUNCATE (which bypasses RLS). Preserve data/policies and explicitly narrow
-- these service-written calendar/scene tables to owner-scoped browser reads.
DO $permissions$
DECLARE relation regclass; role_name text; privilege_name text; allowed boolean; f regprocedure;
 privileges text[]:=ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
BEGIN
 IF current_setting('server_version_num')::integer>=170000 THEN privileges:=array_append(privileges,'MAINTAIN'); END IF;
 FOREACH relation IN ARRAY ARRAY['public.calendar_action_receipts'::regclass,'public.experience_scene_transitions'::regclass,'public.character_scene_state'::regclass] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=relation AND relrowsecurity) THEN
   RAISE EXCEPTION 'Calendar/scene permission repair stopped: RLS missing on %',relation;
  END IF;
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM anon,authenticated',relation);
  EXECUTE format('GRANT SELECT ON TABLE %s TO authenticated',relation);
  -- Detect inherited grants and missing service access, rather than accepting
  -- a repair that did not actually restore the intended effective privileges.
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   FOREACH privilege_name IN ARRAY privileges LOOP
    allowed:=role_name='service_role' OR (role_name='authenticated' AND privilege_name='SELECT');
    IF has_table_privilege(role_name,relation,privilege_name) IS DISTINCT FROM allowed THEN
     RAISE EXCEPTION 'Calendar/scene permission repair stopped: unexpected % % on %',role_name,privilege_name,relation;
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 -- Also cover databases whose historical 0035–0038 entries were already recorded.
 FOREACH f IN ARRAY ARRAY['public.calendar_pending(uuid,timestamptz)'::regprocedure,'public.experience_candidates(uuid,timestamptz)'::regprocedure,'public.deliver_photo_turn_before_calendar38(uuid)'::regprocedure,'public.experience_command_before_calendar38(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure] LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',f);
  IF has_function_privilege('anon',f,'EXECUTE') THEN
   RAISE EXCEPTION 'Calendar/scene permission repair stopped: inherited anonymous execution on %',f;
  END IF;
 END LOOP;
END $permissions$;
