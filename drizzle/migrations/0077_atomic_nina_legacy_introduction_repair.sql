CREATE OR REPLACE FUNCTION public.repair_nina_legacy_intro(p_user uuid, p_conversation uuid, p_expected_ids uuid[], p_body text, p_metadata jsonb, p_photo uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actual_ids uuid[]; opening public.messages%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.conversations c JOIN public.characters ch ON ch.id=c.character_id WHERE c.id=p_conversation AND c.user_id=p_user AND ch.key='nina' FOR UPDATE OF c;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Serialize the short repair with message inserts, including player replies.
  LOCK TABLE public.messages IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg(id ORDER BY created_at,id) INTO actual_ids FROM public.messages WHERE conversation_id=p_conversation AND user_id=p_user;
  IF actual_ids IS DISTINCT FROM p_expected_ids OR coalesce(cardinality(actual_ids),0)=0 THEN RETURN false; END IF;
  SELECT * INTO opening FROM public.messages WHERE id=actual_ids[1] AND user_id=p_user AND conversation_id=p_conversation;
  IF opening.sender<>'tess' OR opening.body IS DISTINCT FROM 'Okay, important question. Did your team actually know any of those answers Friday or were you all confidently guessing?' OR coalesce(opening.metadata->>'generated_path','')<>'' OR coalesce(opening.metadata->>'photo','')<>'' OR coalesce(opening.metadata->>'generated_image_id','')<>'' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id=p_conversation AND m.user_id=p_user AND m.id<>opening.id AND (m.sender<>'tess' OR coalesce(m.metadata->>'initiated','')<>'true' OR coalesce(m.metadata->>'generated_path','')<>'' OR coalesce(m.metadata->>'photo','')<>'' OR coalesce(m.metadata->>'generated_image_id','')<>'' OR coalesce(m.metadata#>>'{photo_decision,generationAttempted}','')<>'false' OR coalesce(m.metadata#>>'{photo_decision,selectedAction}','')<>'text_only')) THEN RETURN false; END IF;
  IF p_metadata->>'generated_path' IS DISTINCT FROM p_user::text||'/nina-intro-v1.jpg' OR p_metadata->>'photo_source' IS DISTINCT FROM 'nina_intro_v1' OR p_metadata->>'generated_image_id' IS DISTINCT FROM p_photo::text OR coalesce(length(p_body),0)=0 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.nina_introductions WHERE user_id=p_user AND status<>'pending') THEN RETURN false; END IF;
  DELETE FROM public.messages WHERE conversation_id=p_conversation AND user_id=p_user AND id=ANY(p_expected_ids) AND id<>opening.id;
  UPDATE public.messages SET body=p_body,metadata=p_metadata WHERE id=opening.id AND user_id=p_user AND conversation_id=p_conversation;
  INSERT INTO public.nina_introductions(user_id,status,opening_message_id,opening_photo_id,introduced_at) VALUES(p_user,'delivered',opening.id,p_photo,now()) ON CONFLICT(user_id) DO UPDATE SET status='delivered',opening_message_id=excluded.opening_message_id,opening_photo_id=excluded.opening_photo_id,introduced_at=excluded.introduced_at;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.repair_nina_legacy_intro(uuid,uuid,uuid[],text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.repair_nina_legacy_intro(uuid,uuid,uuid[],text,jsonb,uuid) TO service_role;