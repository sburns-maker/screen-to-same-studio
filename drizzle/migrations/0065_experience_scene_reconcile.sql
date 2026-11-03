CREATE TABLE IF NOT EXISTS public.experience_scene_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  experience_id uuid NOT NULL,
  evidence_source_id uuid NOT NULL,
  evidence_ordinal integer NOT NULL,
  before_scene jsonb,
  after_scene jsonb NOT NULL,
  before_revision integer NOT NULL,
  reason text NOT NULL CHECK (length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, experience_id) REFERENCES public.living_experiences(user_id, id) ON DELETE CASCADE
);
GRANT ALL ON public.experience_scene_reconciliations TO service_role;
REVOKE ALL ON public.experience_scene_reconciliations FROM anon, authenticated;
ALTER TABLE public.experience_scene_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.experience_scene_reconcile(p_user uuid, p_plan uuid, p_revision integer, p_scene jsonb, p_evidence uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE e living_experiences; p social_plans; m living_experience_moments; ch characters; loc text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
  SELECT * INTO p FROM social_plans WHERE user_id=p_user AND id=p_plan FOR UPDATE;
  SELECT * INTO e FROM living_experiences WHERE user_id=p_user AND plan_id=p_plan FOR UPDATE;
  IF e.id IS NULL OR e.mode IS DISTINCT FROM 'interactive' OR e.state NOT IN ('interactive','paused') THEN RAISE EXCEPTION 'Owned interactive experience required'; END IF;
  IF p_revision IS DISTINCT FROM e.scene_revision THEN RAISE EXCEPTION 'Scene revision changed'; END IF;
  SELECT chars.* INTO ch FROM conversations c JOIN characters chars ON chars.id=c.character_id WHERE c.user_id=p_user AND c.id=e.conversation_id;
  SELECT * INTO m FROM living_experience_moments WHERE user_id=p_user AND id=p_evidence AND experience_id=e.id AND source='user' AND confirmed;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Recorded player evidence required'; END IF;
  IF jsonb_typeof(p_scene)<>'object' OR octet_length(p_scene::text)>3000 THEN RAISE EXCEPTION 'Bounded scene required'; END IF;
  IF p_scene->'participants' IS DISTINCT FROM jsonb_build_array('user',ch.key) THEN RAISE EXCEPTION 'Scene participants must match'; END IF;
  IF coalesce(p_scene->>'activity','') NOT IN('talking','walking','driving','arriving','ordering','dining','finished_meal','at_front_door','waiting','cooking','watching_movie','playing_game','household_chore','relaxing','sitting','reviewing_roommate_plan') THEN RAISE EXCEPTION 'Invalid scene activity'; END IF;
  loc := p_scene->>'locationKey';
  -- Reconciliation may only correct within locations already reached through recorded transitions.
  IF loc IS DISTINCT FROM e.live_scene->>'locationKey' AND loc IS DISTINCT FROM p.place_key
     AND NOT EXISTS (SELECT 1 FROM experience_scene_transitions t WHERE t.user_id=p_user AND t.experience_id=e.id AND t.after_scene->>'locationKey'=loc)
  THEN RAISE EXCEPTION 'Reconciled location must already be established'; END IF;
  INSERT INTO experience_scene_reconciliations(user_id,experience_id,evidence_source_id,evidence_ordinal,before_scene,after_scene,before_revision,reason)
    VALUES(p_user,e.id,m.id,m.ordinal,e.live_scene,p_scene,e.scene_revision,left(coalesce(p_reason,'replay'),200));
  UPDATE living_experiences SET live_scene=p_scene, scene_revision=scene_revision+1, scene_source_ordinal=greatest(scene_source_ordinal,m.ordinal) WHERE user_id=p_user AND id=e.id;
  RETURN jsonb_build_object('scene',p_scene,'revision',e.scene_revision+1);
END $$;
REVOKE ALL ON FUNCTION public.experience_scene_reconcile(uuid,uuid,integer,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.experience_scene_reconcile(uuid,uuid,integer,jsonb,uuid,text) TO service_role;