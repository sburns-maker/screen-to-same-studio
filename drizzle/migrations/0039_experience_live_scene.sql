-- Live physical scene is separate from immutable calendar provenance.
ALTER TABLE living_experiences ADD COLUMN live_scene jsonb, ADD COLUMN scene_revision integer NOT NULL DEFAULT 0 CHECK(scene_revision>=0),ADD COLUMN scene_source_ordinal integer NOT NULL DEFAULT 0;
CREATE TABLE experience_scene_transitions(
 user_id uuid NOT NULL,experience_id uuid NOT NULL,source_id uuid NOT NULL,source_ordinal integer NOT NULL,
 before_scene jsonb,after_scene jsonb NOT NULL,changed boolean NOT NULL,evidence_quote text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,experience_id,source_id),FOREIGN KEY(user_id,experience_id) REFERENCES living_experiences(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,source_id) REFERENCES living_experience_moments(user_id,id) ON DELETE CASCADE);
ALTER TABLE experience_scene_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY scene_owner_read ON experience_scene_transitions FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON experience_scene_transitions TO authenticated;GRANT ALL ON experience_scene_transitions TO service_role;
CREATE FUNCTION experience_scene_status() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT 39 $$;
CREATE FUNCTION experience_scene_apply(p_user uuid,p_plan uuid,p_source uuid,p_revision integer,p_scene jsonb,p_quote text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e living_experiences;p social_plans;m living_experience_moments;ch characters;current_scene jsonb;next_scene jsonb;venue world_places;loc text;changed boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));
 SELECT * INTO p FROM social_plans WHERE user_id=p_user AND id=p_plan FOR UPDATE;
 SELECT * INTO e FROM living_experiences WHERE user_id=p_user AND plan_id=p_plan FOR UPDATE;
 IF e.id IS NULL OR e.mode IS DISTINCT FROM 'interactive' THEN RAISE EXCEPTION 'Owned interactive experience required';END IF;
 SELECT chars.* INTO ch FROM conversations c JOIN characters chars ON chars.id=c.character_id WHERE c.user_id=p_user AND c.id=e.conversation_id;
 SELECT * INTO m FROM living_experience_moments WHERE user_id=p_user AND id=p_source AND experience_id=e.id AND source='user' AND confirmed;
 IF m.id IS NULL OR m.body IS DISTINCT FROM p_quote THEN RAISE EXCEPTION 'Actual recorded user evidence required';END IF;
 IF EXISTS(SELECT 1 FROM experience_scene_transitions WHERE user_id=p_user AND experience_id=e.id AND source_id=p_source) THEN RETURN jsonb_build_object('scene',e.live_scene,'revision',e.scene_revision,'replayed',true);END IF;
 IF p_revision IS DISTINCT FROM e.scene_revision OR m.ordinal<=e.scene_source_ordinal THEN RAISE EXCEPTION 'Scene revision or causal order changed';END IF;
 SELECT * INTO venue FROM world_places WHERE user_id=p_user AND key=p.place_key;
 current_scene:=coalesce(e.live_scene,jsonb_build_object('locationKey',p.place_key,'locationLabel',coalesce(venue.label,p.place_key),'locationKind',coalesce(venue.kind,'place'),'area','','activity',CASE WHEN venue.kind='park' THEN 'walking' ELSE 'talking' END,'participants',jsonb_build_array('user',ch.key),'destinationKey',NULL));
 next_scene:=coalesce(p_scene,current_scene);
 IF p_scene IS NOT NULL THEN
  IF jsonb_typeof(p_scene)<>'object' OR octet_length(p_scene::text)>3000 THEN RAISE EXCEPTION 'Bounded scene required';END IF;
  IF p_scene->'participants' IS DISTINCT FROM jsonb_build_array('user',ch.key) THEN RAISE EXCEPTION 'Scene participants must match the established experience';END IF;
  IF coalesce(p_scene->>'activity','') NOT IN('talking','walking','driving','arriving','ordering','dining','finished_meal','at_front_door','waiting') THEN RAISE EXCEPTION 'Invalid scene activity';END IF;
  loc:=p_scene->>'locationKey';
  SELECT * INTO venue FROM world_places WHERE user_id=p_user AND key=loc AND metadata->>'public'='true';
  IF loc='home:'||ch.key THEN next_scene:=next_scene||jsonb_build_object('locationLabel',ch.preferred_name||'''s home','locationKind','home');
  ELSIF loc='vehicle:current' THEN next_scene:=next_scene||'{"locationLabel":"the car","locationKind":"vehicle"}'::jsonb;
  ELSIF venue.key IS NOT NULL OR loc=p.place_key THEN
   SELECT * INTO venue FROM world_places WHERE user_id=p_user AND key=loc;
   next_scene:=next_scene||jsonb_build_object('locationLabel',venue.label,'locationKind',venue.kind);
  ELSE RAISE EXCEPTION 'Known scene destination required';END IF;
  IF next_scene->>'destinationKey' IS NOT NULL AND next_scene->>'destinationKey'<>'home:'||ch.key AND NOT EXISTS(SELECT 1 FROM world_places WHERE user_id=p_user AND key=next_scene->>'destinationKey' AND metadata->>'public'='true') THEN RAISE EXCEPTION 'Known travel destination required';END IF;
 END IF;
 changed:=current_scene IS DISTINCT FROM next_scene;
 UPDATE living_experiences SET live_scene=next_scene,scene_revision=scene_revision+CASE WHEN changed THEN 1 ELSE 0 END,scene_source_ordinal=m.ordinal WHERE user_id=p_user AND id=e.id;
 INSERT INTO experience_scene_transitions(user_id,experience_id,source_id,source_ordinal,before_scene,after_scene,changed,evidence_quote) VALUES(p_user,e.id,m.id,m.ordinal,current_scene,next_scene,changed,m.body);
 RETURN jsonb_build_object('scene',next_scene,'revision',e.scene_revision+CASE WHEN changed THEN 1 ELSE 0 END);
END $$;
REVOKE ALL ON FUNCTION experience_scene_status(),experience_scene_apply(uuid,uuid,uuid,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION experience_scene_status(),experience_scene_apply(uuid,uuid,uuid,integer,jsonb,text) TO service_role;
-- Preserve the outing's original place; record the final scene only as separate provenance.
CREATE FUNCTION experience_final_scene() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.state='completed' AND OLD.state IS DISTINCT FROM 'completed' AND NEW.live_scene IS NOT NULL THEN
  UPDATE shared_events SET facts=facts||jsonb_build_object('final_scene',NEW.live_scene) WHERE user_id=NEW.user_id AND source='experience' AND facts->>'plan_id'=NEW.plan_id::text;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER completed_experience_scene AFTER UPDATE OF state ON living_experiences FOR EACH ROW EXECUTE FUNCTION experience_final_scene();

-- Rebuildable physical-location projection of actual delivered character statements.
-- This does not change canon, relationships, the weekly schedule or any message.
CREATE TABLE character_scene_state(user_id uuid NOT NULL,conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,source_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,location text NOT NULL,activity text NOT NULL,observed_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(user_id,conversation_id));
ALTER TABLE character_scene_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY character_scene_owner ON character_scene_state FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON character_scene_state TO authenticated;GRANT ALL ON character_scene_state TO service_role;
CREATE FUNCTION character_scene_apply(p_user uuid,p_conversation uuid,p_source uuid,p_location text,p_activity text,p_now timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m messages;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 SELECT * INTO m FROM messages WHERE user_id=p_user AND conversation_id=p_conversation AND id=p_source AND sender='tess' AND visible_at<=p_now AND created_at>=p_now-interval '4 hours';
 IF m.id IS NULL OR NOT EXISTS(SELECT 1 FROM conversations WHERE user_id=p_user AND id=p_conversation) THEN RAISE EXCEPTION 'Actual current owned character statement required';END IF;
 IF p_location NOT IN('home','clinic','venue','coffee_shop','library','garden','outdoors','work','social','grocery','vehicle') OR length(p_activity)>100 THEN RAISE EXCEPTION 'Invalid character scene';END IF;
 INSERT INTO character_scene_state VALUES(p_user,p_conversation,p_source,p_location,p_activity,m.created_at,m.created_at+interval '4 hours') ON CONFLICT(user_id,conversation_id) DO UPDATE SET source_id=excluded.source_id,location=excluded.location,activity=excluded.activity,observed_at=excluded.observed_at,expires_at=excluded.expires_at WHERE character_scene_state.observed_at<=excluded.observed_at;
END $$;
REVOKE ALL ON FUNCTION character_scene_apply(uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION character_scene_apply(uuid,uuid,uuid,text,text,timestamptz) TO service_role;
