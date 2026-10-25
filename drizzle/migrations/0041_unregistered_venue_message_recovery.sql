-- Do not let an unregistered venue in an AI-proposed calendar change
-- roll back a prepared character message and its relationship progression.
-- Venue verification remains strict: invalid calendar updates are NOT applied.
CREATE OR REPLACE FUNCTION public.deliver_photo_turn(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE detail jsonb; r jsonb; source uuid; v_error text;
BEGIN
 SELECT j.detail INTO detail FROM public.job_runs j WHERE j.id=p_job_id;
 IF detail->>'userId' IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||(detail->>'userId'),0));
 END IF;
 SELECT j.detail INTO detail FROM public.job_runs j WHERE j.id=p_job_id FOR UPDATE;
 r:=public.deliver_photo_turn_before_calendar38(p_job_id);
 IF coalesce((r->>'count')::integer,0)>0
    AND jsonb_array_length(coalesce(detail->'plan'->'scheduleActions','[]'::jsonb))>0 THEN
  source:=(detail->'plan'->'rows'->0->>'id')::uuid;
  BEGIN
   PERFORM public.calendar_apply_actions((detail->>'userId')::uuid,'message',source,detail->'plan'->'scheduleActions',now());
  EXCEPTION WHEN raise_exception THEN
   GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
   IF v_error <> 'registered public venue required' THEN RAISE; END IF;
   -- The nested exception rolls back only calendar side-effects.
   -- Do not create a calendar receipt or confirm an invalid reschedule.
   RAISE LOG '[photo-delivery] skipped unregistered venue in calendar action, job %, message %',
     p_job_id,source;
  END;
 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.deliver_photo_turn(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_photo_turn(uuid) TO service_role;
