-- Phase 6 additive schema: an outing has exactly one authoritative execution.
CREATE TABLE public.living_experiences (
 user_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL,
 conversation_id uuid,
 state text NOT NULL DEFAULT 'scheduled' CHECK(state IN('scheduled','interactive','paused','auto_running','completed','cancelled')),
 mode text CHECK(mode IN('interactive','automatic')),
 start_at timestamptz NOT NULL,
 claim_deadline timestamptz NOT NULL,
 claimed_at timestamptz,
 revision integer NOT NULL DEFAULT 0,
 outcome_id uuid UNIQUE,
 summary text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,id),
 UNIQUE(user_id,plan_id),
 FOREIGN KEY(user_id,plan_id) REFERENCES public.social_plans(user_id,id) ON DELETE CASCADE,
 CHECK(claim_deadline>start_at),
 CHECK(outcome_id IS NULL OR state='completed')
);
CREATE TABLE public.living_experience_moments(
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 experience_id uuid NOT NULL,
 ordinal integer NOT NULL,
 kind text NOT NULL CHECK(kind IN('conversation','activity','affection','departure')),
 body text NOT NULL CHECK(length(body)<=3000),
 source text NOT NULL CHECK(source IN('user','character','simulation')),
 confirmed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,id),
 UNIQUE(user_id,experience_id,ordinal),
 FOREIGN KEY(user_id,experience_id) REFERENCES public.living_experiences(user_id,id) ON DELETE CASCADE
);
ALTER TABLE public.living_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.living_experience_moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_own_experiences ON public.living_experiences FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY read_own_experience_moments ON public.living_experience_moments FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.living_experiences,public.living_experience_moments TO authenticated;
GRANT ALL ON public.living_experiences,public.living_experience_moments TO service_role;
CREATE FUNCTION public.living_experience_action(p_user uuid,p_plan uuid,p_action text,p_now timestamptz,p_expected_revision integer DEFAULT NULL,p_outcome uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.living_experiences; p public.social_plans; destination text;
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 SELECT * INTO p FROM public.social_plans WHERE user_id=p_user AND id=p_plan FOR UPDATE;
 IF NOT FOUND OR p.status NOT IN ('accepted','in_progress','active','completed') OR p.starts_at IS NULL
 THEN RAISE EXCEPTION 'eligible owned confirmed plan required'; END IF;
 INSERT INTO public.living_experiences(user_id,plan_id,conversation_id,start_at,claim_deadline)
 VALUES(p_user,p_plan,p.conversation_id,p.starts_at,p.starts_at+interval '4 hours')
 ON CONFLICT(user_id,plan_id) DO NOTHING;
 SELECT * INTO e FROM public.living_experiences WHERE user_id=p_user AND plan_id=p_plan FOR UPDATE;
 IF p_expected_revision IS NOT NULL AND e.revision<>p_expected_revision THEN RAISE EXCEPTION 'experience changed, reload'; END IF;
 IF p_action='claim' AND e.state='scheduled' AND p_now>=e.start_at AND p_now<e.claim_deadline THEN
   destination:='interactive';
 ELSIF p_action='auto_claim' AND e.state='scheduled' AND p_now>=e.claim_deadline AND e.claimed_at IS NULL THEN
   destination:='auto_running';
 ELSIF p_action='pause' AND e.state='interactive' THEN destination:='paused';
 ELSIF p_action='resume' AND e.state='paused' THEN destination:='interactive';
 ELSIF p_action='finish' AND e.state IN ('interactive','paused','auto_running') AND p_outcome IS NOT NULL AND e.outcome_id IS NULL THEN destination:='completed';
 ELSE RAISE EXCEPTION 'experience transition not permitted'; END IF;
 UPDATE public.living_experiences SET state=destination,
 mode=CASE WHEN p_action='claim' THEN 'interactive' WHEN p_action='auto_claim' THEN 'automatic' ELSE mode END,
 claimed_at=CASE WHEN p_action IN('claim','auto_claim') THEN p_now ELSE claimed_at END,
 outcome_id=CASE WHEN p_action='finish' THEN p_outcome ELSE outcome_id END,
 revision=revision+1,updated_at=p_now WHERE user_id=p_user AND id=e.id;
 RETURN (SELECT to_jsonb(x) FROM public.living_experiences x WHERE x.user_id=p_user AND x.id=e.id);
END;$$;
REVOKE ALL ON FUNCTION public.living_experience_action(uuid,uuid,text,timestamptz,integer,uuid) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.living_experience_action(uuid,uuid,text,timestamptz,integer,uuid) TO service_role;
