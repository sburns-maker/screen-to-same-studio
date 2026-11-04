CREATE OR REPLACE FUNCTION public.inbox_summary()
RETURNS TABLE(conversation_id uuid, last_id uuid, last_sender text, last_body text, last_created_at timestamptz, last_metadata jsonb, unread bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT c.id,
    l.id, l.sender::text, l.body, l.created_at, l.metadata::jsonb,
    (SELECT count(*) FROM public.messages u WHERE u.conversation_id=c.id AND u.sender='tess' AND u.visible_at<=now() AND u.created_at>coalesce(c.last_read_at,'1970-01-01'::timestamptz))
  FROM public.conversations c
  LEFT JOIN LATERAL (
    SELECT m.id, m.sender, m.body, m.created_at, m.metadata FROM public.messages m
    WHERE m.conversation_id=c.id AND m.visible_at<=now()
    ORDER BY m.created_at DESC LIMIT 1
  ) l ON true
  WHERE c.user_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.inbox_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_summary() TO authenticated, service_role;