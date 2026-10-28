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
