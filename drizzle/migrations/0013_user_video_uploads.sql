-- Private user uploads only. No generated-video provider, API key, billing job or image change.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('user-videos','user-videos',false,25000000,ARRAY['video/mp4','video/webm']) ON CONFLICT(id) DO NOTHING;
CREATE TABLE public.user_video_uploads (
 id uuid PRIMARY KEY,user_id uuid NOT NULL,conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 storage_path text NOT NULL UNIQUE,mime text NOT NULL CHECK(mime IN('video/mp4','video/webm')),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 25000000),duration_seconds double precision NOT NULL CHECK(duration_seconds>0 AND duration_seconds<=60),
 caption text NOT NULL CHECK(length(caption)<=4000),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sent')),
 created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz
);
CREATE INDEX user_video_daily ON public.user_video_uploads(user_id,created_at);
ALTER TABLE public.user_video_uploads ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_video_uploads TO authenticated;
GRANT ALL ON public.user_video_uploads TO service_role;
CREATE POLICY video_owner_read ON public.user_video_uploads FOR SELECT TO authenticated USING(user_id=auth.uid());
-- Clients can neither list all users' media nor upload arbitrary objects. Uploads use server-issued, path-scoped tokens.
CREATE POLICY video_object_owner_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='user-videos' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE FUNCTION public.reserve_user_video(p_user uuid,p_id uuid,p_conversation uuid,p_mime text,p_bytes integer,p_duration double precision,p_caption text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.user_video_uploads;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('user-video:'||p_user::text,0));
 IF NOT EXISTS(SELECT 1 FROM conversations WHERE id=p_conversation AND user_id=p_user) THEN RAISE EXCEPTION 'owned conversation required'; END IF;
 SELECT * INTO v FROM user_video_uploads WHERE id=p_id;
 IF FOUND THEN
  IF v.user_id<>p_user OR v.conversation_id<>p_conversation OR v.mime<>p_mime OR v.bytes<>p_bytes OR v.duration_seconds<>p_duration OR v.caption<>p_caption THEN RAISE EXCEPTION 'video action id reused'; END IF;
  RETURN to_jsonb(v);
 END IF;
 IF (SELECT count(*) FROM user_video_uploads WHERE user_id=p_user AND created_at>=date_trunc('day',now()))>=10 THEN RAISE EXCEPTION 'daily video upload limit reached'; END IF;
 INSERT INTO user_video_uploads(id,user_id,conversation_id,storage_path,mime,bytes,duration_seconds,caption)
 VALUES(p_id,p_user,p_conversation,p_user::text||'/'||p_id::text||CASE WHEN p_mime='video/mp4' THEN '.mp4' ELSE '.webm' END,p_mime,p_bytes,p_duration,p_caption) RETURNING * INTO v;
 RETURN to_jsonb(v);
END $$;
CREATE FUNCTION public.deliver_user_video(p_user uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.user_video_uploads;
BEGIN
 SELECT * INTO v FROM user_video_uploads WHERE id=p_id AND user_id=p_user FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM conversations WHERE id=v.conversation_id AND user_id=p_user) THEN RAISE EXCEPTION 'owned video required'; END IF;
 IF v.status='sent' THEN RETURN to_jsonb(v)||jsonb_build_object('newly_sent',false); END IF;
 INSERT INTO messages(id,conversation_id,user_id,sender,body,metadata)
 VALUES(v.id,v.conversation_id,v.user_id,'user',v.caption,jsonb_build_object('user_video',jsonb_build_object('path',v.storage_path,'mime',v.mime,'bytes',v.bytes,'duration_seconds',v.duration_seconds),'video_analysis','not_analyzed'));
 UPDATE user_video_uploads SET status='sent',sent_at=now() WHERE id=v.id RETURNING * INTO v;
 RETURN to_jsonb(v)||jsonb_build_object('newly_sent',true);
END $$;
REVOKE ALL ON FUNCTION public.reserve_user_video(uuid,uuid,uuid,text,integer,double precision,text),public.deliver_user_video(uuid,uuid) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_user_video(uuid,uuid,uuid,text,integer,double precision,text),public.deliver_user_video(uuid,uuid) TO service_role;
