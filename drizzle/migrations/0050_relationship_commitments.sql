CREATE TABLE relationship_commitment_events (
  user_id uuid NOT NULL,
  id uuid NOT NULL,
  character_key text NOT NULL CHECK(length(character_key) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK(kind IN ('exclusive','partnership','engagement','marriage','separation','divorce')),
  proposed_by text NOT NULL CHECK(proposed_by IN ('user','character')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  user_response text NOT NULL DEFAULT 'pending' CHECK(user_response IN ('pending','accepted','declined')),
  character_response text NOT NULL DEFAULT 'pending' CHECK(character_response IN ('pending','accepted','declined')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL CHECK(source_type IN ('message','call','outing','manual')),
  source_id text NOT NULL CHECK(length(source_id) BETWEEN 1 AND 150),
  note text CHECK(note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, character_key, source_type, source_id, kind),
  CHECK (status <> 'accepted' OR (user_response = 'accepted' AND character_response = 'accepted')),
  CHECK (status <> 'declined' OR (user_response = 'declined' OR character_response = 'declined'))
);
CREATE INDEX relationship_commitment_timeline ON relationship_commitment_events(user_id, character_key, occurred_at DESC);
REVOKE ALL ON relationship_commitment_events FROM PUBLIC;
REVOKE ALL ON relationship_commitment_events FROM anon,authenticated;
GRANT ALL ON relationship_commitment_events TO service_role;
ALTER TABLE relationship_commitment_events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION relationship_player_command(
 p_user uuid,p_request uuid,p_character text,p_kind text,p_action text,p_event uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target relationship_commitment_events; answer uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 IF p_character NOT IN ('tess','maya','claire','jordan','ben','riley')
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
REVOKE ALL ON FUNCTION relationship_player_command(uuid,uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION relationship_player_command(uuid,uuid,text,text,text,uuid) TO service_role;

CREATE FUNCTION relationship_sync_tess(p_user uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m record; a jsonb; target relationship_commitment_events; n integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('relationship:'||p_user::text||':tess',0));
 FOR m IN
 SELECT m.id,m.body,m.metadata,m.visible_at FROM messages m
 JOIN conversations c ON c.user_id=m.user_id AND c.id=m.conversation_id
 JOIN characters ch ON ch.id=c.character_id
 WHERE m.user_id=p_user AND m.sender='tess' AND ch.key='tess'
   AND m.visible_at<=now() AND m.metadata ? 'commitment_action'
 ORDER BY m.visible_at,m.id LIMIT 200
 LOOP
  a:=m.metadata->'commitment_action';
  IF a->>'action' NOT IN ('propose','accept','decline')
     OR a->>'kind' NOT IN ('exclusive','partnership')
     OR length(coalesce(a->>'quote','')) < 12
     OR position(a->>'quote' IN m.body)=0 THEN CONTINUE; END IF;
  IF a->>'action'='propose' THEN
   IF EXISTS(SELECT 1 FROM relationship_commitment_events
     WHERE user_id=p_user AND character_key='tess'
       AND source_type='message' AND source_id=m.id::text) THEN CONTINUE; END IF;
   IF EXISTS(SELECT 1 FROM relationship_commitment_events
     WHERE user_id=p_user AND character_key='tess' AND status='pending') THEN CONTINUE; END IF;
   INSERT INTO relationship_commitment_events(
     user_id,id,character_key,kind,proposed_by,status,user_response,character_response,
     occurred_at,source_type,source_id,note
   ) VALUES(p_user,m.id,'tess',a->>'kind','character','pending','pending','accepted',
     m.visible_at,'message',m.id::text,left(a->>'quote',500))
   ON CONFLICT DO NOTHING;
   n:=n+1;
  ELSE
   IF coalesce(a->>'proposalId','') !~* '^[0-9a-f-]{36}$' THEN CONTINUE; END IF;
   SELECT * INTO target FROM relationship_commitment_events
     WHERE user_id=p_user AND id=(a->>'proposalId')::uuid AND character_key='tess'
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
REVOKE ALL ON FUNCTION relationship_sync_tess(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION relationship_sync_tess(uuid) TO service_role;