CREATE INDEX IF NOT EXISTS messages_user_conv_sender_created ON public.messages (user_id, conversation_id, sender, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_conv_created_desc ON public.messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS world_events_user_char_kind_created ON public.world_events (user_id, character_key, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS relationship_evaluations_user_conv_eval ON public.relationship_evaluations (user_id, conversation_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS job_runs_job_started ON public.job_runs (job, started_at DESC);
CREATE INDEX IF NOT EXISTS social_plans_user_created ON public.social_plans (user_id, created_at DESC, id DESC);