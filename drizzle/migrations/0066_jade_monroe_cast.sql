-- New independent adult cast member. Does not alter prior users or existing profile photos.
INSERT INTO public.characters (key,preferred_name,full_name,age,pronouns,avatar_key,zip,sort_order)
VALUES ('jade','Jade','Jade Monroe',25,'she/her','jade','16602',8)
ON CONFLICT (key) DO UPDATE SET preferred_name=EXCLUDED.preferred_name,
  full_name=EXCLUDED.full_name,age=EXCLUDED.age,pronouns=EXCLUDED.pronouns,
  avatar_key=EXCLUDED.avatar_key;

ALTER TABLE public.character_voices DROP CONSTRAINT IF EXISTS character_voices_character_key_check;
ALTER TABLE public.character_voices ADD CONSTRAINT character_voices_character_key_check
 CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna','kendra','jade'));
ALTER TABLE public.photo_reference_state DROP CONSTRAINT IF EXISTS photo_reference_state_character_key_check;
ALTER TABLE public.photo_reference_state ADD CONSTRAINT photo_reference_state_character_key_check
 CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna','kendra','jade'));
ALTER TABLE public.spicy_photo_jobs DROP CONSTRAINT IF EXISTS spicy_photo_jobs_character_key_check;
ALTER TABLE public.spicy_photo_jobs ADD CONSTRAINT spicy_photo_jobs_character_key_check
 CHECK (character_key IN ('tess','maya','riley','claire','jordan','sienna','kendra','jade'));

-- Installed functions store inline allowlists. Extend each without changing
-- its grants, ownership, storage rules or user/character isolation.
DO $migration$
DECLARE signature text; definition text; updated text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'public.experience_seed(uuid,timestamptz)',
 'public.protect_living_plan()',
 'public.venue_reconcile_departures(uuid,timestamptz)',
 'public.relationship_player_command(uuid,uuid,text,text,text,uuid)',
 'public.set_profile_media(uuid,text,text,text,text,uuid)',
 'public.phone_command(uuid,uuid,text,jsonb,timestamptz)',
 'public.spicy_photo_preferences(uuid,text,boolean,boolean,integer)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
  IF position('''jade''' IN definition) > 0 THEN CONTINUE; END IF;
  updated := replace(definition, '''kendra''', '''kendra'',''jade''');
  IF updated = definition THEN RAISE EXCEPTION 'Expected cast guard absent: %',signature; END IF;
  EXECUTE updated;
 END LOOP;
END $migration$;

-- Jade's clear, character-origin engagement proposal can be committed after
-- an explicit player acceptance. Her playful first-line pickup alone cannot.
-- All other cast members keep their existing proposal kind restrictions.
CREATE OR REPLACE FUNCTION relationship_sync_character(p_user uuid,p_character text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m record; a jsonb; target relationship_commitment_events; n integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 IF p_character IS NULL OR p_character NOT IN ('tess','maya','riley','claire','jordan','sienna','kendra','jade') THEN RAISE EXCEPTION 'Unsupported relationship character';END IF;
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
     OR (coalesce(a->>'kind','') NOT IN ('exclusive','partnership') AND NOT (p_character='jade' AND a->>'kind'='engagement'))
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
