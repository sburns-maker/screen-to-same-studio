ALTER TABLE public.conversations ADD COLUMN real_time_mode boolean NOT NULL DEFAULT false;

CREATE TABLE public.tess_life (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  current_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_expires_at timestamptz,
  last_initiated_at timestamptz,
  last_initiation jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tess_life TO authenticated;
GRANT ALL ON public.tess_life TO service_role;
ALTER TABLE public.tess_life ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows select" ON public.tess_life FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own rows insert" ON public.tess_life FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own rows update" ON public.tess_life FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own rows delete" ON public.tess_life FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.memories ALTER COLUMN memory_type SET DEFAULT 'relationship';