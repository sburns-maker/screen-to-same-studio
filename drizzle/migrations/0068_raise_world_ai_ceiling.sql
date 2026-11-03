CREATE OR REPLACE FUNCTION public.reserve_world_ai(p_user_id uuid, p_limit integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE k text; used integer;
BEGIN
  IF p_user_id IS NULL OR p_limit IS NULL OR p_limit<0 OR p_limit>1000 THEN RAISE EXCEPTION 'invalid autonomous AI budget'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,48));
  k:='world-ai:'||p_user_id::text;
  SELECT CASE WHEN value->>'day'=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') THEN coalesce((value->>'used')::integer,0) ELSE 0 END INTO used FROM public.world_control WHERE key=k;
  used:=coalesce(used,0);
  IF used>=p_limit THEN RETURN false; END IF;
  INSERT INTO public.world_control(key,value,updated_at) VALUES(k,jsonb_build_object('day',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'),'used',used+1),now())
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
  RETURN true;
END $function$;