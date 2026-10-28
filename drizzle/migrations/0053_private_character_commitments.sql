-- Additive per-character ingestion. Existing Tess records and legacy RPC remain unchanged.
CREATE FUNCTION relationship_sync_character(p_user uuid,p_character text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m record; a jsonb; target relationship_commitment_events; n integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 IF p_character IS NULL OR p_character NOT IN ('tess','maya','riley','claire','jordan') THEN RAISE EXCEPTION 'Unsupported relationship character';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('relationship:'||p_user::text||':'||p_character,0));
 FOR m IN
 SELECT msg.id,msg.body,msg.metadata,msg.visible_at FROM messages msg
 JOIN conversations c ON c.user_id=msg.user_id AND c.id=msg.conversation_id
 JOIN characters ch ON ch.id=c.character_id
 WHERE msg.user_id=p_user AND msg.sender='tess' AND ch.key=p_character
   AND msg.visible_at<=now() AND msg.metadata ? 'commitment_action'
 ORDER BY msg.visible_at,msg.id LIMIT 200
 LOOP
  a:=m.metadata->'commitment_action';
  IF coalesce(a->>'action','') NOT IN ('propose','accept','decline')
     OR coalesce(a->>'kind','') NOT IN ('exclusive','partnership')
     OR length(coalesce(a->>'quote','')) < 12
     OR position(a->>'quote' IN m.body)=0 THEN CONTINUE; END IF;
  IF a->>'action'='propose' THEN
   IF EXISTS(SELECT 1 FROM relationship_commitment_events
     WHERE user_id=p_user AND character_key=p_character
       AND source_type='message' AND source_id=m.id::text) THEN CONTINUE; END IF;
   IF EXISTS(SELECT 1 FROM relationship_commitment_events
     WHERE user_id=p_user AND character_key=p_character AND status='pending') THEN CONTINUE; END IF;
   INSERT INTO relationship_commitment_events(
     user_id,id,character_key,kind,proposed_by,status,user_response,character_response,
     occurred_at,source_type,source_id,note
   ) VALUES(p_user,m.id,p_character,a->>'kind','character','pending','pending','accepted',
     m.visible_at,'message',m.id::text,left(a->>'quote',500))
   ON CONFLICT DO NOTHING;
   n:=n+1;
  ELSE
   IF coalesce(a->>'proposalId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN CONTINUE; END IF;
   SELECT * INTO target FROM relationship_commitment_events
     WHERE user_id=p_user AND id=(a->>'proposalId')::uuid AND character_key=p_character
       AND kind=a->>'kind' FOR UPDATE;
   IF NOT FOUND OR target.status<>'pending' OR target.proposed_by<>'user'
      OR target.character_response<>'pending' OR target.occurred_at>m.visible_at
      THEN CONTINUE; END IF;
   IF a->>'action'='accept' AND a->>'quote' ~* '(yes|i agree|i accept|i want (that|us)|let.s be|i.d like to)'
       AND a->>'quote' !~* '(not ready|don.t want|do not want|maybe|might|not sure)' THEN
     UPDATE relationship_commitment_events SET character_response='accepted',
       status=CASE WHEN user_response='accepted' THEN 'accepted' ELSE 'pending' END
       WHERE user_id=p_user AND id=target.id;
     n:=n+1;
   ELSIF a->>'action'='decline' AND a->>'quote' ~* '(no|not ready|don.t want|do not want|rather not)' THEN
     UPDATE relationship_commitment_events SET character_response='declined',status='declined'
       WHERE user_id=p_user AND id=target.id;
     n:=n+1;
   END IF;
  END IF;
 END LOOP;
 RETURN n;
END$$;
REVOKE ALL ON FUNCTION relationship_sync_character(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION relationship_sync_character(uuid,text) TO service_role;

-- Keep older app deployments on the same corrected, scoped implementation.
CREATE OR REPLACE FUNCTION relationship_sync_tess(p_user uuid) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT relationship_sync_character(p_user,'tess');
$$;
REVOKE ALL ON FUNCTION relationship_sync_tess(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION relationship_sync_tess(uuid) TO service_role;
