-- Reproduce existing social tables when installing a fresh development database.
-- Existing Lovable tables and data are left in place.
CREATE TABLE IF NOT EXISTS public.npcs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, character_key text NOT NULL, name text NOT NULL, relation text NOT NULL, category text NOT NULL DEFAULT 'other', blurb text NOT NULL DEFAULT '', canon boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,character_key,name));
CREATE TABLE IF NOT EXISTS public.social_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, character_key text NOT NULL, other_type text NOT NULL, other_key text NOT NULL, level text NOT NULL DEFAULT 'acquaintance', opinion text NOT NULL DEFAULT 'neutral', reason text NOT NULL DEFAULT '', canon boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,character_key,other_type,other_key));
CREATE TABLE IF NOT EXISTS public.shared_events (id text NOT NULL, user_id uuid NOT NULL, title text NOT NULL, kind text NOT NULL, location text NOT NULL DEFAULT '', occurs_at timestamptz NOT NULL, facts jsonb NOT NULL DEFAULT '{}', source text NOT NULL DEFAULT 'simulated', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS public.event_participants (user_id uuid NOT NULL, event_id text NOT NULL, participant_type text NOT NULL, participant_key text NOT NULL, met jsonb NOT NULL DEFAULT '[]', perspective text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,event_id,participant_type,participant_key));
CREATE TABLE IF NOT EXISTS public.character_knowledge (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, character_key text NOT NULL, subject_type text NOT NULL, subject_id text NOT NULL, knowledge_type text NOT NULL, summary text NOT NULL, source text NOT NULL DEFAULT '', acquired_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,character_key,subject_type,subject_id,knowledge_type));

