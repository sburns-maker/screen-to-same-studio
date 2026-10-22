-- Reuse the service-only job ledger as a durable photo outbox. No user data reset or table changes.
CREATE OR REPLACE FUNCTION public.deliver_photo_turn(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  j public.job_runs;
  p jsonb;
  cid uuid;
  uid uuid;
  s public.tess_state;
  newest_user uuid;
  result jsonb;
BEGIN
  -- Capability probe before a paid image request.
  IF p_job_id IS NULL THEN RETURN '{"version":1}'::jsonb; END IF;
  SELECT * INTO j FROM public.job_runs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR j.job NOT LIKE 'photo-turn:%' THEN RAISE EXCEPTION 'photo action not found'; END IF;
  IF j.status = 'ok' THEN RETURN '{"count":0,"lastVisibleAt":null,"replayed":true}'::jsonb; END IF;
  IF j.status <> 'running' OR j.detail->>'phase' <> 'prepared' THEN RAISE EXCEPTION 'photo action is not prepared'; END IF;
  p := j.detail->'plan'; cid := (j.detail->>'conversationId')::uuid; uid := (j.detail->>'userId')::uuid;
  PERFORM 1 FROM public.conversations WHERE id = cid AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation owner mismatch'; END IF;
  SELECT * INTO s FROM public.tess_state WHERE conversation_id = cid AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation state missing'; END IF;
  SELECT id INTO newest_user FROM public.messages WHERE conversation_id = cid AND sender = 'user' ORDER BY created_at DESC, id DESC LIMIT 1;
  -- Never replace a newer turn's state or send an obsolete response after recovery.
  IF s.updated_at IS DISTINCT FROM (p->>'expectedStateUpdatedAt')::timestamptz
    OR newest_user IS DISTINCT FROM (p->>'lastUserId')::uuid THEN
    UPDATE public.job_runs SET status = 'failed', finished_at = now(), detail = detail || '{"reason":"stale photo turn"}'::jsonb WHERE id = p_job_id;
    RETURN '{"count":0,"lastVisibleAt":null,"reason":"stale photo turn"}'::jsonb;
  END IF;
  IF NOT (p->>'initiation')::boolean THEN
    -- Keep already-generated photos (and their costs) when a later user message arrives.
    DELETE FROM public.messages WHERE conversation_id = cid AND sender = 'tess' AND visible_at > (p->>'pendingBefore')::timestamptz
      AND NOT (metadata ? 'generated_path' OR metadata ? 'photo');
  END IF;
  INSERT INTO public.messages (id, conversation_id, user_id, sender, body, visible_at, created_at, metadata)
    SELECT x.id, cid, uid, 'tess', x.body, x.visible_at, x.created_at, x.metadata
    FROM jsonb_populate_recordset(NULL::public.messages, p->'rows') x;
  IF p->'generated' <> 'null'::jsonb THEN
    INSERT INTO public.generated_images SELECT x.* FROM jsonb_populate_record(NULL::public.generated_images, p->'generated') x;
  END IF;
  UPDATE public.tess_state SET
    comfort = (p->'state'->>'comfort')::int, trust = (p->'state'->>'trust')::int,
    romantic_attraction = (p->'state'->>'romantic_attraction')::int, physical_attraction = (p->'state'->>'physical_attraction')::int,
    curiosity = (p->'state'->>'curiosity')::int, emotional_intimacy = (p->'state'->>'emotional_intimacy')::int,
    perceived_pressure = (p->'state'->>'perceived_pressure')::int, irritation = (p->'state'->>'irritation')::int,
    respect = (p->'state'->>'respect')::int, playfulness = (p->'state'->>'playfulness')::int,
    relationship_momentum = (p->'state'->>'relationship_momentum')::int, romantic_intent = (p->'state'->>'romantic_intent')::int,
    last_delta = p->'state'->'last_delta', last_tone = p->'state'->>'last_tone', updated_at = now()
    WHERE conversation_id = cid;
  UPDATE public.conversations SET relationship_stage = p->>'stage', photo_boundary = p->>'boundary', updated_at = now() WHERE id = cid;
  INSERT INTO public.memories (conversation_id, user_id, memory_type, summary, importance)
    SELECT cid, uid, m->>'memory_type', m->>'summary', (m->>'importance')::int
    FROM jsonb_array_elements(p->'memories') m
    WHERE NOT EXISTS (SELECT 1 FROM public.memories old WHERE old.conversation_id = cid AND old.summary = m->>'summary');
  IF (p->>'initiation')::boolean THEN
    UPDATE public.tess_life SET last_initiated_at = now(), updated_at = now() WHERE conversation_id = cid;
  END IF;
  INSERT INTO public.world_events (user_id, conversation_id, character_key, kind, summary, payload, processed_at)
    SELECT uid, cid, ch.key, CASE WHEN p->'rows'->0->'metadata' ? 'generated_path' OR p->'rows'->0->'metadata' ? 'photo' THEN 'photo_shared' ELSE 'character_turn' END,
      ch.preferred_name || CASE WHEN p->'rows'->0->'metadata' ? 'generated_path' OR p->'rows'->0->'metadata' ? 'photo' THEN ' shared a photo' ELSE ' sent a message' END,
      jsonb_build_object('messageId', p->'rows'->0->>'id', 'initiated', p->'initiation'), now()
    FROM public.conversations c JOIN public.characters ch ON ch.id = c.character_id WHERE c.id = cid AND jsonb_array_length(p->'rows') > 0;
  result := jsonb_build_object('count', jsonb_array_length(p->'rows'), 'lastVisibleAt', p->'rows'->-1->>'visible_at', 'notificationGroup', p->'rows'->0->'metadata'->>'notification_group');
  UPDATE public.job_runs SET status = 'ok', finished_at = now(), detail = jsonb_build_object('userId', uid, 'conversationId', cid, 'result', result) WHERE id = p_job_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.deliver_photo_turn(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_photo_turn(uuid) TO service_role;
