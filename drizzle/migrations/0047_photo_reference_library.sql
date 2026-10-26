-- Additive, owner-scoped review records. No image generation, identity changes or backfill.
CREATE TABLE public.photo_reference_state (
 user_id uuid NOT NULL, character_key text NOT NULL CHECK(character_key IN('tess','maya','claire','riley','jordan','ben')),
 api18_enabled boolean NOT NULL DEFAULT false, adult_confirmed boolean NOT NULL DEFAULT false, CHECK(NOT api18_enabled OR adult_confirmed),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0), last_action uuid, PRIMARY KEY(user_id,character_key)
);
CREATE TABLE public.photo_reference_slots (
 user_id uuid NOT NULL, character_key text NOT NULL, role text NOT NULL CHECK(role IN('canonical','half_body','alternate_angle')),
 asset text NOT NULL, source_message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
 canonical_sha256 text NOT NULL CHECK(canonical_sha256 ~ '^[a-f0-9]{64}$'), content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'), reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,character_key,role), UNIQUE(user_id,character_key,asset), UNIQUE(user_id,character_key,content_sha256),
 FOREIGN KEY(user_id,character_key) REFERENCES public.photo_reference_state(user_id,character_key) ON DELETE CASCADE,
 CHECK((role='canonical' AND source_message_id IS NULL) OR (role<>'canonical' AND source_message_id IS NOT NULL))
);
CREATE TABLE public.photo_reference_rejections (
 user_id uuid NOT NULL, character_key text NOT NULL, asset text NOT NULL, source_message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
 canonical_sha256 text NOT NULL CHECK(canonical_sha256 ~ '^[a-f0-9]{64}$'), reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,character_key,asset), FOREIGN KEY(user_id,character_key) REFERENCES public.photo_reference_state(user_id,character_key) ON DELETE CASCADE
);
CREATE TABLE public.photo_reference_actions (
 user_id uuid NOT NULL, id uuid NOT NULL, character_key text NOT NULL, request jsonb NOT NULL, previous jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,character_key) REFERENCES public.photo_reference_state(user_id,character_key) ON DELETE CASCADE
);
CREATE INDEX photo_reference_actions_recent ON public.photo_reference_actions(user_id,character_key,created_at DESC);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['photo_reference_state','photo_reference_slots','photo_reference_rejections','photo_reference_actions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY reference_owner_read ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 END LOOP;END $$;
CREATE FUNCTION public.photo_reference_status() RETURNS integer LANGUAGE sql STABLE SET search_path=public AS $$SELECT 47$$;
CREATE FUNCTION public.photo_reference_candidate(p_user uuid,p_character text,p_message uuid,p_hash text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 IF NOT EXISTS(SELECT 1 FROM visual_identity_registry WHERE user_id=p_user AND entity_key=p_character AND approval='approved' AND canonical_sha256=p_hash) THEN RAISE EXCEPTION 'Canonical identity changed';END IF;
 IF p_message IS NULL THEN
  SELECT canonical_asset INTO a FROM visual_identity_registry WHERE user_id=p_user AND entity_key=p_character AND approval='approved' AND canonical_sha256=p_hash;
 ELSE
  SELECT m.metadata->>'generated_path' INTO a FROM messages m
   JOIN conversations c ON c.id=m.conversation_id AND c.user_id=m.user_id JOIN characters ch ON ch.id=c.character_id
   JOIN generated_images g ON g.user_id=m.user_id AND g.conversation_id=c.id AND g.storage_path=m.metadata->>'generated_path'
   WHERE m.id=p_message AND m.user_id=p_user AND ch.key=p_character AND m.sender='tess'
    AND m.visible_at<=now() AND m.visible_at<=c.last_read_at
    AND m.metadata->'photo_identity'->>'validationStatus'='screen_passed'
    AND m.metadata->'photo_identity'->>'canonicalSha256'=p_hash
    AND m.metadata->'photo_visual'->>'character'=p_character
    AND m.metadata->>'photo_type' IN('casual_selfie','personal_selfie','intimate_selfie','tess_candid','mature_romantic')
    AND g.photo_type=m.metadata->>'photo_type'
    AND (NOT(m.metadata ? 'generated_image_id') OR m.metadata->>'generated_image_id'=g.id::text)
    AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='tess-photos' AND o.name=g.storage_path)
   LIMIT 1;
  IF a !~ ('^'||p_user::text||'/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$') THEN a:=NULL;END IF;
 END IF;
 IF a IS NULL THEN RAISE EXCEPTION 'Reference is unavailable, unread, unscreened or belongs to a different identity';END IF;
 RETURN a;
END $$;
CREATE FUNCTION public.photo_reference_command(p_user uuid,p_id uuid,p_character text,p_action text,p_role text,p_message uuid,p_hash text,p_version integer,p_undo uuid DEFAULT NULL,p_reviewed_sha text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s photo_reference_state; old photo_reference_actions; r visual_identity_registry; a text; before_state jsonb; req jsonb; result jsonb; x record;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_user::text),hashtext('photo-reference:'||p_character));
 IF NOT EXISTS(SELECT 1 FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=p_character) THEN RAISE EXCEPTION 'Owned character required';END IF;
 req:=jsonb_build_array(p_character,p_action,p_role,p_message,p_hash,p_version,p_undo,p_reviewed_sha);
 SELECT * INTO old FROM photo_reference_actions WHERE user_id=p_user AND id=p_id;
 IF FOUND THEN IF old.request<>req THEN RAISE EXCEPTION 'Reference action id conflict';END IF;RETURN old.result;END IF;
 SELECT * INTO r FROM visual_identity_registry WHERE user_id=p_user AND entity_key=p_character FOR UPDATE;
 IF NOT FOUND OR r.approval<>'approved' OR p_hash IS DISTINCT FROM r.canonical_sha256 THEN RAISE EXCEPTION 'Canonical identity changed; refresh references';END IF;
 INSERT INTO photo_reference_state(user_id,character_key) VALUES(p_user,p_character) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM photo_reference_state WHERE user_id=p_user AND character_key=p_character FOR UPDATE;
 IF p_version IS DISTINCT FROM s.version THEN RAISE EXCEPTION 'Reference reviews changed; refresh before retrying';END IF;
 before_state:=jsonb_build_object('slots',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM photo_reference_slots t WHERE user_id=p_user AND character_key=p_character),'[]'),
 'rejections',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM photo_reference_rejections t WHERE user_id=p_user AND character_key=p_character),'[]'));
 IF p_action='undo' THEN
  IF p_undo IS DISTINCT FROM s.last_action OR p_undo IS NULL THEN RAISE EXCEPTION 'Only the latest review can be undone';END IF;
  SELECT * INTO STRICT old FROM photo_reference_actions WHERE user_id=p_user AND id=p_undo AND character_key=p_character;
  FOR x IN SELECT * FROM jsonb_populate_recordset(NULL::photo_reference_slots,old.previous->'slots') LOOP
   IF x.canonical_sha256<>p_hash OR photo_reference_candidate(p_user,p_character,x.source_message_id,p_hash)<>x.asset THEN RAISE EXCEPTION 'Previous reference no longer compatible';END IF;
  END LOOP;
  DELETE FROM photo_reference_slots WHERE user_id=p_user AND character_key=p_character;
  DELETE FROM photo_reference_rejections WHERE user_id=p_user AND character_key=p_character;
  INSERT INTO photo_reference_slots SELECT * FROM jsonb_populate_recordset(NULL::photo_reference_slots,old.previous->'slots');
  INSERT INTO photo_reference_rejections SELECT * FROM jsonb_populate_recordset(NULL::photo_reference_rejections,old.previous->'rejections');
 ELSIF p_action='remove' THEN
  IF p_role IS NULL OR p_role NOT IN('canonical','half_body','alternate_angle') THEN RAISE EXCEPTION 'Invalid reference role';END IF;
  DELETE FROM photo_reference_slots WHERE user_id=p_user AND character_key=p_character AND role=p_role;
 ELSIF p_action IN('approve','reject') THEN
  a:=photo_reference_candidate(p_user,p_character,p_message,p_hash);
  IF p_action='reject' THEN
   IF p_message IS NULL THEN RAISE EXCEPTION 'Cannot reject the canonical identity; change it through profile review';END IF;
   INSERT INTO photo_reference_rejections(user_id,character_key,asset,source_message_id,canonical_sha256) VALUES(p_user,p_character,a,p_message,p_hash)
    ON CONFLICT(user_id,character_key,asset) DO UPDATE SET canonical_sha256=excluded.canonical_sha256,reviewed_at=now();
   DELETE FROM photo_reference_slots WHERE user_id=p_user AND character_key=p_character AND asset=a;
  ELSE
   IF p_reviewed_sha IS NULL OR p_reviewed_sha !~ '^[a-f0-9]{64}$' OR (p_message IS NULL AND p_reviewed_sha<>p_hash) THEN RAISE EXCEPTION 'Reviewed image hash required';END IF;
   IF p_role IS NULL OR p_role NOT IN('canonical','half_body','alternate_angle') OR (p_role='canonical') IS DISTINCT FROM (p_message IS NULL) THEN RAISE EXCEPTION 'Invalid reference role or source';END IF;
   IF EXISTS(SELECT 1 FROM photo_reference_rejections WHERE user_id=p_user AND character_key=p_character AND asset=a AND canonical_sha256=p_hash) THEN RAISE EXCEPTION 'Undo rejection before approval';END IF;
   INSERT INTO photo_reference_slots(user_id,character_key,role,asset,source_message_id,canonical_sha256,content_sha256) VALUES(p_user,p_character,p_role,a,p_message,p_hash,p_reviewed_sha)
    ON CONFLICT(user_id,character_key,role) DO UPDATE SET asset=excluded.asset,source_message_id=excluded.source_message_id,canonical_sha256=excluded.canonical_sha256,content_sha256=excluded.content_sha256,reviewed_at=now();
  END IF;
 ELSE RAISE EXCEPTION 'Unknown reference action';END IF;
 UPDATE photo_reference_state SET version=version+1,last_action=p_id WHERE user_id=p_user AND character_key=p_character RETURNING * INTO s;
 result:=jsonb_build_object('version',s.version,'lastAction',p_id);
 INSERT INTO photo_reference_actions(user_id,id,character_key,request,previous,result) VALUES(p_user,p_id,p_character,req,before_state,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.photo_reference_status(),public.photo_reference_candidate(uuid,text,uuid,text),public.photo_reference_command(uuid,uuid,text,text,text,uuid,text,integer,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.photo_reference_status(),public.photo_reference_candidate(uuid,text,uuid,text),public.photo_reference_command(uuid,uuid,text,text,text,uuid,text,integer,uuid,text) TO service_role;

CREATE FUNCTION public.photo_reference_preferences(p_user uuid,p_character text,p_enabled boolean,p_adult boolean,p_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_user::text),hashtext('photo-reference:'||p_character));
 IF NOT EXISTS(SELECT 1 FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=p_character) THEN RAISE EXCEPTION 'Owned adult character required';END IF;
 IF p_enabled IS NULL OR p_adult IS NULL OR (p_enabled AND NOT p_adult) THEN RAISE EXCEPTION 'Explicit adult confirmation required';END IF;
 INSERT INTO photo_reference_state(user_id,character_key) VALUES(p_user,p_character) ON CONFLICT DO NOTHING;
 SELECT version INTO v FROM photo_reference_state WHERE user_id=p_user AND character_key=p_character FOR UPDATE;
 IF p_version IS DISTINCT FROM v THEN RAISE EXCEPTION 'Reference settings changed';END IF;
 UPDATE photo_reference_state SET api18_enabled=p_enabled,adult_confirmed=p_adult,version=version+1,last_action=NULL WHERE user_id=p_user AND character_key=p_character;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.photo_reference_preferences(uuid,text,boolean,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.photo_reference_preferences(uuid,text,boolean,boolean,integer) TO service_role;
