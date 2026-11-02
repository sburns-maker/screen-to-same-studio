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

-- Stable provenance and appointment deduplication.
ALTER TABLE public.family_pregnancy_lifecycles ADD COLUMN IF NOT EXISTS resolution_source_id text;
CREATE UNIQUE INDEX IF NOT EXISTS family_pregnancy_appointment_calendar_unique
  ON public.family_pregnancy_appointments(lifecycle_id,calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

-- One transaction for birth and child creation; may only be called by a privileged server.
CREATE OR REPLACE FUNCTION public.finalize_family_pregnancy(
 p_user_id uuid, p_character_key text, p_lifecycle_id uuid,
 p_outcome text, p_source_id text, p_occurred_at timestamptz,
 p_child_name text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE changed_id uuid;
BEGIN
 IF p_outcome NOT IN ('ended_birth','ended_abortion','ended_miscarriage')
    OR p_source_id IS NULL OR length(trim(p_source_id))=0
    OR p_occurred_at IS NULL THEN
   RAISE EXCEPTION 'Invalid verified outcome';
 END IF;
 UPDATE public.family_pregnancy_lifecycles
 SET status=p_outcome, completed_at=p_occurred_at, resolution_source_id=p_source_id
 WHERE id=p_lifecycle_id AND user_id=p_user_id
   AND character_key=p_character_key AND status='pregnant'
 RETURNING id INTO changed_id;
 IF changed_id IS NULL THEN RETURN false; END IF;
 IF p_outcome='ended_birth' THEN
  INSERT INTO public.family_children(lifecycle_id,user_id,parent_character_key,born_at,name)
  VALUES (changed_id,p_user_id,p_character_key,p_occurred_at,p_child_name)
  ON CONFLICT (lifecycle_id) DO NOTHING;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finalize_family_pregnancy(uuid,text,uuid,text,text,timestamptz,text) FROM PUBLIC, anon, authenticated;

-- Character-authored appointment provenance protects against repeated reconciliation.
ALTER TABLE public.family_pregnancy_appointments ADD COLUMN IF NOT EXISTS source_message_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS family_pregnancy_appointments_source_once
 ON public.family_pregnancy_appointments(lifecycle_id,source_message_id);
