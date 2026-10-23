-- In-app fictional calls only. No telephone carrier, audio storage or production data reset.
CREATE TABLE public.phone_contacts(entity_key text PRIMARY KEY,extension integer UNIQUE NOT NULL CHECK(extension BETWEEN 100 AND 199));
INSERT INTO phone_contacts VALUES('tess',100),('maya',101),('claire',102),('jordan',103),('ben',104),('rowan-ellis',105),('leah-moss',106),('nolan-reed',107),('mira-dalton',108),('theo-finch',109),('inez-carter',110),('orla-june',111),('elliot-reed',112),('robin-hale',113),('dana-soler',114);
REVOKE ALL ON phone_contacts FROM PUBLIC,authenticated;GRANT SELECT ON phone_contacts TO authenticated;GRANT ALL ON phone_contacts TO service_role;
CREATE TABLE public.call_preferences(user_id uuid PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,incoming boolean NOT NULL DEFAULT false,save_transcripts boolean NOT NULL DEFAULT false);
CREATE TABLE public.phone_calls(user_id uuid NOT NULL,id uuid NOT NULL,conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,character_key text NOT NULL REFERENCES phone_contacts(entity_key),direction text NOT NULL CHECK(direction IN('incoming','outgoing')),state text NOT NULL CHECK(state IN('calling','ringing','connecting','connected','ended','busy','unavailable','declined','missed','failed')),outcome text NOT NULL,reason text NOT NULL,offered_at timestamptz NOT NULL,ring_until timestamptz NOT NULL,answered_at timestamptz,ended_at timestamptz,expires_at timestamptz NOT NULL,duration_seconds integer NOT NULL DEFAULT 0,turns integer NOT NULL DEFAULT 0,summary text NOT NULL DEFAULT '',last_failure text,last_latency_ms integer,reserved_cents integer NOT NULL DEFAULT 0,source_record_id uuid,PRIMARY KEY(user_id,id));
CREATE UNIQUE INDEX one_live_call_per_user ON phone_calls(user_id) WHERE state IN('calling','ringing','connecting','connected');
CREATE UNIQUE INDEX one_callback_offer ON phone_calls(user_id,source_record_id) WHERE source_record_id IS NOT NULL;
CREATE TABLE public.call_turns(user_id uuid NOT NULL,id uuid NOT NULL,call_id uuid NOT NULL,status text NOT NULL CHECK(status IN('reserved','audio_ready','played','interrupted','failed')),reserved_at timestamptz NOT NULL,finished_at timestamptz,audio_seconds integer NOT NULL,reserved_cents integer NOT NULL,action_id uuid,user_message_id uuid,latency_ms integer,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id,call_id) REFERENCES phone_calls(user_id,id) ON DELETE CASCADE);
CREATE UNIQUE INDEX one_live_call_turn ON call_turns(user_id,call_id) WHERE status IN('reserved','audio_ready');
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['call_preferences','phone_calls','call_turns'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('CREATE POLICY own_call_read ON %I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);EXECUTE format('GRANT SELECT ON %I TO authenticated',t);EXECUTE format('GRANT ALL ON %I TO service_role',t);END LOOP;END $$;
CREATE FUNCTION public.phone_status() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT 23 $$;
CREATE FUNCTION public.phone_command(p_user uuid,p_id uuid,p_command text,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.phone_calls; pref public.call_preferences; cid uuid; ck text; t public.call_turns; j public.job_runs; result jsonb; n integer; seconds integer; cents integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('phone:'||p_user::text,0));
 IF p_command='preferences' THEN
  INSERT INTO call_preferences VALUES(p_user,coalesce((p_payload->>'enabled')::boolean,false),coalesce((p_payload->>'incoming')::boolean,false),coalesce((p_payload->>'save_transcripts')::boolean,false)) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,incoming=excluded.incoming,save_transcripts=excluded.save_transcripts;
  IF NOT coalesce((p_payload->>'enabled')::boolean,false) OR NOT coalesce((p_payload->>'save_transcripts')::boolean,false) THEN
   FOR c IN SELECT * FROM phone_calls WHERE user_id=p_user AND state IN('calling','ringing','connecting','connected') LOOP
    PERFORM public.phone_command(p_user,c.id,'end','{}',p_now);
   END LOOP;
  END IF;
  RETURN '{}';
 END IF;
 IF p_command='sweep'  THEN
  FOR c IN SELECT * FROM phone_calls WHERE user_id=p_user AND state IN('calling','ringing','connecting','connected') AND (expires_at<=p_now OR direction='incoming' AND state='ringing' AND ring_until<=p_now) FOR UPDATE LOOP
   UPDATE phone_calls SET state=CASE WHEN answered_at IS NULL THEN 'missed' ELSE 'ended' END,ended_at=least(p_now,expires_at),duration_seconds=CASE WHEN answered_at IS NULL THEN 0 ELSE greatest(0,extract(epoch FROM least(p_now,expires_at)-answered_at)::int) END,last_failure=CASE WHEN answered_at IS NOT NULL THEN 'session_limit' ELSE NULL END WHERE user_id=p_user AND id=c.id;
   UPDATE job_runs SET status='failed',finished_at=p_now WHERE id IN(SELECT action_id FROM call_turns WHERE user_id=p_user AND call_id=c.id AND status IN('reserved','audio_ready')) AND status='running';
   UPDATE call_turns SET status='failed',finished_at=p_now WHERE user_id=p_user AND call_id=c.id AND status IN('reserved','audio_ready');
  END LOOP;
  UPDATE job_runs SET status='failed',finished_at=p_now WHERE status='running' AND detail->>'userId'=p_user::text AND detail->>'phase'='voice_prepared' AND EXISTS(SELECT 1 FROM phone_calls pc WHERE pc.user_id=p_user AND pc.id::text=job_runs.detail->>'callId' AND pc.state NOT IN('calling','ringing','connecting','connected'));
  RETURN '{}';
 END IF;
 SELECT * INTO pref FROM call_preferences WHERE user_id=p_user;
 IF p_command='start' THEN
  SELECT * INTO c FROM phone_calls WHERE user_id=p_user AND id=p_id;IF FOUND THEN RETURN to_jsonb(c);END IF;
  IF NOT coalesce(pref.enabled AND pref.save_transcripts,false) THEN RAISE EXCEPTION 'Enable calls and transcript consent in Calls settings';END IF;
  cid:=(p_payload->>'conversation')::uuid;
  SELECT ch.key INTO ck FROM conversations co JOIN characters ch ON ch.id=co.character_id WHERE co.user_id=p_user AND co.id=cid AND ch.key IN('tess','maya','claire','jordan','ben');
  IF ck IS NULL THEN RAISE EXCEPTION 'Owned eligible contact required';END IF;
  IF EXISTS(SELECT 1 FROM job_runs WHERE job='photo-turn:'||cid::text AND status='running') OR EXISTS(SELECT 1 FROM messages WHERE conversation_id=cid AND visible_at>p_now) THEN RAISE EXCEPTION 'Wait for the pending conversation reply';END IF;
  IF (SELECT count(*) FROM phone_calls WHERE user_id=p_user AND offered_at>=date_trunc('day',p_now))>=10 THEN RAISE EXCEPTION 'Daily call limit reached';END IF;
  IF p_payload->>'direction'='incoming' AND NOT pref.incoming THEN RAISE EXCEPTION 'Incoming calls disabled';END IF;
  INSERT INTO phone_calls(user_id,id,conversation_id,character_key,direction,state,outcome,reason,offered_at,ring_until,expires_at,source_record_id) VALUES(p_user,p_id,cid,ck,p_payload->>'direction',CASE WHEN p_payload->>'direction'='incoming' THEN 'ringing' ELSE 'calling' END,p_payload->>'outcome',p_payload->>'reason',p_now,p_now+make_interval(secs=>least(30,greatest(5,(p_payload->>'ring')::int))),p_now+interval '90 seconds',(p_payload->>'source')::uuid) RETURNING * INTO c;
  RETURN to_jsonb(c);
 END IF;
 SELECT * INTO c FROM phone_calls WHERE user_id=p_user AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owned call required';END IF;
 IF p_command='resolve' AND c.state='calling' AND p_now>=c.ring_until THEN
  UPDATE phone_calls SET state=CASE WHEN c.outcome='answer' THEN 'connecting' ELSE c.outcome END,ended_at=CASE WHEN c.outcome='answer' THEN NULL ELSE p_now END WHERE user_id=p_user AND id=p_id;
 ELSIF p_command='answer' AND c.state='ringing' AND c.ring_until>p_now THEN UPDATE phone_calls SET state='connecting' WHERE user_id=p_user AND id=p_id;
 ELSIF p_command='connect' AND c.state='connecting' AND c.expires_at>p_now AND pref.enabled AND pref.save_transcripts THEN
  UPDATE phone_calls SET state='connected',answered_at=p_now,expires_at=p_now+make_interval(secs=>least(600,greatest(30,(p_payload->>'max_seconds')::int))) WHERE user_id=p_user AND id=p_id;
 ELSIF p_command IN('end','decline','fail') AND c.state IN('calling','ringing','connecting','connected') THEN
  UPDATE phone_calls SET state=CASE WHEN p_command='fail' THEN 'failed' WHEN p_command='decline' THEN 'declined' ELSE 'ended' END,ended_at=p_now,duration_seconds=CASE WHEN c.answered_at IS NULL THEN 0 ELSE greatest(0,extract(epoch FROM least(p_now,c.expires_at)-c.answered_at)::int) END,last_failure=CASE WHEN p_command='fail' THEN 'connection_failed' ELSE NULL END WHERE user_id=p_user AND id=p_id;
  UPDATE job_runs SET status='failed',finished_at=p_now WHERE status='running' AND (id IN(SELECT action_id FROM call_turns WHERE user_id=p_user AND call_id=p_id AND status IN('reserved','audio_ready')) OR detail->>'callId'=p_id::text AND detail->>'userId'=p_user::text);
  UPDATE call_turns SET status='failed',finished_at=p_now WHERE user_id=p_user AND call_id=p_id AND status IN('reserved','audio_ready');
 ELSIF p_command='claim' THEN
  IF EXISTS(SELECT 1 FROM call_turns WHERE user_id=p_user AND id=(p_payload->>'turn')::uuid) THEN RETURN '{"claimed":false}';END IF;
  IF c.state<>'connected' OR c.expires_at<=p_now OR NOT pref.enabled OR NOT pref.save_transcripts OR c.turns>=20 THEN RAISE EXCEPTION 'Call is closed or its turn limit was reached';END IF;
  seconds:=(p_payload->>'seconds')::int;cents:=(p_payload->>'cents')::int;
  IF seconds NOT BETWEEN 0 AND 10 OR cents NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid voice reservation';END IF;
  IF (SELECT coalesce(sum(reserved_cents),0) FROM call_turns WHERE user_id=p_user AND reserved_at>=date_trunc('day',p_now))+cents>(p_payload->>'daily_cents')::int OR (SELECT coalesce(sum(reserved_cents),0) FROM call_turns WHERE user_id=p_user AND reserved_at>=date_trunc('month',p_now))+cents>(p_payload->>'monthly_cents')::int THEN RAISE EXCEPTION 'Call spending reservation limit reached';END IF;
  INSERT INTO call_turns(user_id,id,call_id,status,reserved_at,audio_seconds,reserved_cents) VALUES(p_user,(p_payload->>'turn')::uuid,p_id,'reserved',p_now,seconds,cents);
  UPDATE phone_calls SET turns=turns+1,reserved_cents=reserved_cents+cents WHERE user_id=p_user AND id=p_id;
  RETURN '{"claimed":true}';
 ELSIF p_command='input' THEN
  SELECT * INTO t FROM call_turns WHERE user_id=p_user AND id=(p_payload->>'turn')::uuid AND call_id=p_id AND status='reserved' FOR UPDATE;
  IF NOT FOUND OR c.state<>'connected' OR c.expires_at<=p_now THEN RAISE EXCEPTION 'Active reserved call turn required';END IF;
  IF t.user_message_id IS NULL AND length(trim(p_payload->>'text')) BETWEEN 1 AND 1000 THEN
   INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at,metadata) VALUES(t.id,p_user,c.conversation_id,'user',p_payload->>'text',p_now,p_now,jsonb_build_object('call_id',p_id,'call_turn',t.id,'channel','voice'));
   UPDATE call_turns SET user_message_id=t.id WHERE user_id=p_user AND id=t.id;
  END IF;
 ELSIF p_command='ready' THEN
  UPDATE call_turns SET action_id=(p_payload->>'action')::uuid,status='audio_ready',latency_ms=(p_payload->>'latency_ms')::int WHERE user_id=p_user AND call_id=p_id AND id=(p_payload->>'turn')::uuid AND status='reserved' AND c.state='connected' AND c.expires_at>p_now;
  IF NOT FOUND THEN RAISE EXCEPTION 'Call ended before audio was ready';END IF;
  UPDATE phone_calls SET last_latency_ms=(p_payload->>'latency_ms')::int WHERE user_id=p_user AND id=p_id;
 ELSIF p_command IN('played','interrupt','turn_failed') THEN
  SELECT * INTO t FROM call_turns WHERE user_id=p_user AND call_id=p_id AND id=(p_payload->>'turn')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owned call turn required';END IF;
  IF t.status IN('played','interrupted','failed') THEN RETURN '{"replayed":true}';END IF;
  IF p_command='played' AND (c.state<>'connected' OR c.expires_at<=p_now OR t.status<>'audio_ready') THEN RAISE EXCEPTION 'Call ended before playback';END IF;
  SELECT * INTO j FROM job_runs WHERE id=t.action_id FOR UPDATE;
  IF p_command='played' THEN
   IF j.status<>'running' OR j.detail->>'phase'<>'voice_prepared' OR j.detail->'plan'->'rows'->0->'metadata'->>'call_id'<>p_id::text THEN RAISE EXCEPTION 'Owned prepared speech required';END IF;
   UPDATE job_runs SET detail=jsonb_set(detail,'{phase}','"prepared"') WHERE id=j.id;
   result:=public.deliver_photo_turn(j.id);
   IF coalesce((result->>'count')::int,0)=0 THEN RAISE EXCEPTION 'Speech continuity could not be committed';END IF;
   UPDATE call_turns SET status='played',finished_at=p_now WHERE user_id=p_user AND id=t.id;
   IF c.direction='incoming' AND c.source_record_id IS NOT NULL THEN UPDATE world_records SET status='fulfilled',updated_at=p_now WHERE user_id=p_user AND id=c.source_record_id AND conversation_id=c.conversation_id AND status='pending';END IF;
   UPDATE phone_calls SET summary=left(concat_ws(' ',nullif(summary,''),(SELECT string_agg(x->>'summary',' ') FROM jsonb_array_elements(coalesce(j.detail->'plan'->'memories','[]')) x)),1200) WHERE user_id=p_user AND id=p_id;
  ELSE
   UPDATE job_runs SET status='failed',finished_at=p_now WHERE id=t.action_id AND status='running';
   UPDATE call_turns SET status=CASE WHEN p_command='interrupt' THEN 'interrupted' ELSE 'failed' END,finished_at=p_now WHERE user_id=p_user AND id=t.id;
   IF p_command='turn_failed' THEN UPDATE phone_calls SET last_failure='voice_turn_failed' WHERE user_id=p_user AND id=p_id;END IF;
  END IF;
 ELSIF p_command='callback' THEN
  IF c.state IN('calling','ringing','connecting','connected') THEN RAISE EXCEPTION 'End the call first';END IF;
  INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at,metadata) VALUES(md5(p_id::text||':callback-request')::uuid,p_user,c.conversation_id,'user','Could you call me when you have a quiet moment? No rush.',p_now,p_now,jsonb_build_object('phone_callback_request',p_id)) ON CONFLICT DO NOTHING;
 ELSIF p_command='delete_transcript' THEN
  IF c.state IN('calling','ringing','connecting','connected') THEN RAISE EXCEPTION 'End the call first';END IF;
  DELETE FROM messages WHERE user_id=p_user AND conversation_id=c.conversation_id AND metadata->>'call_id'=p_id::text;
  UPDATE job_runs SET detail=jsonb_build_object('phase','voice_transcript_deleted','userId',p_user,'conversationId',c.conversation_id) WHERE id IN(SELECT action_id FROM call_turns WHERE user_id=p_user AND call_id=p_id) OR detail->>'callId'=p_id::text AND detail->>'userId'=p_user::text;
 END IF;
 SELECT * INTO c FROM phone_calls WHERE user_id=p_user AND id=p_id;RETURN to_jsonb(c);
END $$;
REVOKE ALL ON FUNCTION public.phone_status(),public.phone_command(uuid,uuid,text,jsonb,timestamptz) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.phone_status(),public.phone_command(uuid,uuid,text,jsonb,timestamptz) TO service_role;

CREATE POLICY call_text_interlock ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT EXISTS(SELECT 1 FROM public.phone_calls c WHERE c.user_id=auth.uid() AND c.conversation_id=messages.conversation_id AND c.state IN('calling','ringing','connecting','connected') AND c.expires_at>now()));
