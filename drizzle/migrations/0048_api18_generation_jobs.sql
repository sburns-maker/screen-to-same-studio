-- Durable, service-only provider jobs. No generation or historical backfill at installation.
CREATE TABLE public.api18_jobs(
 user_id uuid NOT NULL,action_id uuid NOT NULL,
 conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,character_key text NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),job_id text,
 status text NOT NULL CHECK(status IN('reserved','processing','completed','failed','unknown')),
 reserved_cents integer NOT NULL CHECK(reserved_cents>0),cost_usd numeric CHECK(cost_usd>=0 AND cost_usd<1000000),
 refund_expected boolean NOT NULL DEFAULT false,failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,action_id),UNIQUE(user_id,job_id)
);
CREATE UNIQUE INDEX api18_one_active_per_conversation ON public.api18_jobs(user_id,character_key) WHERE status IN('reserved','processing','unknown');
CREATE INDEX api18_jobs_budget ON public.api18_jobs(user_id,created_at DESC);
ALTER TABLE public.api18_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api18_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.api18_jobs TO authenticated;
GRANT ALL ON public.api18_jobs TO service_role;
CREATE POLICY api18_jobs_owner_read ON public.api18_jobs FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE FUNCTION public.api18_job_reserve(p_user uuid,p_action uuid,p_conversation uuid,p_character text,p_hash text,p_cents integer,p_daily integer,p_monthly integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j api18_jobs;d bigint;m bigint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 IF p_cents IS NULL OR p_daily IS NULL OR p_monthly IS NULL OR p_cents<1 OR p_cents>10000 OR p_daily<p_cents OR p_daily>100000 OR p_monthly<p_daily OR p_monthly>1000000 THEN RAISE EXCEPTION 'Invalid Api18 spending limits';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_user::text),hashtext('api18-budget'));
 SELECT * INTO j FROM api18_jobs WHERE user_id=p_user AND action_id=p_action;
 IF FOUND THEN
  IF j.request_hash<>p_hash OR j.conversation_id<>p_conversation OR j.character_key<>p_character THEN RAISE EXCEPTION 'Api18 action id conflict';END IF;
  RETURN jsonb_build_object('fresh',false,'record',to_jsonb(j));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM job_runs r JOIN conversations c ON c.id=p_conversation JOIN characters ch ON ch.id=c.character_id
  WHERE r.id=p_action AND r.status='running' AND r.detail->>'userId'=p_user::text AND r.detail->>'conversationId'=p_conversation::text AND c.user_id=p_user AND ch.key=p_character)
  OR NOT EXISTS(SELECT 1 FROM media_attempts WHERE action_id=p_action AND user_id=p_user AND conversation_id=p_conversation)
 THEN RAISE EXCEPTION 'Owned reserved image action required';END IF;
 -- Known actual costs reconcile to cents. Unknown/failed/refund-pending requests stay reserved.
 SELECT coalesce(sum(CASE WHEN created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN coalesce(ceil(cost_usd*100)::bigint,reserved_cents) ELSE 0 END),0),
 coalesce(sum(coalesce(ceil(cost_usd*100)::bigint,reserved_cents)),0) INTO d,m FROM api18_jobs WHERE user_id=p_user AND created_at>=now()-interval '30 days';
 IF EXISTS(SELECT 1 FROM api18_jobs WHERE user_id=p_user AND created_at>=now()-interval '30 days' AND cost_usd*100>p_cents) THEN RAISE EXCEPTION 'Api18 reservation estimate must be reviewed';END IF;
 IF d+p_cents>p_daily OR m+p_cents>p_monthly THEN RAISE EXCEPTION 'Api18 spending reservation limit reached';END IF;
 INSERT INTO api18_jobs(user_id,action_id,conversation_id,character_key,request_hash,status,reserved_cents) VALUES(p_user,p_action,p_conversation,p_character,p_hash,'reserved',p_cents) RETURNING * INTO j;
 RETURN jsonb_build_object('fresh',true,'record',to_jsonb(j));
END $$;
CREATE FUNCTION public.api18_job_update(p_user uuid,p_action uuid,p_job text,p_status text,p_cost numeric,p_failure text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j api18_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 SELECT * INTO STRICT j FROM api18_jobs WHERE user_id=p_user AND action_id=p_action FOR UPDATE;
 IF p_status NOT IN('processing','completed','failed','unknown') OR p_status IS NULL OR (p_cost IS NOT NULL AND (p_cost<0 OR p_cost>=1000000 OR p_cost::text IN('NaN','Infinity','-Infinity')))
  OR (p_job IS NOT NULL AND p_job !~ '^[a-zA-Z0-9_-]{1,160}$') OR (p_failure IS NOT NULL AND p_failure !~ '^api18_[a-z0-9_]{1,80}$')
 THEN RAISE EXCEPTION 'Invalid Api18 job update';END IF;
 IF j.job_id IS NOT NULL AND p_job IS DISTINCT FROM j.job_id THEN RAISE EXCEPTION 'Api18 job id changed';END IF;
 IF j.status IN('completed','failed') AND p_status<>j.status THEN RAISE EXCEPTION 'Api18 terminal job cannot change outcome';END IF;
 IF p_status IN('processing','completed') AND p_job IS NULL THEN RAISE EXCEPTION 'Provider job id required';END IF;
 UPDATE api18_jobs SET job_id=coalesce(job_id,p_job),status=p_status,cost_usd=coalesce(p_cost,cost_usd),refund_expected=(p_status='failed' AND p_job IS NOT NULL),failure_code=CASE WHEN coalesce(p_cost,j.cost_usd)*100>j.reserved_cents THEN 'api18_cost_exceeded_reservation' ELSE p_failure END,updated_at=now() WHERE user_id=p_user AND action_id=p_action;
 RETURN true;
END $$;
CREATE FUNCTION public.api18_status() RETURNS integer LANGUAGE sql STABLE SET search_path=public AS $$SELECT 48$$;
REVOKE ALL ON FUNCTION public.api18_status(),public.api18_job_reserve(uuid,uuid,uuid,text,text,integer,integer,integer),public.api18_job_update(uuid,uuid,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.api18_status(),public.api18_job_reserve(uuid,uuid,uuid,text,text,integer,integer,integer),public.api18_job_update(uuid,uuid,text,text,numeric,text) TO service_role;
