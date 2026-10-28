-- Extend relationship commands to the two newly added adult characters.
-- Preserve the original explicit mutually-decided commitment safeguards.
CREATE OR REPLACE FUNCTION relationship_player_command(
 p_user uuid,p_request uuid,p_character text,p_kind text,p_action text,p_event uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target relationship_commitment_events; answer uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 IF p_character NOT IN ('tess','maya','claire','jordan','ben','riley','sienna','kendra')
    OR p_kind NOT IN ('exclusive','partnership','engagement','marriage','separation','divorce')
    OR p_action NOT IN ('propose','accept','decline','cancel') THEN RAISE EXCEPTION 'Invalid relationship request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('relationship:'||p_user::text||':'||p_character,0));
 IF p_action='propose' THEN
  SELECT * INTO target FROM relationship_commitment_events WHERE user_id=p_user AND id=p_request;
  IF FOUND THEN
   IF target.character_key <> p_character OR target.kind <> p_kind OR target.proposed_by <> 'user'
     THEN RAISE EXCEPTION 'Conflicting request identifier';END IF;
   RETURN target.id;
  END IF;
  IF EXISTS (SELECT 1 FROM relationship_commitment_events WHERE user_id=p_user AND character_key=p_character AND status='pending') THEN RAISE EXCEPTION 'A relationship decision is already pending';END IF;
  INSERT INTO relationship_commitment_events(user_id,id,character_key,kind,proposed_by,status,user_response,character_response,source_type,source_id)
  VALUES(p_user,p_request,p_character,p_kind,'user','pending','accepted','pending','manual','player:'||p_request::text);
  RETURN p_request;
 END IF;
 IF p_event IS NULL THEN RAISE EXCEPTION 'Missing proposal';END IF;
 SELECT * INTO target FROM relationship_commitment_events WHERE user_id=p_user AND id=p_event AND character_key=p_character AND kind=p_kind FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Relationship proposal unavailable';END IF;
 IF target.status <> 'pending' THEN
  IF (p_action='accept' AND target.user_response='accepted') OR
     (p_action='decline' AND target.user_response='declined') OR
     (p_action='cancel' AND target.status='cancelled' AND target.proposed_by='user') THEN RETURN target.id;END IF;
  RAISE EXCEPTION 'This decision is already closed';
 END IF;
 IF p_action='cancel' THEN
  IF target.proposed_by <> 'user' THEN RAISE EXCEPTION 'Only your proposals can be cancelled';END IF;
  UPDATE relationship_commitment_events SET status='cancelled' WHERE user_id=p_user AND id=p_event;
 ELSIF p_action='accept' THEN
  UPDATE relationship_commitment_events SET user_response='accepted',
    status=CASE WHEN character_response='accepted' THEN 'accepted' ELSE 'pending' END
    WHERE user_id=p_user AND id=p_event;
 ELSIF p_action='decline' THEN
  UPDATE relationship_commitment_events SET user_response='declined',status='declined' WHERE user_id=p_user AND id=p_event;
 END IF;
 RETURN p_event;
END$$;

-- Mirror the expanded cast in the visible-message relationship sync path.
CREATE OR REPLACE FUNCTION relationship_sync_character(p_user uuid,p_character text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m record; a jsonb; target relationship_commitment_events; n integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 IF p_character IS NULL OR p_character NOT IN ('tess','maya','riley','claire','jordan','ben','sienna','kendra') THEN RAISE EXCEPTION 'Unsupported relationship character';END IF;
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
