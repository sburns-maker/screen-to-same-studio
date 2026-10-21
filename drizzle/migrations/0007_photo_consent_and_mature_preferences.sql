ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS mature_photography boolean NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS photo_boundary text NOT NULL DEFAULT 'none';
ALTER TABLE public.tess_state ADD COLUMN IF NOT EXISTS romantic_intent integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.conversations.mature_photography IS 'Explicit per-conversation opt-in for non-explicit adult romantic portraits; never grants character consent.';
COMMENT ON COLUMN public.conversations.photo_boundary IS 'Persistent character photo refusal scope: none, selfies, all_photos, mature.';
COMMENT ON COLUMN public.tess_state.romantic_intent IS 'Independent character relationship intent, not attraction or consent; initially unknown/zero, evolves from mutual interaction.';