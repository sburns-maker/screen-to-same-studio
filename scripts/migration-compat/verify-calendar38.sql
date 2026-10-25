-- Shared validation. Preflight is read-only; runner may revoke ONLY reviewed function/receipt grants.
-- Never mutate permissions until every body, metadata and schema check has passed.
IF to_regprocedure('public.calendar_contract_status()') IS NOT NULL
 OR to_regprocedure('public.experience_command_before_calendar38(uuid,uuid,uuid,text,integer,jsonb,timestamptz)') IS NOT NULL
 OR to_regprocedure('public.deliver_photo_turn_before_calendar38(uuid)') IS NOT NULL
 OR to_regclass('public.calendar_action_receipts') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.social_plans') AND attnum>0 AND NOT attisdropped AND attname IN('description','time_zone','time_hint','parent_plan_id'))
THEN
 -- A marker alone is NOT proof. Every known body, shape and security property must match.
 FOR item IN SELECT value FROM jsonb_array_elements(expected->'functions') LOOP
  fn:=to_regprocedure('public.'||(item->>'signature'));
  IF fn IS NULL THEN RAISE EXCEPTION 'Calendar 0038 compatibility stopped: missing function %',item->>'signature'; END IF;
  SELECT jsonb_build_object('body_hash',md5(regexp_replace(p.prosrc,'[[:space:]]','','g')),'security_definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'language',l.lanname,'return_type',pg_get_function_result(p.oid),'argument_names',p.proargnames,'strict',p.proisstrict,'parallel',p.proparallel,'defaults',pg_get_expr(p.proargdefaults,0),
   'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'))
   INTO actual FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=fn;
  IF NOT (item->'body_hashes' ? (actual->>'body_hash')) THEN
   RAISE EXCEPTION 'Calendar 0038 compatibility stopped: unrecognized function body % (fingerprint %). No historical migration was skipped.',item->>'signature',actual->>'body_hash';
  END IF;
  IF actual->>'anon'='true' AND item->>'anon'='false'
     AND expected->'anonymousExecuteRepair' ? (item->>'signature') THEN
   -- Recognize this one repairable mismatch, not an acceptable final permission.
   repairs:=array_append(repairs,fn);
   actual:=jsonb_set(actual,'{anon}','false'::jsonb);
  END IF;
  IF (actual-'body_hash') IS DISTINCT FROM (item-'signature'-'body_hashes') THEN
   RAISE EXCEPTION 'Calendar 0038 compatibility stopped: function security or metadata differs for %',item->>'signature';
  END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(expected->'columns') LOOP
  SELECT jsonb_build_object('relation',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default_value',pg_get_expr(d.adbin,d.adrelid))
  INTO actual FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname='public' AND c.relname=item->>'relation' AND a.attname=item->>'name' AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM item THEN RAISE EXCEPTION 'Calendar 0038 compatibility stopped: column %.% is missing or differs',item->>'relation',item->>'name'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(expected->'constraints') LOOP
  SELECT jsonb_build_object('relation',c.relname,'name',x.conname,'definition',pg_get_constraintdef(x.oid),'validated',x.convalidated)
   INTO actual FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=item->>'relation' AND x.conname=item->>'name';
  IF actual IS DISTINCT FROM item THEN RAISE EXCEPTION 'Calendar 0038 compatibility stopped: constraint % is missing or differs',item->>'name'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(expected->'indexes') LOOP
  SELECT jsonb_build_object('name',indexname,'definition',indexdef) INTO actual FROM pg_indexes WHERE schemaname='public' AND indexname=item->>'name';
  IF actual IS DISTINCT FROM item OR NOT EXISTS(SELECT 1 FROM pg_index x JOIN pg_class c ON c.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=item->>'name' AND x.indisvalid AND x.indisready) THEN RAISE EXCEPTION 'Calendar 0038 compatibility stopped: index % is missing, invalid or differs',item->>'name'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.calendar_action_receipts') AND relrowsecurity) THEN
  RAISE EXCEPTION 'Calendar 0038 compatibility stopped: receipt RLS is disabled or missing';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',policyname,'permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check) ORDER BY policyname),'[]'::jsonb)
  INTO actual FROM pg_policies WHERE schemaname='public' AND tablename='calendar_action_receipts';
 IF actual IS DISTINCT FROM expected->'policies' THEN RAISE EXCEPTION 'Calendar 0038 compatibility stopped: receipt owner policy differs'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(expected->'tablePermissions') LOOP
  IF current_setting('server_version_num')::integer < coalesce((item->>'minimumServerVersion')::integer,0) THEN CONTINUE; END IF;
  IF has_table_privilege(item->>'role','public.calendar_action_receipts',item->>'privilege') IS DISTINCT FROM (item->>'allowed')::boolean THEN
   IF item->>'allowed'='false' AND expected->'receiptPrivilegeRepair' @> jsonb_build_array(jsonb_build_object('role',item->>'role','privilege',item->>'privilege')) THEN
    table_repairs:=table_repairs||jsonb_build_array(item);
   ELSE
    RAISE EXCEPTION 'Calendar 0038 compatibility stopped: receipt privilege differs for % %',item->>'role',item->>'privilege';
   END IF;
  END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(expected->'triggers') LOOP
  SELECT jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(t.oid),'enabled',tgenabled) INTO actual FROM pg_trigger t WHERE tgrelid='public.social_plans'::regclass AND tgname=item->>'name';
  IF actual IS DISTINCT FROM item THEN RAISE EXCEPTION 'Calendar 0038 compatibility stopped: trigger % is missing, disabled or differs',item->>'name'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND EXISTS(
  SELECT 1 FROM unnest(ARRAY['social_plans','living_experiences']) t WHERE NOT EXISTS(SELECT 1 FROM pg_publication_tables p WHERE p.pubname='supabase_realtime' AND p.schemaname='public' AND p.tablename=t)) THEN
  RAISE EXCEPTION 'Calendar 0038 compatibility stopped: expected Realtime subscription missing';
 END IF;
 IF cardinality(repairs)>0 OR jsonb_array_length(table_repairs)>0 THEN
  IF read_only THEN
   RAISE NOTICE 'Known Calendar 0038 requires permission repair: % anonymous function grants and % receipt-table privileges; preflight made no changes. Normal privileged runner will revoke only these grants after full validation.',cardinality(repairs),jsonb_array_length(table_repairs);
   RETURN;
  END IF;
  FOREACH fn IN ARRAY repairs LOOP
   EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',fn);
   IF has_function_privilege('anon',fn,'EXECUTE') THEN
    RAISE EXCEPTION 'Calendar 0038 compatibility stopped: anonymous EXECUTE remains inherited for %. No permission repair committed.',fn;
   END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(table_repairs) LOOP
   EXECUTE format('REVOKE %s ON TABLE public.calendar_action_receipts FROM %I',item->>'privilege',item->>'role');
   IF has_table_privilege(item->>'role','public.calendar_action_receipts',item->>'privilege') THEN
    RAISE EXCEPTION 'Calendar 0038 compatibility stopped: receipt privilege remains inherited for % %. No permission repair committed.',item->>'role',item->>'privilege';
   END IF;
  END LOOP;
  RAISE NOTICE 'Revoked reviewed grants on % functions and % receipt privileges; no user data or function bodies changed.',cardinality(repairs),jsonb_array_length(table_repairs);
 END IF;
 RAISE NOTICE 'Complete known Calendar 0038 installation verified. Preserve installed implementation; normal runner may record this historical migration.';
 RETURN;
END IF;
