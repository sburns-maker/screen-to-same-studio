-- Family life is opt-in. No triggers automatically create relationship or pregnancy events.
CREATE TABLE IF NOT EXISTS public.family_household_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_key text NOT NULL CHECK (length(character_key) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('move_in','move_out','share_home','separate_home')),
  proposed_by text NOT NULL CHECK (proposed_by IN ('user','character')),
  user_response text NOT NULL DEFAULT 'pending' CHECK (user_response IN ('pending','accepted','declined')),
  character_response text NOT NULL DEFAULT 'pending' CHECK (character_response IN ('pending','accepted','declined')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 150),
  UNIQUE(user_id, character_key, source_id, kind)
);
CREATE INDEX IF NOT EXISTS family_household_scope_idx
  ON public.family_household_events(user_id, character_key, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.family_pregnancy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_key text NOT NULL CHECK (length(character_key) BETWEEN 1 AND 80),
  encounter_id text NOT NULL CHECK(length(encounter_id) BETWEEN 1 AND 150),
  adult_eligible boolean NOT NULL CHECK(adult_eligible),
  mutually_agreed boolean NOT NULL CHECK(mutually_agreed),
  pregnancy_possible boolean NOT NULL CHECK(pregnancy_possible),
  probability double precision NOT NULL CHECK(probability >= 0 AND probability <= 1),
  random_roll double precision NOT NULL CHECK(random_roll >= 0 AND random_roll < 1),
  occurred_at timestamptz NOT NULL,
  reveal_at timestamptz NOT NULL,\n  CONSTRAINT correct_reveal_time CHECK(reveal_at = occurred_at + interval '12 hours'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','positive','negative')),
  disclosed_at timestamptz,
  CONSTRAINT disclosure_after_reveal CHECK(disclosed_at IS NULL OR disclosed_at >= reveal_at),
  UNIQUE(user_id, character_key, encounter_id)
);
CREATE INDEX IF NOT EXISTS family_pregnancy_scope_idx
  ON public.family_pregnancy_events(user_id, character_key, reveal_at DESC);

ALTER TABLE public.family_household_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_pregnancy_events ENABLE ROW LEVEL SECURITY;
-- No user-facing policies: both tables default deny on anon/authenticated.
-- Only privileged server routes may read/write. Public read models must redact
-- random_roll, probability and pending outcome until their reveal deadline.
REVOKE ALL ON public.family_pregnancy_events FROM anon, authenticated;
REVOKE ALL ON public.family_household_events FROM anon, authenticated;