CREATE TABLE public.character_world_state (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, character_key text NOT NULL, activity text NOT NULL, location text NOT NULL,
  availability text NOT NULL CHECK (availability IN ('free','limited','busy','asleep')),
  current_event jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(),
  next_transition_at timestamptz NOT NULL, next_check_at timestamptz NOT NULL
);
CREATE TABLE public.world_records (
  id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, character_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('photo','check_in','plan','npc','possession','preference','commitment')),
  key text NOT NULL, summary text NOT NULL, status text NOT NULL CHECK (status IN ('pending','fulfilled','expired','cancelled','tentative','confirmed')),
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL, source_quote text NOT NULL,
  due_at timestamptz, expires_at timestamptz, retry_at timestamptz, attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,conversation_id,kind,key)
);
CREATE INDEX world_records_due ON public.world_records(due_at) WHERE status = 'pending';
CREATE TABLE public.media_attempts (
  action_id uuid PRIMARY KEY REFERENCES public.job_runs(id), conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','generated','failed')),
  storage_path text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_attempts_budget ON public.media_attempts(user_id,created_at);

CREATE FUNCTION public.world_owner_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = NEW.conversation_id AND user_id = NEW.user_id) THEN RAISE EXCEPTION 'world record owner mismatch'; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['character_world_state','world_records','media_attempts'] LOOP
    EXECUTE format('CREATE TRIGGER world_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.world_owner_guard()',t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('CREATE POLICY world_owner_read ON public.%I FOR SELECT TO authenticated USING (auth.uid()=user_id)',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['npcs','social_links','shared_events','event_participants','character_knowledge'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='world_owner_read') THEN
      EXECUTE format('CREATE POLICY world_owner_read ON public.%I FOR SELECT TO authenticated USING (auth.uid()=user_id)',t);
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.world_runtime_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public,pg_temp AS $$ SELECT '{"version":1}'::jsonb $$;
REVOKE ALL ON FUNCTION public.world_runtime_status() FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.world_runtime_status() TO service_role;

CREATE FUNCTION public.reserve_image_attempt(p_action_id uuid,p_conversation_id uuid,p_user_id uuid,p_daily integer,p_monthly integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n_day integer; n_month integer; c_day integer; c_month integer;
BEGIN
  IF p_daily IS NULL OR p_monthly IS NULL OR p_daily < 0 OR p_daily > 50 OR p_monthly < 0 OR p_monthly > 1000 THEN RAISE EXCEPTION 'invalid image budget'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,47));
  IF NOT EXISTS (SELECT 1 FROM public.job_runs WHERE id=p_action_id AND status='running' AND detail->>'userId'=p_user_id::text AND detail->>'conversationId'=p_conversation_id::text) THEN RAISE EXCEPTION 'unreserved image action'; END IF;
  IF EXISTS (SELECT 1 FROM public.media_attempts WHERE action_id=p_action_id) THEN RETURN false; END IF;
  SELECT count(*) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), count(*),
    count(*) FILTER (WHERE conversation_id=p_conversation_id AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), count(*) FILTER (WHERE conversation_id=p_conversation_id)
    INTO n_day,n_month,c_day,c_month FROM public.media_attempts WHERE user_id=p_user_id AND created_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF c_day >= p_daily OR c_month >= p_monthly OR n_day >= p_daily*3 OR n_month >= p_monthly*3 THEN RETURN false; END IF;
  INSERT INTO public.media_attempts(action_id,conversation_id,user_id) VALUES(p_action_id,p_conversation_id,p_user_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_image_attempt(uuid,uuid,uuid,integer,integer) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_image_attempt(uuid,uuid,uuid,integer,integer) TO service_role;

-- Extend the existing transaction; no message/state behavior is reimplemented.
ALTER FUNCTION public.deliver_photo_turn(uuid) RENAME TO deliver_photo_turn_base;
REVOKE ALL ON FUNCTION public.deliver_photo_turn_base(uuid) FROM PUBLIC,authenticated,service_role;
CREATE FUNCTION public.deliver_photo_turn(p_job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.job_runs; p jsonb; result jsonb; item jsonb; cid uuid; uid uuid; ck text; own_text text; user_text text; record_status text; source_id uuid;
BEGIN
  IF p_job_id IS NULL THEN RETURN '{"version":2,"worldVersion":1}'::jsonb; END IF;
  SELECT * INTO j FROM public.job_runs WHERE id=p_job_id FOR UPDATE;
  p:=j.detail->'plan'; cid:=(j.detail->>'conversationId')::uuid; uid:=(j.detail->>'userId')::uuid;
  result:=public.deliver_photo_turn_base(p_job_id);
  IF coalesce((result->>'count')::integer,0)=0 OR p IS NULL THEN RETURN result; END IF;
  SELECT ch.key INTO ck FROM public.conversations c JOIN public.characters ch ON ch.id=c.character_id WHERE c.id=cid AND c.user_id=uid;
  SELECT string_agg(x->>'body',E'\n') INTO own_text FROM jsonb_array_elements(p->'rows') x;
  SELECT body INTO user_text FROM public.messages WHERE id=(p->>'lastUserId')::uuid AND user_id=uid AND conversation_id=cid AND sender='user';
  source_id:=(p->'rows'->0->>'id')::uuid;
  FOR item IN SELECT * FROM jsonb_array_elements(coalesce(p->'continuity'->'intentions','[]'::jsonb)) LOOP
    IF length(item->>'source_quote')>=8 AND position(item->>'source_quote' IN own_text)>0
      AND (item->>'due_at')::timestamptz > now() AND (item->>'due_at')::timestamptz <= now()+interval '14 days' THEN
      INSERT INTO public.world_records(id,conversation_id,user_id,character_key,kind,key,summary,status,source_message_id,source_quote,due_at,expires_at)
        VALUES(gen_random_uuid(),cid,uid,ck,item->>'kind',lower(item->>'summary'),left(item->>'summary',400),'pending',source_id,item->>'source_quote',(item->>'due_at')::timestamptz,(item->>'due_at')::timestamptz+interval '48 hours') ON CONFLICT(user_id,conversation_id,kind,key) DO NOTHING;
    END IF;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(coalesce(p->'continuity'->'facts','[]'::jsonb)) LOOP
    IF length(item->>'source_quote')>=8 AND (position(item->>'source_quote' IN own_text)>0 OR position(item->>'source_quote' IN coalesce(user_text,''))>0) THEN
      record_status:=CASE WHEN item->>'status'='confirmed' AND position(item->>'source_quote' IN coalesce(user_text,''))>0 THEN 'confirmed' ELSE 'tentative' END;
      INSERT INTO public.world_records(id,conversation_id,user_id,character_key,kind,key,summary,status,source_message_id,source_quote)
        VALUES(gen_random_uuid(),cid,uid,ck,item->>'kind',item->>'key',left(item->>'value',600),record_status,source_id,item->>'source_quote')
        ON CONFLICT(user_id,conversation_id,kind,key) DO UPDATE SET summary=excluded.summary,status=excluded.status,source_quote=excluded.source_quote,source_message_id=excluded.source_message_id,updated_at=now() WHERE world_records.status<>'confirmed' OR excluded.status='confirmed';
    END IF;
  END LOOP;
  IF p->>'intentionId' IS NOT NULL THEN
    UPDATE public.world_records SET status='fulfilled',updated_at=now() WHERE id=(p->>'intentionId')::uuid AND conversation_id=cid AND user_id=uid AND status='pending'
      AND (kind<>'photo' OR p->'generated'<>'null'::jsonb OR p->'rows'->0->'metadata' ? 'photo');
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.deliver_photo_turn(uuid) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_photo_turn(uuid) TO service_role;

-- Attempts are counted before calling a paid text provider, including failures.
CREATE FUNCTION public.reserve_world_ai(p_user_id uuid,p_limit integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k text; used integer;
BEGIN
  IF p_user_id IS NULL OR p_limit IS NULL OR p_limit<0 OR p_limit>100 THEN RAISE EXCEPTION 'invalid autonomous AI budget'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,48));
  k:='world-ai:'||p_user_id::text;
  SELECT CASE WHEN value->>'day'=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') THEN coalesce((value->>'used')::integer,0) ELSE 0 END INTO used FROM public.world_control WHERE key=k;
  used:=coalesce(used,0);
  IF used>=p_limit THEN RETURN false; END IF;
  INSERT INTO public.world_control(key,value,updated_at) VALUES(k,jsonb_build_object('day',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'),'used',used+1),now())
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_world_ai(uuid,integer) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_world_ai(uuid,integer) TO service_role;
