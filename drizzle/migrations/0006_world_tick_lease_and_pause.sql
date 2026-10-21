CREATE UNIQUE INDEX job_runs_one_running ON public.job_runs (job) WHERE status = 'running';

CREATE TABLE public.world_control (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.world_control TO authenticated;
GRANT ALL ON public.world_control TO service_role;
ALTER TABLE public.world_control ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world_control_service_only" ON public.world_control FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.world_control (key, value) VALUES ('ai_pause', '{"paused": false}');