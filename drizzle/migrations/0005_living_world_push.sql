-- Living world: scheduled/occurred character events, push subscriptions, job runs.

CREATE TABLE public.world_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  character_key text NOT NULL,
  kind text NOT NULL, -- life_event | initiation | relationship | knowledge | schedule
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurs_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX world_events_user_pending ON public.world_events (user_id, processed_at) WHERE processed_at IS NULL;
CREATE INDEX world_events_conversation ON public.world_events (conversation_id, occurs_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.world_events TO authenticated;
GRANT ALL ON public.world_events TO service_role;
ALTER TABLE public.world_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events select" ON public.world_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own events insert" ON public.world_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own events update" ON public.world_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own events delete" ON public.world_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL, -- { p256dh, auth }
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX push_subscriptions_user ON public.push_subscriptions (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subs select" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own subs insert" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own subs update" ON public.push_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own subs delete" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  status text NOT NULL DEFAULT 'running', -- running | ok | failed | paused
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT ALL ON public.job_runs TO service_role;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: job history is developer-only, read via server functions.

-- Per-conversation notification mute.
ALTER TABLE public.conversations ADD COLUMN muted boolean NOT NULL DEFAULT false;

-- User-level quiet hours (local wall-clock hours, America/New_York).
ALTER TABLE public.user_profile ADD COLUMN quiet_start smallint;
ALTER TABLE public.user_profile ADD COLUMN quiet_end smallint;