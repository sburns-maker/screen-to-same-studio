-- Wedding plans are proposals, not evidence of marriage.
-- Keep this ledger isolated from the canonical relationship commitment events.
CREATE TABLE IF NOT EXISTS public.family_wedding_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_key text NOT NULL CHECK(length(character_key) BETWEEN 1 AND 80),
  request_id uuid NOT NULL,
  calendar_event_id uuid,
  starts_at timestamptz NOT NULL,
  venue text NOT NULL CHECK(length(venue) BETWEEN 1 AND 200),
  user_response text NOT NULL DEFAULT 'accepted' CHECK(user_response IN ('pending','accepted','declined')),
  character_response text NOT NULL DEFAULT 'pending' CHECK(character_response IN ('pending','accepted','declined')),
  ceremony_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, character_key, request_id),
  CONSTRAINT ceremony_after_start CHECK(ceremony_completed_at IS NULL OR ceremony_completed_at >= starts_at),
  CONSTRAINT ceremony_mutual_consent CHECK(
    ceremony_completed_at IS NULL OR (user_response='accepted' AND character_response='accepted')
  )
);
CREATE INDEX IF NOT EXISTS family_wedding_plans_scope_idx
 ON public.family_wedding_plans(user_id, character_key, starts_at DESC);
ALTER TABLE public.family_wedding_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.family_wedding_plans FROM anon, authenticated;
-- Trusted server actions verify ownership and character-scoped consent.
