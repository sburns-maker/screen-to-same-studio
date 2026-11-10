CREATE OR REPLACE FUNCTION public.spicy_photo_finish(p_action uuid,p_token uuid,p_metadata jsonb,p_failure text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j spicy_photo_jobs;msg messages;path text;ordinary boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 SELECT * INTO j FROM spicy_photo_jobs WHERE action_id=p_action FOR UPDATE;
 IF j.status IN('completed','failed') THEN RETURN true;END IF;
 IF p_token IS NULL OR j.lease_until IS NULL OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<now() THEN RETURN false;END IF;
 ordinary := j.payload->>'type'='ordinary' AND coalesce(j.payload->>'photoType','personal_selfie') IN('object','tess_candid','casual_selfie','personal_selfie','intimate_selfie');
 IF p_failure IS NULL AND NOT EXISTS(SELECT 1 FROM photo_reference_state WHERE user_id=j.user_id AND character_key=j.character_key AND spicy_enabled AND adult_confirmed) THEN p_failure:='spicy_permission_changed';END IF;
 IF p_failure IS NULL AND coalesce(j.payload->>'delivery','chat')<>'lab' AND ordinary AND NOT EXISTS(SELECT 1 FROM conversations c WHERE c.id=j.conversation_id AND c.user_id=j.user_id AND c.photo_boundary IN('none','selfies','all_photos','mature'))
 THEN p_failure:='spicy_boundary_changed';END IF;
 IF p_failure IS NULL AND coalesce(j.payload->>'delivery','chat')<>'lab' AND NOT ordinary AND NOT EXISTS(SELECT 1 FROM conversations c JOIN tess_state s ON s.conversation_id=c.id AND s.user_id=c.user_id
  WHERE c.id=j.conversation_id AND c.user_id=j.user_id AND c.mature_photography AND c.photo_boundary='none' AND s.comfort>=65 AND s.trust>=55 AND s.emotional_intimacy>=40 AND s.romantic_attraction>=45 AND s.romantic_intent>=40 AND s.perceived_pressure<30 AND s.irritation<20)
 THEN p_failure:='spicy_boundary_changed';END IF;
 IF j.payload->>'delivery'='lab' THEN
  path:=p_metadata->>'generated_path';
  IF p_failure IS NULL AND path IS DISTINCT FROM j.user_id::text||'/developer-photo-tests/'||j.action_id::text||'.png' THEN RAISE EXCEPTION 'test completion scope mismatch';END IF;
  UPDATE job_runs SET status=CASE WHEN p_failure IS NULL THEN 'ok' ELSE 'failed' END,finished_at=now(),detail=detail||jsonb_build_object('phase',CASE WHEN p_failure IS NULL THEN 'stored' ELSE 'failed' END,'path',path,'diagnostics',p_metadata->'photo_identity','reason',p_failure)
  WHERE id=p_action AND job LIKE 'developer-photo-lab:%' AND detail->>'userId'=j.user_id::text AND detail->>'phase'='spicy_pending';
  IF NOT FOUND THEN RETURN false;END IF;
  UPDATE spicy_photo_jobs SET status=CASE WHEN p_failure IS NULL THEN 'completed' ELSE 'failed' END,failure_code=p_failure,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE action_id=p_action;
  UPDATE media_attempts SET status=CASE WHEN p_failure IS NULL THEN 'generated' ELSE 'failed' END,storage_path=path WHERE action_id=p_action AND user_id=j.user_id;
  RETURN true;
 END IF;
 SELECT * INTO msg FROM messages WHERE user_id=j.user_id AND conversation_id=j.conversation_id AND metadata->'photo_pending'->>'actionId'=p_action::text FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF p_failure IS NULL THEN
  path:=p_metadata->>'generated_path';
  IF path IS DISTINCT FROM j.user_id::text||'/'||j.action_id::text||'.png' OR p_metadata->'photo_identity'->>'canonicalSha256' IS DISTINCT FROM j.payload->>'canonicalSha256' THEN RAISE EXCEPTION 'photo completion scope mismatch';END IF;
  INSERT INTO generated_images(id,user_id,conversation_id,message_id,photo_type,scene,includes_tess,is_selfie,provider,model,storage_path,identity_reference_used,
   pose_type,camera_angle,crop_type,hairstyle,expression,clothing_category,setting,selfie_type)
  VALUES(j.action_id,j.user_id,j.conversation_id,msg.id,CASE WHEN ordinary THEN coalesce(j.payload->>'photoType','personal_selfie') ELSE 'mature_romantic' END,j.payload->>'scene',true,true,'spicyapi',j.model,path,j.character_key,
   j.payload->'style'->>'pose_type',j.payload->'style'->>'camera_angle',j.payload->'style'->>'crop_type',j.payload->'style'->>'hairstyle',j.payload->'style'->>'expression',j.payload->'style'->>'clothing_category',j.payload->'style'->>'setting',j.payload->'style'->>'selfie_type') ON CONFLICT(id) DO NOTHING;
  UPDATE messages SET metadata=(metadata-'photo_pending')||p_metadata WHERE id=msg.id;
 ELSE
  UPDATE messages SET metadata=(metadata-'photo_pending'-'generated_path')||jsonb_build_object('photo_failure','Photo could not be delivered. No automatic retry was made.') WHERE id=msg.id;
 END IF;
 UPDATE spicy_photo_jobs SET status=CASE WHEN p_failure IS NULL THEN 'completed' ELSE 'failed' END,failure_code=p_failure,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE action_id=p_action;
 UPDATE media_attempts SET status=CASE WHEN p_failure IS NULL THEN 'generated' ELSE 'failed' END,storage_path=path WHERE action_id=p_action AND user_id=j.user_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.spicy_photo_finish(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spicy_photo_finish(uuid,uuid,jsonb,text) TO service_role;