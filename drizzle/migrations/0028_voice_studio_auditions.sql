CREATE TABLE public.voice_studio_auditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  character_key text NOT NULL,
  voice_id text NOT NULL,
  session_id text,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','active','closed','failed','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  lease_until timestamptz NOT NULL,
  reserved_seconds integer NOT NULL,
  usage_seconds numeric,
  supervised boolean NOT NULL DEFAULT false,
  close_reason text,
  ended_at timestamptz
);
GRANT ALL ON public.voice_studio_auditions TO service_role;
ALTER TABLE public.voice_studio_auditions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX voice_studio_one_active ON public.voice_studio_auditions (user_id) WHERE state IN ('reserved','active');
CREATE INDEX voice_studio_auditions_user_time ON public.voice_studio_auditions (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.reserve_voice_audition(
  p_user uuid, p_character text, p_voice text, p_now timestamptz,
  p_limit_ms integer, p_lease_ms integer, p_reserved_seconds integer,
  p_daily_count integer, p_monthly_seconds integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_day integer; v_month integer; v_deadline timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('voice_audition:' || p_user::text));
  UPDATE voice_studio_auditions SET state = 'expired', ended_at = p_now,
    close_reason = coalesce(close_reason, 'lease_expired')
  WHERE user_id = p_user AND state IN ('reserved','active') AND lease_until <= p_now;
  IF EXISTS (SELECT 1 FROM voice_studio_auditions WHERE user_id = p_user AND state IN ('reserved','active')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'active');
  END IF;
  SELECT count(*) INTO v_day FROM voice_studio_auditions
    WHERE user_id = p_user AND created_at > p_now - interval '24 hours';
  IF v_day >= p_daily_count THEN RETURN jsonb_build_object('ok', false, 'reason', 'daily'); END IF;
  SELECT coalesce(sum(greatest(coalesce(usage_seconds, reserved_seconds), 15)), 0) INTO v_month
    FROM voice_studio_auditions WHERE user_id = p_user AND created_at > p_now - interval '30 days';
  IF v_month + p_reserved_seconds > p_monthly_seconds THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'monthly');
  END IF;
  v_deadline := p_now + make_interval(secs => p_limit_ms / 1000.0);
  INSERT INTO voice_studio_auditions (user_id, character_key, voice_id, created_at, deadline_at, lease_until, reserved_seconds)
  VALUES (p_user, p_character, p_voice, p_now, v_deadline, p_now + make_interval(secs => p_lease_ms / 1000.0), p_reserved_seconds)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'deadline_at', v_deadline, 'used_today', v_day + 1, 'used_month_seconds', v_month + p_reserved_seconds);
END $$;
REVOKE ALL ON FUNCTION public.reserve_voice_audition(uuid,text,text,timestamptz,integer,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_voice_audition(uuid,text,text,timestamptz,integer,integer,integer,integer,integer) TO service_role;