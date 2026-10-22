-- Reviewed, additive migration. Does not alter messages, media objects or existing anchors.
ALTER TABLE public.visual_identity_registry ADD COLUMN IF NOT EXISTS active_storage_path text;
CREATE TABLE IF NOT EXISTS public.profile_identity_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_key text NOT NULL,
  old_asset text,
  new_asset text NOT NULL,
  canonical_changed boolean NOT NULL DEFAULT false,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_identity_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_identity_changes_owner_read ON public.profile_identity_changes FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.profile_identity_changes TO authenticated;
GRANT ALL ON public.profile_identity_changes TO service_role;
CREATE OR REPLACE FUNCTION public.media_profile_status() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT 17 $$;
REVOKE ALL ON FUNCTION public.media_profile_status() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.media_profile_status() TO service_role;
CREATE OR REPLACE FUNCTION public.set_profile_media(p_user uuid,p_key text,p_avatar text,p_canonical text,p_sha text,p_source uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.visual_identity_registry%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user::text),hashtext('identity:'||p_key));
  IF p_key NOT IN ('tess','maya','claire','jordan','ben') OR
     NOT EXISTS(SELECT 1 FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=p_key) THEN
    RAISE EXCEPTION 'Owned character required';
  END IF;
  SELECT * INTO STRICT r FROM visual_identity_registry WHERE user_id=p_user AND entity_key=p_key FOR UPDATE;
  IF p_avatar NOT LIKE p_user::text||'/profile/'||p_key||'/%' OR p_avatar LIKE '%..%' OR
     (p_canonical IS NOT NULL AND (p_canonical NOT LIKE p_user::text||'/profile/'||p_key||'/%' OR p_canonical LIKE '%..%' OR p_sha !~ '^[a-f0-9]{64}$' OR p_sha IS NULL)) THEN
    RAISE EXCEPTION 'Invalid private identity path';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='tess-photos' AND name=p_avatar) OR
    (p_canonical IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='tess-photos' AND name=p_canonical)) THEN RAISE EXCEPTION 'Profile image missing'; END IF;
  IF p_source IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN characters ch ON ch.id=c.character_id
    WHERE m.id=p_source AND m.user_id=p_user AND c.user_id=p_user AND ch.key=p_key AND m.sender='tess' AND m.visible_at<=now()
    AND (m.metadata ? 'photo' OR m.metadata ? 'generated_path')
  ) THEN RAISE EXCEPTION 'Received character photo required'; END IF;
  UPDATE visual_identity_registry SET active_storage_path=p_avatar,active_message_id=NULL,
    active_reason='User-selected display photo; no character action implied.',
    canonical_asset=coalesce(p_canonical,canonical_asset),canonical_sha256=CASE WHEN p_canonical IS NULL THEN canonical_sha256 ELSE p_sha END,
    approval='approved',updated_at=now() WHERE user_id=p_user AND entity_key=p_key;
  INSERT INTO profile_identity_changes(user_id,entity_key,old_asset,new_asset,canonical_changed,source_message_id)
    VALUES(p_user,p_key,r.canonical_asset,coalesce(p_canonical,p_avatar),p_canonical IS NOT NULL,p_source);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_profile_media(uuid,text,text,text,text,uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_media(uuid,text,text,text,text,uuid) TO service_role;
-- Keep legacy screened-candidate selection compatible; selecting/resetting it also
-- clears a custom display crop, without altering a deliberately approved anchor.
ALTER FUNCTION public.update_active_portrait(uuid,text,uuid,text) RENAME TO update_screened_portrait;
CREATE FUNCTION public.update_active_portrait(p_user uuid,p_key text,p_message uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  result:=public.update_screened_portrait(p_user,p_key,p_message,p_reason);
  UPDATE visual_identity_registry SET active_storage_path=NULL WHERE user_id=p_user AND entity_key=p_key;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.update_active_portrait(uuid,text,uuid,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.update_active_portrait(uuid,text,uuid,text) TO service_role;
