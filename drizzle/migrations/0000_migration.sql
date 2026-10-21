CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  difficulty text NOT NULL DEFAULT 'realistic',
  relationship_stage text NOT NULL DEFAULT 'Newly acquainted',
  typing_indicator boolean NOT NULL DEFAULT true,
  read_receipts boolean NOT NULL DEFAULT true,
  show_sim_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sender text NOT NULL CHECK (sender IN ('user','tess')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  visible_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX messages_conv_idx ON public.messages(conversation_id, created_at);
CREATE TABLE public.tess_state (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  comfort int NOT NULL DEFAULT 42,
  trust int NOT NULL DEFAULT 25,
  romantic_attraction int NOT NULL DEFAULT 24,
  physical_attraction int NOT NULL DEFAULT 34,
  curiosity int NOT NULL DEFAULT 52,
  emotional_intimacy int NOT NULL DEFAULT 10,
  perceived_pressure int NOT NULL DEFAULT 4,
  irritation int NOT NULL DEFAULT 0,
  respect int NOT NULL DEFAULT 44,
  playfulness int NOT NULL DEFAULT 38,
  relationship_momentum int NOT NULL DEFAULT 22,
  last_delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_tone text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  memory_type text NOT NULL DEFAULT 'relationship',
  summary text NOT NULL,
  importance int NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.debriefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  analysis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['conversations','messages','tess_state','memories','debriefs'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "own rows select" ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "own rows insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "own rows update" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "own rows delete" ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;