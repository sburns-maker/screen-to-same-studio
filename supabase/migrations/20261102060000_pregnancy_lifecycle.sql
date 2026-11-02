-- Extends the existing 12-hour outcome/awareness system without changing it.
-- Lifecycle rows are independently attached to POSITIVE pregnancy events.
CREATE TABLE IF NOT EXISTS public.family_pregnancy_lifecycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pregnancy_event_id uuid NOT NULL UNIQUE REFERENCES public.family_pregnancy_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_key text NOT NULL CHECK (length(character_key) BETWEEN 1 AND 80),
  started_at timestamptz NOT NULL,
  choice text NOT NULL DEFAULT 'undecided' CHECK (choice IN ('undecided','continue','abortion','adoption')),
  choice_at timestamptz,
  status text NOT NULL DEFAULT 'pregnant' CHECK (status IN ('pregnant','ended_abortion','ended_miscarriage','ended_birth')),
  completed_at timestamptz,
  CONSTRAINT lifecycle_finish_consistent CHECK ((status='pregnant' AND completed_at IS NULL) OR (status<>'pregnant' AND completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS family_pregnancy_lifecycles_scope_idx ON public.family_pregnancy_lifecycles(user_id, character_key);

CREATE TABLE IF NOT EXISTS public.family_pregnancy_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lifecycle_id uuid NOT NULL REFERENCES public.family_pregnancy_lifecycles(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 100),
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  notes text,
  UNIQUE(lifecycle_id,key)
);
CREATE INDEX IF NOT EXISTS family_pregnancy_milestone_due_idx ON public.family_pregnancy_milestones(due_at) WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.family_pregnancy_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lifecycle_id uuid NOT NULL REFERENCES public.family_pregnancy_lifecycles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 100),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('proposed','scheduled','completed','cancelled')),
  calendar_event_id uuid,
  created_by text NOT NULL CHECK(created_by IN ('character','system')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_pregnancy_appointments_lifecycle_idx ON public.family_pregnancy_appointments(lifecycle_id,scheduled_at);

CREATE TABLE IF NOT EXISTS public.family_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lifecycle_id uuid NOT NULL UNIQUE REFERENCES public.family_pregnancy_lifecycles(id),
  parent_character_key text NOT NULL,
  born_at timestamptz NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_children_user_idx ON public.family_children(user_id);

ALTER TABLE public.family_pregnancy_lifecycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_pregnancy_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_pregnancy_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_children ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.family_pregnancy_lifecycles, public.family_pregnancy_milestones,
  public.family_pregnancy_appointments, public.family_children FROM anon, authenticated;
-- Existing pregnancy events are intentionally not modified or backfilled by migration.
