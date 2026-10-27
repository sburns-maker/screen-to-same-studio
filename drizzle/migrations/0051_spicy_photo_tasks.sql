-- Replacement provider: preserve API18 history/approvals, require fresh provider opt-in.
ALTER TABLE public.photo_reference_state ADD COLUMN spicy_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public.spicy_photo_jobs(
 action_id uuid PRIMARY KEY,user_id uuid NOT NULL,conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
 character_key text NOT NULL CHECK(character_key IN('tess','maya','riley','claire','jordan')),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),idempotency_key text NOT NULL UNIQUE,
 stored_sha256 text CHECK(stored_sha256 ~ '^[a-f0-9]{64}$'),
 task_id text UNIQUE,model text NOT NULL CHECK(model IN('bytedance/seedream-5.0-flash/edit','bytedance/seedream-5.0-pro/edit')),
 status text NOT NULL CHECK(status IN('submitting','processing','completed','failed','unknown')),
 payload jsonb NOT NULL,reserved_cents integer NOT NULL CHECK(reserved_cents>0),cost_usd numeric CHECK(cost_usd>=0 AND cost_usd<1000000),
 failure_code text,lease_token uuid,lease_until timestamptz,next_poll_at timestamptz NOT NULL DEFAULT now()+interval '3 seconds',poll_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX spicy_jobs_due ON spicy_photo_jobs(next_poll_at) WHERE status IN('submitting','processing');
CREATE INDEX spicy_jobs_budget ON spicy_photo_jobs(user_id,created_at);
CREATE UNIQUE INDEX spicy_one_pending_per_character ON spicy_photo_jobs(user_id,character_key) WHERE status IN('submitting','processing','unknown');
ALTER TABLE spicy_photo_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON spicy_photo_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON spicy_photo_jobs TO service_role;
CREATE FUNCTION spicy_photo_preferences(p_user uuid,p_character text,p_enabled boolean,p_adult boolean,p_version integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 IF p_enabled IS NULL OR p_adult IS NULL OR p_character NOT IN('tess','maya','riley','claire','jordan') OR (p_enabled AND NOT p_adult) THEN RAISE EXCEPTION 'adult provider eligibility required';END IF;
 IF NOT EXISTS(SELECT 1 FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=p_character) THEN RAISE EXCEPTION 'owned character required';END IF;
 INSERT INTO photo_reference_state(user_id,character_key) VALUES(p_user,p_character) ON CONFLICT DO NOTHING;
 UPDATE photo_reference_state SET spicy_enabled=p_enabled,adult_confirmed=p_adult,version=version+1,last_action=NULL WHERE user_id=p_user AND character_key=p_character AND version=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'reference preference version conflict';END IF;RETURN true;
END $$;
CREATE FUNCTION spicy_photo_reserve(p_user uuid,p_action uuid,p_conversation uuid,p_character text,p_hash text,p_model text,p_payload jsonb,p_cents integer,p_daily integer,p_monthly integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j spicy_photo_jobs;d bigint;m bigint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_user::text),hashtext('spicy-budget'));
 SELECT * INTO j FROM spicy_photo_jobs WHERE action_id=p_action;
 IF FOUND THEN
  IF j.user_id<>p_user OR j.request_hash<>p_hash OR j.model<>p_model OR j.conversation_id IS DISTINCT FROM p_conversation OR j.character_key<>p_character THEN RAISE EXCEPTION 'provider action conflict';END IF;
  RETURN jsonb_build_object('fresh',false,'record',to_jsonb(j));
 END IF;
 IF p_cents IS NULL OR p_daily IS NULL OR p_monthly IS NULL OR p_cents<1 OR p_cents>10000 OR p_daily<p_cents OR p_daily>100000 OR p_monthly<p_daily OR p_monthly>1000000 THEN RAISE EXCEPTION 'invalid spending reservation';END IF;
 IF NOT EXISTS(SELECT 1 FROM conversations c JOIN characters ch ON ch.id=c.character_id JOIN photo_reference_state s ON s.user_id=c.user_id AND s.character_key=ch.key
  JOIN job_runs r ON r.id=p_action JOIN media_attempts a ON a.action_id=p_action
  WHERE c.id=p_conversation AND c.user_id=p_user AND ch.key=p_character AND s.spicy_enabled AND s.adult_confirmed
  AND ((r.job LIKE 'developer-photo-lab:%') OR (c.mature_photography AND c.photo_boundary='none'))
  AND r.status='running' AND r.detail->>'userId'=p_user::text AND a.user_id=p_user AND a.conversation_id=p_conversation)
 THEN RAISE EXCEPTION 'owned eligible reserved image action required';END IF;
 SELECT coalesce(sum(coalesce(ceil(cost_usd*100),reserved_cents)) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0),
 coalesce(sum(coalesce(ceil(cost_usd*100),reserved_cents)),0) INTO d,m FROM spicy_photo_jobs WHERE user_id=p_user AND created_at>=now()-interval '30 days';
 IF d+p_cents>p_daily OR m+p_cents>p_monthly OR EXISTS(SELECT 1 FROM spicy_photo_jobs WHERE user_id=p_user AND cost_usd*100>reserved_cents AND created_at>=now()-interval '30 days') THEN RAISE EXCEPTION 'provider spending limit reached';END IF;
 INSERT INTO spicy_photo_jobs(action_id,user_id,conversation_id,character_key,request_hash,idempotency_key,model,status,payload,reserved_cents)
 VALUES(p_action,p_user,p_conversation,p_character,p_hash,'photo-msg-'||p_action::text||'-render-1',p_model,'submitting',p_payload,p_cents) RETURNING * INTO j;
 RETURN jsonb_build_object('fresh',true,'record',to_jsonb(j));
