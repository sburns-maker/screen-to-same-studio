CREATE TABLE IF NOT EXISTS public.photo_reference_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  character_key text NOT NULL,
  asset text NOT NULL UNIQUE,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  canonical_sha256 text NOT NULL CHECK (canonical_sha256 ~ '^[a-f0-9]{64}$'),
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, character_key, content_sha256)
);
GRANT ALL ON public.photo_reference_uploads TO service_role;
ALTER TABLE public.photo_reference_uploads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.photo_reference_slots ADD COLUMN IF NOT EXISTS source_upload_id uuid REFERENCES public.photo_reference_uploads(id) ON DELETE CASCADE;
ALTER TABLE public.photo_reference_slots DROP CONSTRAINT IF EXISTS photo_reference_slots_check;
ALTER TABLE public.photo_reference_slots ADD CONSTRAINT photo_reference_slots_check CHECK (
  (role = 'canonical' AND source_message_id IS NULL AND source_upload_id IS NULL)
  OR (role <> 'canonical' AND num_nonnulls(source_message_id, source_upload_id) = 1));

DO $m$
DECLARE d text; u text; v text;
BEGIN
 SELECT pg_get_functiondef('public.photo_reference_candidate(uuid,text,uuid,text)'::regprocedure) INTO d;
 IF position('photo_reference_uploads' IN d) = 0 THEN
  u := replace(d, ' IF a IS NULL THEN RAISE EXCEPTION', ' IF a IS NULL AND p_message IS NOT NULL THEN
  SELECT x.asset INTO a FROM photo_reference_uploads x WHERE x.id=p_message AND x.user_id=p_user AND x.character_key=p_character AND x.canonical_sha256=p_hash
   AND x.asset ~ (''^''||p_user::text||''/reference-uploads/[a-z]+/[a-f0-9]{64}\.(jpg|jpeg|png|webp)$'')
   AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=''tess-photos'' AND o.name=x.asset);
 END IF;
 IF a IS NULL THEN RAISE EXCEPTION');
  IF u = d THEN RAISE EXCEPTION 'candidate anchor missing'; END IF;
  EXECUTE u;
 END IF;
 SELECT pg_get_functiondef('public.photo_reference_command(uuid,uuid,text,text,text,uuid,text,integer,uuid,text)'::regprocedure) INTO d;
 IF position('source_upload_id' IN d) = 0 THEN
  u := replace(d, 'x.source_message_id,p_hash)', 'coalesce(x.source_message_id,x.source_upload_id),p_hash)');
  IF u = d THEN RAISE EXCEPTION 'anchor 1'; END IF;
  v := replace(u, 'VALUES(p_user,p_character,a,p_message,p_hash)', 'VALUES(p_user,p_character,a,(SELECT id FROM messages WHERE id=p_message),p_hash)');
  IF v = u THEN RAISE EXCEPTION 'anchor 2'; END IF;
  u := replace(v, 'source_message_id,canonical_sha256,content_sha256) VALUES(p_user,p_character,p_role,a,p_message,p_hash,p_reviewed_sha)',
    'source_message_id,source_upload_id,canonical_sha256,content_sha256) VALUES(p_user,p_character,p_role,a,(SELECT id FROM messages WHERE id=p_message),(SELECT id FROM photo_reference_uploads WHERE id=p_message AND user_id=p_user),p_hash,p_reviewed_sha)');
  IF v = u THEN RAISE EXCEPTION 'anchor 3'; END IF;
  v := replace(u, 'source_message_id=excluded.source_message_id,', 'source_message_id=excluded.source_message_id,source_upload_id=excluded.source_upload_id,');
  IF v = u THEN RAISE EXCEPTION 'anchor 4'; END IF;
  EXECUTE v;
 END IF;
END $m$;