END $$;
CREATE FUNCTION spicy_photo_claim(p_action uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j spicy_photo_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 UPDATE spicy_photo_jobs SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',poll_count=poll_count+1
 WHERE action_id=p_action AND status='processing' AND next_poll_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING * INTO j;
 RETURN CASE WHEN FOUND THEN to_jsonb(j) ELSE NULL END;
END $$;
CREATE FUNCTION spicy_photo_finish(p_action uuid,p_token uuid,p_metadata jsonb,p_failure text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j spicy_photo_jobs;msg messages;path text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 SELECT * INTO j FROM spicy_photo_jobs WHERE action_id=p_action FOR UPDATE;
 IF j.status IN('completed','failed') THEN RETURN true;END IF;
 IF p_token IS NULL OR j.lease_until IS NULL OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<now() THEN RETURN false;END IF;
 IF p_failure IS NULL AND NOT EXISTS(SELECT 1 FROM photo_reference_state WHERE user_id=j.user_id AND character_key=j.character_key AND spicy_enabled AND adult_confirmed) THEN p_failure:='spicy_permission_changed';END IF;
 IF p_failure IS NULL AND coalesce(j.payload->>'delivery','chat')<>'lab' AND NOT EXISTS(SELECT 1 FROM conversations c JOIN tess_state s ON s.conversation_id=c.id AND s.user_id=c.user_id
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
  VALUES(j.action_id,j.user_id,j.conversation_id,msg.id,'mature_romantic',j.payload->>'scene',true,true,'spicyapi',j.model,path,j.character_key,
   j.payload->'style'->>'pose_type',j.payload->'style'->>'camera_angle',j.payload->'style'->>'crop_type',j.payload->'style'->>'hairstyle',j.payload->'style'->>'expression',j.payload->'style'->>'clothing_category',j.payload->'style'->>'setting',j.payload->'style'->>'selfie_type') ON CONFLICT(id) DO NOTHING;
  UPDATE messages SET metadata=(metadata-'photo_pending')||p_metadata WHERE id=msg.id;
 ELSE
  UPDATE messages SET metadata=(metadata-'photo_pending'-'generated_path')||jsonb_build_object('photo_failure','Photo could not be delivered. No automatic retry was made.') WHERE id=msg.id;
 END IF;
 UPDATE spicy_photo_jobs SET status=CASE WHEN p_failure IS NULL THEN 'completed' ELSE 'failed' END,failure_code=p_failure,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE action_id=p_action;
 UPDATE media_attempts SET status=CASE WHEN p_failure IS NULL THEN 'generated' ELSE 'failed' END,storage_path=path WHERE action_id=p_action AND user_id=j.user_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION spicy_photo_preferences(uuid,text,boolean,boolean,integer),spicy_photo_reserve(uuid,uuid,uuid,text,text,text,jsonb,integer,integer,integer),spicy_photo_claim(uuid),spicy_photo_finish(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION spicy_photo_preferences(uuid,text,boolean,boolean,integer),spicy_photo_reserve(uuid,uuid,uuid,text,text,text,jsonb,integer,integer,integer),spicy_photo_claim(uuid),spicy_photo_finish(uuid,uuid,jsonb,text) TO service_role;
