-- Private housing extends the existing place/calendar/event graph. No histories reset.
CREATE TABLE housing_people(user_id uuid NOT NULL,person_key text NOT NULL,label text NOT NULL,source text NOT NULL,initialized boolean NOT NULL DEFAULT false,PRIMARY KEY(user_id,person_key));
CREATE TABLE housing_residences(user_id uuid NOT NULL,id uuid NOT NULL,place_key text NOT NULL,label text NOT NULL,community text NOT NULL DEFAULT 'Altoona',housing_type text NOT NULL DEFAULT 'private_residence' CHECK(housing_type IN('house','apartment','townhouse','shared_residence','private_residence')),arrangement text NOT NULL DEFAULT 'other' CHECK(arrangement IN('renting','owning','family','shared_rent','temporary','other')),description text NOT NULL DEFAULT '',neighborhood text NOT NULL DEFAULT 'Fictional residential neighborhood',created_by text,address text,latitude double precision NOT NULL DEFAULT 40.5187,longitude double precision NOT NULL DEFAULT -78.3947,exact_latitude double precision,exact_longitude double precision,show_exact boolean NOT NULL DEFAULT false,provisional boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),UNIQUE(user_id,place_key),FOREIGN KEY(user_id,place_key) REFERENCES world_places(user_id,key),CHECK(latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180),CHECK(exact_latitude IS NULL OR exact_latitude BETWEEN -90 AND 90),CHECK(exact_longitude IS NULL OR exact_longitude BETWEEN -180 AND 180));
CREATE TABLE housing_households(user_id uuid NOT NULL,id uuid NOT NULL,residence_id uuid NOT NULL,arrangement text NOT NULL DEFAULT 'other',pets jsonb NOT NULL DEFAULT '[]',dependents jsonb NOT NULL DEFAULT '[]',shared_expenses jsonb NOT NULL DEFAULT '[]',permissions jsonb NOT NULL DEFAULT '{"invite":"residents","move_in":"all_adult_residents"}',consent_review_required boolean NOT NULL DEFAULT false,PRIMARY KEY(user_id,id),UNIQUE(user_id,residence_id),FOREIGN KEY(user_id,residence_id) REFERENCES housing_residences(user_id,id));
CREATE TABLE housing_memberships(user_id uuid NOT NULL,id uuid NOT NULL,person_key text NOT NULL,household_id uuid NOT NULL,residence_id uuid NOT NULL,kind text NOT NULL DEFAULT 'primary' CHECK(kind IN('primary','secondary','temporary')),relation text NOT NULL DEFAULT 'individual',started_at timestamptz NOT NULL,ended_at timestamptz,expires_at timestamptz,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id,person_key) REFERENCES housing_people(user_id,person_key),FOREIGN KEY(user_id,household_id) REFERENCES housing_households(user_id,id),FOREIGN KEY(user_id,residence_id) REFERENCES housing_residences(user_id,id));
CREATE UNIQUE INDEX housing_one_primary ON housing_memberships(user_id,person_key) WHERE kind='primary' AND ended_at IS NULL;
CREATE UNIQUE INDEX housing_one_temporary ON housing_memberships(user_id,person_key) WHERE kind='temporary' AND ended_at IS NULL;
CREATE UNIQUE INDEX housing_one_active_membership ON housing_memberships(user_id,person_key,residence_id,kind) WHERE ended_at IS NULL;
CREATE TABLE housing_access(user_id uuid NOT NULL,residence_id uuid NOT NULL,viewer text NOT NULL,permission text NOT NULL CHECK(permission IN('address','visit')),plan_id uuid,source text NOT NULL,granted_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,PRIMARY KEY(user_id,residence_id,viewer,permission,source),FOREIGN KEY(user_id,residence_id) REFERENCES housing_residences(user_id,id),FOREIGN KEY(user_id,plan_id) REFERENCES social_plans(user_id,id));
CREATE TABLE housing_proposals(user_id uuid NOT NULL,id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('move','temporary')),initiator text NOT NULL,residence_id uuid NOT NULL,movers text[] NOT NULL,required text[] NOT NULL,responses jsonb NOT NULL,from_homes jsonb NOT NULL,purpose text NOT NULL DEFAULT 'household',starts_at timestamptz,ends_at timestamptz,status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','accepted','completed','declined','cancelled','needs_review')),version integer NOT NULL DEFAULT 0,plan_id uuid,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),FOREIGN KEY(user_id,residence_id) REFERENCES housing_residences(user_id,id),FOREIGN KEY(user_id,plan_id) REFERENCES social_plans(user_id,id));
CREATE TABLE housing_events(user_id uuid NOT NULL,id uuid NOT NULL,person_key text,residence_id uuid,event_type text NOT NULL,detail jsonb NOT NULL,occurred_at timestamptz NOT NULL,PRIMARY KEY(user_id,id));
CREATE TABLE housing_receipts(user_id uuid NOT NULL,id uuid NOT NULL,actor text NOT NULL,command text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(user_id,id));
CREATE TABLE housing_goals(user_id uuid NOT NULL,person_key text NOT NULL,source_id uuid NOT NULL,goal text NOT NULL,status text NOT NULL DEFAULT 'considering',created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,person_key,source_id));
CREATE TABLE housing_action_outbox(user_id uuid NOT NULL,source_kind text NOT NULL,source_id uuid NOT NULL,actions jsonb NOT NULL,processed boolean NOT NULL DEFAULT false,failure text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,source_kind,source_id));
ALTER TABLE social_plans ADD COLUMN housing_proposal_id uuid;
ALTER TABLE social_plans ADD CONSTRAINT housing_plan_proposal FOREIGN KEY(user_id,housing_proposal_id) REFERENCES housing_proposals(user_id,id);
ALTER TABLE social_plans DROP CONSTRAINT social_plans_origin_check;
ALTER TABLE social_plans ADD CONSTRAINT social_plans_origin_check CHECK(origin IN('legacy','conversation','housing'));
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['housing_people','housing_residences','housing_households','housing_memberships','housing_access','housing_proposals','housing_events','housing_receipts','housing_goals','housing_action_outbox'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT ALL ON %I TO service_role',t);
END LOOP;END$$;
CREATE FUNCTION housing_status() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT 45$$;
CREATE FUNCTION housing_primary(p_user uuid,p_person text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT r.place_key FROM housing_memberships m JOIN housing_residences r ON r.user_id=m.user_id AND r.id=m.residence_id WHERE m.user_id=p_user AND m.person_key=p_person AND m.kind='primary' AND m.ended_at IS NULL$$;
CREATE FUNCTION housing_ensure_person(p_user uuid,p_person text,p_label text,p_source text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;place text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('housing:'||p_user::text,0));
 INSERT INTO housing_people VALUES(p_user,p_person,p_label,p_source,false) ON CONFLICT DO NOTHING;
 IF (SELECT initialized FROM housing_people WHERE user_id=p_user AND person_key=p_person) THEN RETURN;END IF;
 rid:=md5(p_user::text||':initial-home:'||p_person)::uuid;place:='home:'||p_person;
 INSERT INTO world_places(user_id,key,label,kind,metadata) VALUES(p_user,place,'Private residence','home','{"public":false,"residential":true,"fictional":true,"activities":["look","seat","wait","cook","movie","games","chores","relax"],"opens":0,"closes":24}') ON CONFLICT DO NOTHING;
 INSERT INTO housing_residences(user_id,id,place_key,label,housing_type,arrangement,description,provisional,created_by)
 VALUES(p_user,rid,place,CASE WHEN p_person='user' THEN 'My Home' ELSE p_label||'''s home' END,CASE WHEN p_person='tess' THEN 'townhouse' WHEN p_person='ben' THEN 'house' ELSE 'apartment' END,CASE WHEN p_person='ben' THEN 'family' ELSE 'renting' END,CASE WHEN p_person='tess' THEN 'Established rented townhouse shared with Mabel. Neighborhood is approximate.' ELSE 'Plausible provisional fictional housing; established memories and authored housing facts take precedence. No finances or new family members are inferred.' END,p_person<>'tess',p_person) ON CONFLICT DO NOTHING;
 INSERT INTO housing_households(user_id,id,residence_id,arrangement,pets,dependents,consent_review_required) VALUES(p_user,rid,rid,(SELECT arrangement FROM housing_residences WHERE user_id=p_user AND id=rid),CASE WHEN p_person='tess' THEN '[{"name":"Mabel","owner":"tess","species":"dog"}]'::jsonb ELSE '[]' END,CASE WHEN p_person='ben' THEN '[{"description":"Established spouse and two children; identities undisclosed"}]'::jsonb ELSE '[]' END,p_person='ben') ON CONFLICT DO NOTHING;
 INSERT INTO housing_memberships VALUES(p_user,md5(p_user::text||':initial-membership:'||p_person)::uuid,p_person,rid,rid,'primary','individual',now(),NULL,NULL) ON CONFLICT DO NOTHING;
 UPDATE housing_residences SET latitude=40.5187+((('x'||substr(md5(p_person),1,4))::bit(16)::int % 15)-7)*0.001,longitude=-78.3947+((('x'||substr(md5(p_person),5,4))::bit(16)::int % 15)-7)*0.001 WHERE user_id=p_user AND id=rid;
 UPDATE housing_people SET initialized=true WHERE user_id=p_user AND person_key=p_person;
END$$;
CREATE FUNCTION housing_seed(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE p record;BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 PERFORM housing_ensure_person(p_user,'user','You','player');
 FOR p IN SELECT key,preferred_name FROM characters WHERE enabled LOOP PERFORM housing_ensure_person(p_user,p.key,p.preferred_name,'character');END LOOP;
 FOR p IN SELECT key,profile FROM town_people WHERE user_id=p_user LOOP PERFORM housing_ensure_person(p_user,p.key,coalesce(p.profile->>'name',p.key),'town');END LOOP;
 FOR p IN SELECT id,name FROM npcs WHERE user_id=p_user LOOP PERFORM housing_ensure_person(p_user,'npc:'||p.id,p.name,'support');END LOOP;
END$$;
CREATE FUNCTION housing_seed_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE p record;BEGIN
 IF TG_TABLE_NAME='characters' THEN FOR p IN SELECT DISTINCT user_id FROM housing_people LOOP PERFORM housing_ensure_person(p.user_id,NEW.key,NEW.preferred_name,'character');END LOOP;
 ELSIF TG_TABLE_NAME='conversations' THEN PERFORM housing_ensure_person(NEW.user_id,'user','You','player');SELECT key,preferred_name INTO p FROM characters WHERE id=NEW.character_id;IF FOUND THEN PERFORM housing_ensure_person(NEW.user_id,p.key,p.preferred_name,'character');END IF;
 ELSIF TG_TABLE_NAME='town_people' THEN PERFORM housing_ensure_person(NEW.user_id,NEW.key,coalesce(NEW.profile->>'name',NEW.key),'town');
 ELSE PERFORM housing_ensure_person(NEW.user_id,'npc:'||NEW.id,NEW.name,'support');END IF; RETURN NEW;
END$$;
CREATE TRIGGER housing_new_character AFTER INSERT ON characters FOR EACH ROW EXECUTE FUNCTION housing_seed_trigger();
CREATE TRIGGER housing_new_conversation AFTER INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION housing_seed_trigger();
CREATE TRIGGER housing_new_town_person AFTER INSERT ON town_people FOR EACH ROW EXECUTE FUNCTION housing_seed_trigger();
CREATE TRIGGER housing_new_support AFTER INSERT ON npcs FOR EACH ROW EXECUTE FUNCTION housing_seed_trigger();
-- Existing users are initialized lazily by the authenticated app's server-side
-- seedHousing path and world worker. Migration sessions have no service JWT;
-- never call the runtime-only housing_seed here or weaken its role check.
CREATE FUNCTION housing_resident(p_user uuid,p_place text,p_person text,p_at timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT EXISTS(SELECT 1 FROM housing_memberships m JOIN housing_residences r ON r.user_id=m.user_id AND r.id=m.residence_id WHERE m.user_id=p_user AND r.place_key=p_place AND m.person_key=p_person AND m.ended_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>p_at))$$;
CREATE FUNCTION housing_can_enter(p_user uuid,p_place text,p_viewer text,p_at timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT housing_resident(p_user,p_place,p_viewer,p_at) OR EXISTS(SELECT 1 FROM housing_access a JOIN housing_residences r ON r.user_id=a.user_id AND r.id=a.residence_id LEFT JOIN social_plans p ON p.user_id=a.user_id AND p.id=a.plan_id WHERE a.user_id=p_user AND r.place_key=p_place AND a.viewer=p_viewer AND a.permission='visit' AND (a.expires_at IS NULL OR a.expires_at>p_at) AND (a.plan_id IS NULL OR p.place_key=r.place_key AND p.status IN('accepted','in_progress') AND p_at BETWEEN p.starts_at-interval '1 hour' AND p.ends_at+interval '4 hours')) $$;
CREATE FUNCTION housing_plan_venue_allowed(p_user uuid,p_place text,p_character text,p_at timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT housing_resident(p_user,p_place,'user',p_at) OR (housing_resident(p_user,p_place,p_character,p_at) AND EXISTS(SELECT 1 FROM housing_access a JOIN housing_residences r ON r.user_id=a.user_id AND r.id=a.residence_id LEFT JOIN social_plans p ON p.user_id=a.user_id AND p.id=a.plan_id WHERE a.user_id=p_user AND r.place_key=p_place AND a.viewer='user' AND a.permission='visit' AND (a.expires_at IS NULL OR a.expires_at>p_at) AND (a.plan_id IS NULL OR p.place_key=r.place_key AND p.status NOT IN('cancelled','declined','missed','completed'))))$$;
CREATE FUNCTION housing_snapshot(p_user uuid,p_viewer text DEFAULT 'user') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE homes jsonb;members jsonb;proposals jsonb;history jsonb;BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'key',r.place_key,'label',CASE WHEN r.place_key=housing_primary(p_user,'user') THEN CASE WHEN p_viewer='user' THEN 'My Home' WHEN housing_resident(p_user,r.place_key,p_viewer,now()) THEN 'Your shared home' ELSE 'Player''s home' END ELSE r.label END,'kind','home','community',r.community,'housingType',r.housing_type,'arrangement',r.arrangement,'neighborhood',r.neighborhood,'description',CASE WHEN housing_resident(p_user,r.place_key,p_viewer,now()) THEN r.description ELSE 'Private fictional residence. An invitation is required.' END,'latitude',CASE WHEN exact THEN coalesce(r.exact_latitude,r.latitude) ELSE r.latitude END,'longitude',CASE WHEN exact THEN coalesce(r.exact_longitude,r.longitude) ELSE r.longitude END,'address',CASE WHEN exact THEN r.address END,'exact',exact,'canEdit',p_viewer='user' AND r.created_by='user','canVisit',housing_can_enter(p_user,r.place_key,p_viewer,now()),'canPlan',housing_resident(p_user,r.place_key,p_viewer,now()) OR EXISTS(SELECT 1 FROM housing_access a WHERE a.user_id=p_user AND a.residence_id=r.id AND a.viewer=p_viewer AND a.permission='visit' AND (a.expires_at IS NULL OR a.expires_at>now()) AND (a.plan_id IS NULL OR EXISTS(SELECT 1 FROM social_plans sp WHERE sp.user_id=p_user AND sp.id=a.plan_id AND sp.place_key=r.place_key AND sp.status NOT IN('cancelled','declined','completed','missed')))),'primaryFor',(SELECT coalesce(jsonb_agg(m.person_key),'[]') FROM housing_memberships m WHERE m.user_id=p_user AND m.residence_id=r.id AND m.ended_at IS NULL AND m.kind='primary' AND (housing_resident(p_user,r.place_key,p_viewer,now()) OR p_viewer='user' AND EXISTS(SELECT 1 FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=m.person_key))),'provisional',r.provisional)),'[]') INTO homes
 FROM housing_residences r CROSS JOIN LATERAL(SELECT ((housing_resident(p_user,r.place_key,p_viewer,now()) AND r.show_exact) OR EXISTS(SELECT 1 FROM housing_access a WHERE a.user_id=p_user AND a.residence_id=r.id AND a.viewer=p_viewer AND a.permission='address' AND (a.expires_at IS NULL OR a.expires_at>now()))) exact) allowed
 WHERE r.user_id=p_user AND (r.created_by=p_viewer OR EXISTS(SELECT 1 FROM housing_proposals hp WHERE hp.user_id=p_user AND hp.residence_id=r.id AND p_viewer=ANY(hp.required) AND hp.status IN('proposed','accepted','needs_review')) OR housing_resident(p_user,r.place_key,p_viewer,now()) OR EXISTS(SELECT 1 FROM housing_access a WHERE a.user_id=p_user AND a.residence_id=r.id AND a.viewer=p_viewer AND (a.expires_at IS NULL OR a.expires_at>now())) OR (p_viewer='user' AND EXISTS(SELECT 1 FROM housing_memberships m JOIN housing_people hp ON hp.user_id=m.user_id AND hp.person_key=m.person_key WHERE m.user_id=p_user AND m.residence_id=r.id AND m.kind='primary' AND m.ended_at IS NULL AND (EXISTS(SELECT 1 FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=hp.person_key) OR EXISTS(SELECT 1 FROM town_connections tc WHERE tc.user_id=p_user AND tc.npc_key=hp.person_key AND tc.encountered_at IS NOT NULL)))));
 SELECT coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('label',hp.label,'homeLabel',r.label)),'[]') INTO members FROM housing_memberships m JOIN housing_people hp USING(user_id,person_key) JOIN housing_residences r ON r.user_id=m.user_id AND r.id=m.residence_id WHERE m.user_id=p_user AND m.ended_at IS NULL AND housing_resident(p_user,r.place_key,p_viewer,now());
 SELECT coalesce(jsonb_agg(to_jsonb(p)-'from_homes'||jsonb_build_object('homeLabel',r.label,'community',r.community)),'[]') INTO proposals FROM housing_proposals p JOIN housing_residences r ON r.user_id=p.user_id AND r.id=p.residence_id WHERE p.user_id=p_user AND p_viewer=ANY(p.required);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'person',m.person_key,'homeLabel',r.label,'community',r.community,'kind',m.kind,'startedAt',m.started_at,'endedAt',m.ended_at,'relation',m.relation) ORDER BY m.started_at DESC),'[]') INTO history FROM housing_memberships m JOIN housing_residences r ON r.user_id=m.user_id AND r.id=m.residence_id WHERE m.user_id=p_user AND m.person_key=p_viewer;
 RETURN jsonb_build_object('homes',homes,'members',members,'proposals',proposals,'history',history,'primary',housing_primary(p_user,p_viewer),'adultConfirmed',housing_adult_known(p_user,p_viewer),
 'goals',(SELECT coalesce(jsonb_agg(goal),'[]') FROM(SELECT goal FROM housing_goals WHERE user_id=p_user AND person_key=p_viewer ORDER BY created_at DESC LIMIT 6)x),
 'households',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'arrangement',h.arrangement,'pets',h.pets,'dependents',h.dependents,'permissions',h.permissions,'sharedExpenses',h.shared_expenses)),'[]') FROM housing_households h JOIN housing_residences r ON r.user_id=h.user_id AND r.id=h.residence_id WHERE h.user_id=p_user AND housing_resident(p_user,r.place_key,p_viewer,now())));
END$$;
CREATE FUNCTION housing_adult_known(p_user uuid,p_person text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_person='user' THEN EXISTS(SELECT 1 FROM user_profile WHERE user_id=p_user AND key='housing_adult_confirmed' AND value='true') ELSE
 EXISTS(SELECT 1 FROM characters WHERE key=p_person AND age>=18) OR EXISTS(SELECT 1 FROM town_people WHERE user_id=p_user AND key=p_person AND CASE WHEN profile->>'age' ~ '^[0-9]{1,3}$' THEN (profile->>'age')::integer>=18 ELSE false END) END;
$$;
CREATE FUNCTION housing_command(p_user uuid,p_id uuid,p_actor text,p_command text,p_payload jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE receipt housing_receipts;r housing_residences;prop housing_proposals;home text;rid uuid;pid uuid;required text[];movers text[];answers jsonb;froms jsonb;who text;result jsonb;start_at timestamptz;kind text;old_members jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('housing:'||p_user::text,0));
 IF NOT EXISTS(SELECT 1 FROM housing_people WHERE user_id=p_user AND person_key=p_actor) THEN RAISE EXCEPTION 'known owned housing actor required';END IF;
 SELECT * INTO receipt FROM housing_receipts WHERE user_id=p_user AND id=p_id;
 IF FOUND THEN IF receipt.actor<>p_actor OR receipt.command<>p_command OR receipt.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'housing action id conflict';END IF;RETURN receipt.result||'{"replayed":true}';END IF;
 IF octet_length(p_payload::text)>6000 THEN RAISE EXCEPTION 'bounded housing action required';END IF;
 IF p_command='adult_confirmation' THEN
  IF p_actor<>'user' OR jsonb_typeof(p_payload->'confirmed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'explicit player adulthood confirmation required';END IF;
  INSERT INTO user_profile(user_id,key,value) VALUES(p_user,'housing_adult_confirmed',p_payload->>'confirmed') ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value;
  result:=jsonb_build_object('confirmed',p_payload->'confirmed');
 ELSIF p_command='set_home' THEN
  IF p_actor<>'user' THEN RAISE EXCEPTION 'player home requires player action';END IF;
  home:=housing_primary(p_user,p_actor);SELECT * INTO r FROM housing_residences WHERE user_id=p_user AND place_key=home FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'create a home before editing';END IF;
  IF r.created_by IS DISTINCT FROM 'user' THEN RAISE EXCEPTION 'only player-managed home details can be edited';END IF;
  IF NOT r.provisional AND p_payload->>'community' IS NOT NULL AND p_payload->>'community'<>r.community THEN RAISE EXCEPTION 'schedule a move to change communities';END IF;
  INSERT INTO housing_events VALUES(p_user,p_id,p_actor,r.id,'home_details_edited',jsonb_build_object('before',to_jsonb(r),'requested',p_payload),p_now);
  UPDATE housing_residences SET label=coalesce(nullif(left(p_payload->>'label',100),''),label),community=coalesce(nullif(left(p_payload->>'community',80),''),community),housing_type=coalesce(p_payload->>'housingType',housing_type),arrangement=coalesce(p_payload->>'arrangement',arrangement),description=coalesce(left(p_payload->>'description',500),description),address=CASE WHEN p_payload ? 'address' THEN nullif(left(p_payload->>'address',160),'') ELSE address END,show_exact=coalesce((p_payload->>'showExact')::boolean,show_exact),exact_latitude=CASE WHEN p_payload ? 'exactLatitude' THEN (p_payload->>'exactLatitude')::double precision ELSE exact_latitude END,exact_longitude=CASE WHEN p_payload ? 'exactLongitude' THEN (p_payload->>'exactLongitude')::double precision ELSE exact_longitude END,latitude=CASE coalesce(p_payload->>'community',community) WHEN 'Hollidaysburg' THEN 40.4273 WHEN 'Tyrone' THEN 40.6706 WHEN 'Duncansville' THEN 40.4234 ELSE 40.5187 END,longitude=CASE coalesce(p_payload->>'community',community) WHEN 'Hollidaysburg' THEN -78.3889 WHEN 'Tyrone' THEN -78.2386 WHEN 'Duncansville' THEN -78.4339 ELSE -78.3947 END,provisional=false WHERE user_id=p_user AND id=r.id;
  UPDATE housing_households SET arrangement=(SELECT arrangement FROM housing_residences WHERE user_id=p_user AND id=r.id) WHERE user_id=p_user AND residence_id=r.id;
  result:=jsonb_build_object('home',home);
 ELSIF p_command='remove_home' THEN
  IF p_actor<>'user' OR p_payload->>'confirmation'<>'REMOVE MY VIRTUAL HOME' THEN RAISE EXCEPTION 'explicit player removal required';END IF;
  home:=housing_primary(p_user,p_actor);UPDATE housing_memberships SET ended_at=p_now WHERE user_id=p_user AND person_key=p_actor AND housing_memberships.kind='primary' AND ended_at IS NULL;
  INSERT INTO housing_events VALUES(p_user,p_id,p_actor,NULL,'primary_home_removed',jsonb_build_object('previous',home),p_now);result:=jsonb_build_object('removed',home);
 ELSIF p_command='disclose' THEN
  SELECT * INTO r FROM housing_residences WHERE user_id=p_user AND place_key=p_payload->>'place';
  IF r.id IS NULL OR NOT housing_resident(p_user,r.place_key,p_actor,p_now) THEN RAISE EXCEPTION 'only a resident can disclose a home';END IF;
  who:=p_payload->>'viewer';IF NOT EXISTS(SELECT 1 FROM housing_people WHERE user_id=p_user AND person_key=who) THEN RAISE EXCEPTION 'known recipient required';END IF;
  IF p_payload->>'permission' NOT IN('address','visit') THEN RAISE EXCEPTION 'known permission required';END IF;
  INSERT INTO housing_access VALUES(p_user,r.id,who,p_payload->>'permission',NULL,'explicit:'||p_id,p_now,CASE WHEN p_payload->>'permission'='visit' THEN p_now+interval '1 day' END) ON CONFLICT DO NOTHING;
  result:=jsonb_build_object('disclosed',r.place_key,'viewer',who);
 ELSIF p_command='revoke' THEN
  SELECT * INTO r FROM housing_residences WHERE user_id=p_user AND place_key=p_payload->>'place';
  IF r.id IS NULL OR NOT housing_resident(p_user,r.place_key,p_actor,p_now) THEN RAISE EXCEPTION 'only a resident can disclose a home';END IF;
  DELETE FROM housing_access WHERE user_id=p_user AND residence_id=r.id AND viewer=p_payload->>'viewer' AND permission=p_payload->>'permission';
  result:=jsonb_build_object('revoked',r.place_key);
 ELSIF p_command IN('propose_move','new_home') THEN
  IF p_command='new_home' THEN
   rid:=md5(p_user::text||':home-candidate:'||p_id)::uuid;home:='residence:'||rid;
   INSERT INTO world_places(user_id,key,label,kind,metadata) VALUES(p_user,home,'Private residence','home','{"public":false,"residential":true,"fictional":true,"opens":0,"closes":24,"activities":["look","seat","wait","cook","movie","games","chores","relax"]}');
   INSERT INTO housing_residences(user_id,id,place_key,label,community,housing_type,arrangement,description,created_by) VALUES(p_user,rid,home,coalesce(nullif(left(p_payload->>'label',100),''),'New fictional home'),coalesce(nullif(left(p_payload->>'community',80),''),'Altoona'),coalesce(p_payload->>'housingType','private_residence'),coalesce(p_payload->>'arrangement','other'),coalesce(left(p_payload->>'description',500),'Fictional housing selected for a move.'),p_actor) RETURNING * INTO r;
   UPDATE housing_residences SET latitude=CASE community WHEN 'Hollidaysburg' THEN 40.4273 WHEN 'Tyrone' THEN 40.6706 WHEN 'Duncansville' THEN 40.4234 ELSE 40.5187 END,longitude=CASE community WHEN 'Hollidaysburg' THEN -78.3889 WHEN 'Tyrone' THEN -78.2386 WHEN 'Duncansville' THEN -78.4339 ELSE -78.3947 END WHERE user_id=p_user AND id=rid;
   INSERT INTO housing_households(user_id,id,residence_id,arrangement) VALUES(p_user,rid,rid,r.arrangement);
  ELSE
   SELECT * INTO r FROM housing_residences WHERE user_id=p_user AND place_key=p_payload->>'place' FOR UPDATE;
   IF r.id IS NULL THEN RAISE EXCEPTION 'owned residential destination required';END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(housing_snapshot(p_user,p_actor)->'homes') h WHERE h->>'key'=r.place_key) THEN RAISE EXCEPTION 'unknown private home';END IF;
  END IF;
  SELECT array_agg(DISTINCT value) INTO movers FROM jsonb_array_elements_text(coalesce(p_payload->'movers',jsonb_build_array(p_actor)));
  IF cardinality(movers) NOT BETWEEN 1 AND 6 OR NOT(p_actor=ANY(movers) OR housing_resident(p_user,r.place_key,p_actor,p_now)) OR EXISTS(SELECT 1 FROM unnest(movers) m WHERE NOT EXISTS(SELECT 1 FROM housing_people WHERE user_id=p_user AND person_key=m)) THEN RAISE EXCEPTION 'known moving participants required';END IF;
  IF coalesce(p_payload->>'kind','move')='move' THEN SELECT array_agg(x) INTO movers FROM unnest(movers) x WHERE housing_primary(p_user,x) IS DISTINCT FROM r.place_key;END IF;
  IF coalesce(cardinality(movers),0)=0 THEN RAISE EXCEPTION 'participants already live at this primary home';END IF;
  SELECT array_agg(DISTINCT person_key) INTO required FROM (SELECT unnest(movers) person_key UNION SELECT person_key FROM housing_memberships WHERE user_id=p_user AND residence_id=r.id AND ended_at IS NULL AND (expires_at IS NULL OR expires_at>p_now)) x;
  SELECT coalesce(jsonb_object_agg(k,CASE WHEN k=p_actor THEN 'accepted' ELSE 'pending' END),'{}') INTO answers FROM unnest(required) k;
  SELECT jsonb_object_agg(k,to_jsonb(coalesce(housing_primary(p_user,k),''))) INTO froms FROM unnest(movers) k;
  start_at:=nullif(p_payload->>'startsAt','')::timestamptz;kind:=CASE WHEN p_payload->>'kind'='temporary' THEN 'temporary' ELSE 'move' END;
  IF kind='temporary' AND (nullif(p_payload->>'endsAt','')::timestamptz IS NULL OR nullif(p_payload->>'endsAt','')::timestamptz<=start_at) THEN RAISE EXCEPTION 'temporary stay needs an end date';END IF;
  INSERT INTO housing_proposals(user_id,id,kind,initiator,residence_id,movers,required,responses,from_homes,purpose,starts_at,ends_at,status) VALUES(p_user,p_id,kind,p_actor,r.id,movers,required,answers,froms,coalesce(left(p_payload->>'purpose',80),'individual'),start_at,nullif(p_payload->>'endsAt','')::timestamptz,CASE WHEN cardinality(required)>1 AND EXISTS(SELECT 1 FROM unnest(required) k WHERE NOT housing_adult_known(p_user,k)) THEN 'needs_review' WHEN (SELECT consent_review_required FROM housing_households WHERE user_id=p_user AND residence_id=r.id) THEN 'needs_review' WHEN start_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM unnest(required) k WHERE answers->>k<>'accepted') THEN 'accepted' ELSE 'proposed' END) RETURNING * INTO prop;
  pid:=md5(p_user::text||':housing-plan:'||p_id)::uuid;
  INSERT INTO social_plans(user_id,id,organizer,place_key,title,starts_at,ends_at,status,origin,category,proposer,time_zone,housing_proposal_id,description) VALUES(p_user,pid,p_actor,r.place_key,CASE WHEN kind='temporary' THEN 'Temporary stay · ' ELSE 'Move · ' END||left(r.label,90),start_at,start_at+interval '2 hours',CASE WHEN prop.status='accepted' THEN 'accepted' ELSE 'proposed' END,'housing','meetup',p_actor,'America/New_York',p_id,'Housing proposal; user travel and participation are not assumed.');
  UPDATE social_plans SET user_response=CASE WHEN 'user'=ANY(required) THEN answers->>'user' ELSE 'not_reported' END,character_response=answers->>p_actor WHERE user_id=p_user AND id=pid;
  INSERT INTO social_rsvps(user_id,plan_id,character_key,response,channel,reason) SELECT p_user,pid,k,CASE WHEN answers->>k='accepted' THEN 'accepted' ELSE 'invited' END,'housing','Explicit household proposal; attendance not inferred' FROM unnest(required) k WHERE k<>'user';
  UPDATE housing_proposals SET plan_id=pid WHERE user_id=p_user AND id=p_id;
  IF 'user'=ANY(required) THEN INSERT INTO town_known_plans VALUES(p_user,pid) ON CONFLICT DO NOTHING;END IF;
  INSERT INTO housing_events VALUES(p_user,p_id,p_actor,r.id,'move_proposed',jsonb_build_object('proposal',p_id,'source',p_payload->>'source'),p_now);
  result:=jsonb_build_object('proposalId',p_id,'planId',pid,'status',prop.status);
 ELSIF p_command IN('respond','cancel') THEN
  SELECT * INTO prop FROM housing_proposals WHERE user_id=p_user AND id=(p_payload->>'proposalId')::uuid FOR UPDATE;
  IF prop.id IS NULL OR NOT p_actor=ANY(prop.required) OR prop.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'owned current housing proposal required';END IF;
  IF prop.status NOT IN('proposed','accepted') AND NOT(prop.status='needs_review' AND (p_command='cancel' OR coalesce((p_payload->>'accept')::boolean,false)=false)) THEN RAISE EXCEPTION 'housing proposal is closed or needs review';END IF;
  IF p_command='cancel' AND p_actor<>prop.initiator THEN RAISE EXCEPTION 'only initiator can cancel; other participants can decline';END IF;
  IF p_payload->>'startsAt' IS NOT NULL AND prop.starts_at IS DISTINCT FROM (p_payload->>'startsAt')::timestamptz THEN
   prop.starts_at:=(p_payload->>'startsAt')::timestamptz;SELECT jsonb_object_agg(k,'pending') INTO prop.responses FROM unnest(prop.required) k;
  END IF;
  prop.responses:=jsonb_set(prop.responses,ARRAY[p_actor],to_jsonb(CASE WHEN coalesce((p_payload->>'accept')::boolean,false) AND p_command<>'cancel' THEN 'accepted'::text ELSE 'declined'::text END));
  prop.status:=CASE WHEN p_command='cancel' THEN 'cancelled' WHEN prop.responses->>p_actor='declined' THEN 'declined' WHEN prop.starts_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM unnest(prop.required) k WHERE prop.responses->>k<>'accepted') THEN 'accepted' ELSE 'proposed' END;
  UPDATE housing_proposals SET responses=prop.responses,starts_at=prop.starts_at,status=prop.status,version=version+1 WHERE user_id=p_user AND id=prop.id;
  UPDATE social_plans SET user_response=coalesce(prop.responses->>'user','not_reported'),character_response=prop.responses->>prop.initiator,status=CASE WHEN prop.status='accepted' THEN 'accepted' WHEN prop.status IN('cancelled','declined') THEN prop.status ELSE 'proposed' END,starts_at=prop.starts_at,ends_at=prop.starts_at+interval '2 hours',version=version+1 WHERE user_id=p_user AND id=prop.plan_id;
  UPDATE social_rsvps sr SET response=CASE WHEN prop.responses->>sr.character_key='accepted' THEN 'accepted' WHEN prop.responses->>sr.character_key='declined' THEN 'declined' ELSE 'invited' END,updated_at=p_now WHERE sr.user_id=p_user AND sr.plan_id=prop.plan_id;
  INSERT INTO housing_events VALUES(p_user,p_id,p_actor,prop.residence_id,'proposal_response',jsonb_build_object('proposal',prop.id,'response',prop.responses->>p_actor),p_now);result:=jsonb_build_object('proposalId',prop.id,'status',prop.status);
 ELSIF p_command='goal' THEN
  IF length(trim(coalesce(p_payload->>'goal',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'bounded housing goal required';END IF;
  INSERT INTO housing_goals VALUES(p_user,p_actor,p_id,p_payload->>'goal','considering',p_now) ON CONFLICT DO NOTHING;result:='{"status":"considering"}';
 ELSE RAISE EXCEPTION 'unknown housing command';END IF;
 INSERT INTO housing_receipts VALUES(p_user,p_id,p_actor,p_command,p_payload,result);RETURN result;
END$$;
CREATE FUNCTION housing_tick(p_user uuid,p_now timestamptz,p_blocked jsonb DEFAULT '[]') RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p housing_proposals;m text;oldhome text;h housing_households;eid uuid;cid uuid;summary text;count_done integer:=0;BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('housing:'||p_user::text,0));
 UPDATE housing_memberships SET ended_at=expires_at WHERE user_id=p_user AND kind='temporary' AND ended_at IS NULL AND expires_at<=p_now;
 FOR p IN SELECT * FROM housing_proposals WHERE user_id=p_user AND status='accepted' AND starts_at<=p_now ORDER BY starts_at,id LIMIT 8 FOR UPDATE LOOP
  IF EXISTS(SELECT 1 FROM unnest(p.movers) x WHERE p_blocked ? x) THEN CONTINUE;END IF;
  IF EXISTS(SELECT 1 FROM unnest(p.movers) x WHERE coalesce(housing_primary(p_user,x),'') IS DISTINCT FROM p.from_homes->>x) OR EXISTS(SELECT 1 FROM housing_memberships WHERE user_id=p_user AND residence_id=p.residence_id AND ended_at IS NULL AND NOT person_key=ANY(p.required)) THEN
   UPDATE housing_proposals SET status='needs_review',version=version+1 WHERE user_id=p_user AND id=p.id;UPDATE social_plans SET status='proposed',version=version+1 WHERE user_id=p_user AND id=p.plan_id;CONTINUE;
  END IF;
  IF EXISTS(SELECT 1 FROM social_plans other WHERE other.user_id=p_user AND other.id<>p.plan_id AND other.status IN('accepted','in_progress','active') AND other.starts_at<p.starts_at+interval '2 hours' AND other.ends_at>p.starts_at AND (other.origin='conversation' AND ('user'=ANY(p.movers) AND other.user_response='accepted' AND other.character_response='accepted' OR other.organizer=ANY(p.movers) AND other.character_response='accepted') OR other.origin='housing' AND EXISTS(SELECT 1 FROM housing_proposals hp WHERE hp.user_id=p_user AND hp.plan_id=other.id AND hp.movers&&p.movers))) THEN UPDATE housing_proposals SET status='needs_review',version=version+1 WHERE user_id=p_user AND id=p.id;UPDATE social_plans SET status='proposed',version=version+1 WHERE user_id=p_user AND id=p.plan_id;CONTINUE;END IF;
  SELECT * INTO h FROM housing_households WHERE user_id=p_user AND residence_id=p.residence_id FOR UPDATE;
  IF h.consent_review_required OR cardinality(p.required)>1 AND EXISTS(SELECT 1 FROM unnest(p.required) x WHERE NOT housing_adult_known(p_user,x)) OR EXISTS(SELECT 1 FROM unnest(p.required) x WHERE p.responses->>x IS DISTINCT FROM 'accepted') THEN CONTINUE;END IF;
  FOREACH m IN ARRAY p.movers LOOP
   oldhome:=housing_primary(p_user,m);
   IF p.kind='temporary' THEN UPDATE housing_memberships SET ended_at=p_now WHERE user_id=p_user AND person_key=m AND kind='temporary' AND ended_at IS NULL;END IF;
   IF p.kind='move' THEN UPDATE housing_memberships SET ended_at=p_now WHERE user_id=p_user AND person_key=m AND kind='primary' AND ended_at IS NULL;END IF;
   INSERT INTO housing_memberships VALUES(p_user,md5(p.id::text||':'||m)::uuid,m,h.id,h.residence_id,CASE WHEN p.kind='temporary' THEN 'temporary' ELSE 'primary' END,p.purpose,p_now,NULL,CASE WHEN p.kind='temporary' THEN p.ends_at END) ON CONFLICT DO NOTHING;
   -- Pets remain associated with their established owner; no automatic romance or dependencies.
   IF p.kind='move' THEN UPDATE housing_households target SET pets=target.pets||coalesce((SELECT jsonb_agg(pet) FROM housing_households old CROSS JOIN LATERAL jsonb_array_elements(old.pets) pet WHERE old.user_id=p_user AND old.id<>h.id AND pet->>'owner'=m),'[]') WHERE target.user_id=p_user AND target.id=h.id;END IF;
   IF p.kind='move' THEN UPDATE housing_households old SET pets=coalesce((SELECT jsonb_agg(pet) FROM jsonb_array_elements(old.pets) pet WHERE pet->>'owner' IS DISTINCT FROM m),'[]') WHERE old.user_id=p_user AND old.id<>h.id;END IF;
   INSERT INTO housing_events VALUES(p_user,md5(p.id::text||':'||m||':moved')::uuid,m,p.residence_id,'move_completed',jsonb_build_object('proposal',p.id,'from',oldhome,'to',h.residence_id,'physicalPlayerTravelInferred',false),p_now) ON CONFLICT DO NOTHING;
   summary:=CASE WHEN p.kind='temporary' THEN 'Temporary stay began (primary home unchanged), ending '||p.ends_at::text||': ' ELSE 'Housing move completed: ' END||(SELECT label FROM housing_residences WHERE user_id=p_user AND id=p.residence_id)||'. Arrangement: '||p.purpose||'. No romantic commitment or physical player travel is inferred.';
   SELECT c.id INTO cid FROM conversations c JOIN characters ch ON ch.id=c.character_id WHERE c.user_id=p_user AND ch.key=m;
   IF cid IS NOT NULL THEN INSERT INTO memories(id,user_id,conversation_id,memory_type,summary,importance) VALUES(md5(p.id::text||':'||m||':housing-memory')::uuid,p_user,cid,'personal',summary,4) ON CONFLICT DO NOTHING;END IF;
   INSERT INTO character_knowledge(user_id,character_key,subject_type,subject_id,knowledge_type,summary,source,acquired_at) VALUES(p_user,m,'housing',p.id::text,'completed',summary,'consented housing event',p_now) ON CONFLICT DO NOTHING;
  END LOOP;
  -- Vacated homes stay historical locations, but old invitations cannot grant entry forever.
  UPDATE housing_access a SET expires_at=p_now WHERE a.user_id=p_user AND a.permission='visit' AND NOT EXISTS(SELECT 1 FROM housing_memberships hm WHERE hm.user_id=p_user AND hm.residence_id=a.residence_id AND hm.ended_at IS NULL AND (hm.expires_at IS NULL OR hm.expires_at>p_now));
  UPDATE housing_residences SET provisional=false WHERE user_id=p_user AND id=p.residence_id;
  UPDATE housing_proposals SET status='completed',version=version+1 WHERE user_id=p_user AND id=p.id;
  UPDATE social_plans SET status='completed',version=version+1 WHERE user_id=p_user AND id=p.plan_id;
  INSERT INTO shared_events(user_id,id,title,kind,location,occurs_at,facts,source) VALUES(p_user,'housing:'||p.id,'Consented housing change','housing',(SELECT place_key FROM housing_residences WHERE user_id=p_user AND id=p.residence_id),p_now,jsonb_build_object('proposal',p.id,'participants',p.movers),'housing') ON CONFLICT DO NOTHING;
  count_done:=count_done+1;
 END LOOP;RETURN count_done;
END$$;
CREATE FUNCTION housing_plan_links() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE r housing_residences;BEGIN
 SELECT * INTO r FROM housing_residences WHERE user_id=NEW.user_id AND place_key=NEW.place_key;
 IF r.id IS NULL OR NEW.origin<>'conversation' THEN RETURN NEW;END IF;
 IF housing_resident(NEW.user_id,NEW.place_key,NEW.organizer,now()) AND NEW.proposer=NEW.organizer AND NEW.status NOT IN('cancelled','declined','completed','missed') THEN
  INSERT INTO housing_access VALUES(NEW.user_id,r.id,'user','visit',NEW.id,'plan:'||NEW.id,now(),NEW.ends_at+interval '4 hours') ON CONFLICT(user_id,residence_id,viewer,permission,source) DO UPDATE SET expires_at=excluded.expires_at;
 END IF;
 IF NEW.status IN('accepted','in_progress') AND NEW.user_response='accepted' AND NEW.character_response='accepted' THEN
  INSERT INTO housing_access VALUES(NEW.user_id,r.id,NEW.organizer,'visit',NEW.id,'plan:'||NEW.id,now(),NEW.ends_at+interval '4 hours') ON CONFLICT(user_id,residence_id,viewer,permission,source) DO UPDATE SET expires_at=excluded.expires_at;
  INSERT INTO housing_access VALUES(NEW.user_id,r.id,'user','visit',NEW.id,'plan:'||NEW.id,now(),NEW.ends_at+interval '4 hours') ON CONFLICT(user_id,residence_id,viewer,permission,source) DO UPDATE SET expires_at=excluded.expires_at;
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER residential_plan_access AFTER INSERT OR UPDATE ON social_plans FOR EACH ROW EXECUTE FUNCTION housing_plan_links();
-- Extend the single canonical validator; public calendar auto-sweeps remain off.
DO $extend$ DECLARE d text;n text;BEGIN
 SELECT pg_get_functiondef('calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz)'::regprocedure) INTO d;
 n:=$old$IF p_kind<>'manual' THEN RETURN jsonb_build_object('unchanged',true,'reason','calendar_requires_explicit_user_action'); END IF;
 IF p_ordinal<>0 THEN RAISE EXCEPTION 'invalid manual source';END IF;$old$;
 IF position(n IN d)=0 THEN RAISE EXCEPTION 'Housing: unknown manual calendar source contract';END IF;
 d:=replace(d,n,$new$IF p_kind<>'manual' AND NOT EXISTS(SELECT 1 FROM housing_residences r WHERE r.user_id=p_user AND r.place_key=coalesce(p_payload->>'place',(SELECT place_key FROM social_plans WHERE user_id=p_user AND id=nullif(p_payload->>'planId','')::uuid))) THEN RETURN jsonb_build_object('unchanged',true,'reason','calendar_requires_explicit_user_action');END IF;
 IF p_kind NOT IN('manual','message','experience') OR p_ordinal NOT BETWEEN 0 AND 3 OR p_kind='manual' AND p_ordinal<>0 THEN RAISE EXCEPTION 'invalid scheduling source';END IF;$new$);
 n:=$old$AND metadata->>'public'='true') THEN RAISE EXCEPTION 'registered public venue required'; END IF;$old$;
 IF position(n IN d)=0 THEN RAISE EXCEPTION 'Housing: unknown calendar venue contract';END IF;
 d:=replace(d,n,$new$AND (metadata->>'public'='true' OR (speaker<>'user' AND housing_resident(p_user,p_payload->>'place',who,clock)) OR housing_plan_venue_allowed(p_user,p_payload->>'place',who,clock))) THEN RAISE EXCEPTION 'registered public venue or authorized residence required'; END IF;$new$);
 d:=replace(d,$old$IF a='cancel' THEN p.status:='cancelled';$old$,$new$IF start_at IS NOT NULL AND EXISTS(SELECT 1 FROM housing_proposals hp WHERE hp.user_id=p_user AND hp.status='accepted' AND hp.plan_id IS DISTINCT FROM p.id AND ('user'=ANY(hp.movers) OR who=ANY(hp.movers)) AND hp.starts_at<end_at+interval '30 minutes' AND hp.starts_at+interval '2 hours'>start_at-interval '30 minutes') THEN v_conflicts:=v_conflicts||'"housing_move_overlap"'::jsonb;END IF;
    IF a='cancel' THEN p.status:='cancelled';$new$);
 EXECUTE d;
 SELECT pg_get_functiondef('shared_world_command(uuid,uuid,text,jsonb,timestamptz,integer)'::regprocedure) INTO d;
 IF position($old$p.origin='conversation'$old$ IN d)=0 THEN RAISE EXCEPTION 'Housing: unknown shared calendar routing guard';END IF;
 d:=replace(d,$old$p.origin='conversation'$old$,$new$p.origin IN('conversation','housing')$new$);EXECUTE d;
 -- Travel uses the existing virtual travel transaction, with residential permissions.
 SELECT pg_get_functiondef('town_command(uuid,uuid,text,jsonb,timestamptz)'::regprocedure) INTO d;
 n:=$old$IF dest<>'home:user' AND NOT EXISTS(SELECT 1 FROM world_places WHERE user_id=p_user AND key=dest AND metadata->>'public'='true') THEN RAISE EXCEPTION 'unknown public place'; END IF;$old$;
 IF position(n IN d)=0 THEN RAISE EXCEPTION 'Housing: unknown virtual travel contract';END IF;
 d:=replace(d,n,$new$IF NOT EXISTS(SELECT 1 FROM world_places WHERE user_id=p_user AND key=dest AND metadata->>'public'='true') AND NOT housing_can_enter(p_user,dest,'user',p_now) THEN RAISE EXCEPTION 'invitation required for private residence';END IF;$new$);EXECUTE d;
 SELECT pg_get_functiondef('town_command(uuid,uuid,text,jsonb,timestamptz)'::regprocedure) INTO d;
 n:=$old$p_payload->>'reply',p_now+interval '1 millisecond');$old$;
 IF position(n IN d)=0 THEN RAISE EXCEPTION 'Housing: unknown NPC delivery contract';END IF;
 d:=replace(d,n,$new$p_payload->>'reply',p_now+interval '1 millisecond');
  IF jsonb_typeof(p_payload->'housingActions')='array' AND jsonb_array_length(p_payload->'housingActions') BETWEEN 1 AND 2 THEN INSERT INTO housing_action_outbox(user_id,source_kind,source_id,actions) VALUES(p_user,'town',md5(p_id::text||'assistant')::uuid,p_payload->'housingActions') ON CONFLICT DO NOTHING;END IF;$new$);EXECUTE d;
 SELECT pg_get_functiondef('venue_session(uuid,timestamptz)'::regprocedure) INTO d;
 d:=replace(d,$old$OR pos.place_key='home:user'$old$,'');EXECUTE d;
 SELECT pg_get_functiondef('venue_act(uuid,uuid,text,text,text,timestamptz,uuid,text,integer)'::regprocedure) INTO d;
 d:=replace(d,$old$IF pos.place_key IS DISTINCT FROM p_place OR pos.arrives_at>p_now THEN$old$,$new$IF EXISTS(SELECT 1 FROM housing_residences WHERE user_id=p_user AND place_key=p_place) AND NOT housing_can_enter(p_user,p_place,'user',p_now) THEN RAISE EXCEPTION 'invitation required for private residence';END IF;
 IF pos.place_key IS DISTINCT FROM p_place OR pos.arrives_at>p_now THEN$new$);
 d:=replace(d,$old$make_time((SELECT (metadata->>'closes')::int FROM world_places WHERE user_id=p_user AND key=p_place),0,0)$old$,$new$(time '00:00'+make_interval(hours=>(SELECT (metadata->>'closes')::int FROM world_places WHERE user_id=p_user AND key=p_place)))$new$);
 -- Private homes have no business closing hour. Keep public-venue hours unchanged.
 d:=replace(d,$old$IF ((p_now AT TIME ZONE 'America/New_York')::time)<$old$,$new$IF NOT EXISTS(SELECT 1 FROM housing_residences WHERE user_id=p_user AND place_key=p_place) AND (((p_now AT TIME ZONE 'America/New_York')::time)<$new$);
 d:=replace(d,$old$THEN RAISE EXCEPTION 'The fictional venue is closed';END IF;$old$,$new$) THEN RAISE EXCEPTION 'The fictional venue is closed';END IF;$new$);
 d:=replace(d,$old$('join','discuss','walk','browse')$old$,$new$('join','discuss','walk','browse','cook','movie','games','chores','relax')$new$);
 d:=replace(d,$old$jsonb_build_object('place','home:user','minutes',15)$old$,$new$jsonb_build_object('place',coalesce(housing_primary(p_user,'user'),'home:user'),'minutes',calendar_travel_buffer(p_user,p_place,housing_primary(p_user,'user')))$new$);
 EXECUTE d;
 -- Live scenes can resolve an authorized private destination without treating it as a business.
 SELECT pg_get_functiondef('experience_scene_apply(uuid,uuid,uuid,integer,jsonb,text)'::regprocedure) INTO d;
 IF position($old$metadata->>'public'='true'$old$ IN d)=0 THEN RAISE EXCEPTION 'Housing: unknown scene validation contract';END IF;
 d:=replace(d,$old$metadata->>'public'='true'$old$,$new$(metadata->>'public'='true' OR housing_plan_venue_allowed(p_user,world_places.key,ch.key,m.created_at) OR housing_resident(p_user,world_places.key,ch.key,m.created_at))$new$);
 d:=replace(d,$old$loc:=p_scene->>'locationKey';$old$,$new$loc:=p_scene->>'locationKey';
  IF EXISTS(SELECT 1 FROM housing_residences WHERE user_id=p_user AND place_key=loc) AND coalesce(p_scene->>'area','') !~* '(outside|front door|porch|doorstep)' AND NOT housing_can_enter(p_user,loc,'user',m.created_at) AND NOT(p.place_key=loc AND e.state IN('interactive','paused') AND p.user_response='accepted' AND p.character_response='accepted') THEN RAISE EXCEPTION 'home entry requires an invitation';END IF;$new$);
 d:=replace(d,$old$venue.label$old$,$new$coalesce((SELECT label FROM housing_residences WHERE user_id=p_user AND place_key=venue.key),venue.label)$new$);
 d:=replace(d,$old$('talking','walking','driving','arriving','ordering','dining','finished_meal','at_front_door','waiting')$old$,$new$('talking','walking','driving','arriving','ordering','dining','finished_meal','at_front_door','waiting','cooking','watching_movie','playing_game','household_chore','relaxing')$new$);EXECUTE d;
END $extend$;
CREATE OR REPLACE FUNCTION calendar_travel_buffer(p_user uuid,p_from text,p_to text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH coords AS(SELECT coalesce(ra.latitude,(a.metadata->>'latitude')::double precision) lat1,coalesce(ra.longitude,(a.metadata->>'longitude')::double precision) lon1,coalesce(rb.latitude,(b.metadata->>'latitude')::double precision) lat2,coalesce(rb.longitude,(b.metadata->>'longitude')::double precision) lon2 FROM world_places a JOIN world_places b ON b.user_id=a.user_id LEFT JOIN housing_residences ra ON ra.user_id=a.user_id AND ra.place_key=a.key LEFT JOIN housing_residences rb ON rb.user_id=b.user_id AND rb.place_key=b.key WHERE a.user_id=p_user AND a.key=p_from AND b.key=p_to)
 SELECT CASE WHEN p_from=p_to AND p_from IS NOT NULL THEN 0 ELSE coalesce((SELECT greatest(5,least(120,ceil(6371*2*asin(least(1,sqrt(power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2))))/35*60+5)::integer)) FROM coords),30) END;
$$;
-- Original home keys remain historical locations after a move; temporary stays
-- change current accommodation without replacing the one primary residence.
CREATE FUNCTION housing_current_home(p_user uuid,p_person text,p_now timestamptz) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT coalesce((SELECT r.place_key FROM housing_memberships m JOIN housing_residences r ON r.user_id=m.user_id AND r.id=m.residence_id WHERE m.user_id=p_user AND m.person_key=p_person AND m.kind='temporary' AND m.ended_at IS NULL AND m.started_at<=p_now AND m.expires_at>p_now ORDER BY m.started_at DESC LIMIT 1),housing_primary(p_user,p_person))$$;
-- Queue only durable source records. Future-visible messages are never acted upon early.
CREATE FUNCTION housing_queue_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF auth.role()='service_role' AND NEW.sender='tess' AND jsonb_typeof(NEW.metadata->'housing_actions')='array' AND jsonb_array_length(NEW.metadata->'housing_actions') BETWEEN 1 AND 2 THEN
  INSERT INTO housing_action_outbox(user_id,source_kind,source_id,actions) VALUES(NEW.user_id,'message',NEW.id,NEW.metadata->'housing_actions') ON CONFLICT DO NOTHING;
 END IF;RETURN NEW;END$$;
CREATE TRIGGER housing_visible_message AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION housing_queue_message();
DO $queue$ DECLARE d text;n text;BEGIN
 SELECT pg_get_functiondef('experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure) INTO d;
 n:=$old$IF op.kind='turn' AND jsonb_array_length(coalesce(p_payload->'scheduleActions','[]'))>0 THEN$old$;
 IF position(n IN d)=0 THEN RAISE EXCEPTION 'Housing: unknown experience commit contract';END IF;
 d:=replace(d,n,$new$IF op.kind='turn' AND jsonb_typeof(p_payload->'housingActions')='array' AND jsonb_array_length(p_payload->'housingActions') BETWEEN 1 AND 2 THEN
    INSERT INTO housing_action_outbox(user_id,source_kind,source_id,actions) VALUES(p_user,'experience',p_id,p_payload->'housingActions') ON CONFLICT DO NOTHING;
  END IF;
  IF op.kind='turn' AND jsonb_array_length(coalesce(p_payload->'scheduleActions','[]'))>0 THEN$new$);EXECUTE d;
END$queue$;
CREATE FUNCTION housing_process_actions(p_user uuid,p_now timestamptz) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job housing_action_outbox;a jsonb;body text;actor text;payload jsonb;command text;i integer;n integer:=0;BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||p_user::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('housing:'||p_user::text,0));
 FOR job IN SELECT * FROM housing_action_outbox WHERE user_id=p_user AND NOT processed AND (source_kind='experience' OR source_kind='town' AND EXISTS(SELECT 1 FROM town_messages tm WHERE tm.user_id=p_user AND tm.id=source_id AND tm.created_at<=p_now) OR EXISTS(SELECT 1 FROM messages m WHERE m.user_id=p_user AND m.id=source_id AND m.visible_at<=p_now)) ORDER BY created_at,source_id LIMIT 8 FOR UPDATE SKIP LOCKED LOOP
  body:=NULL;actor:=NULL;
  IF job.source_kind='message' THEN
   SELECT m.body,ch.key INTO body,actor FROM messages m JOIN conversations c ON c.user_id=m.user_id AND c.id=m.conversation_id JOIN characters ch ON ch.id=c.character_id WHERE m.user_id=p_user AND m.id=job.source_id AND m.sender='tess' AND m.visible_at<=p_now;
  ELSIF job.source_kind='town' THEN
   SELECT m.text,m.npc_key INTO body,actor FROM town_messages m WHERE m.user_id=p_user AND m.id=job.source_id AND m.role='assistant' AND m.created_at<=p_now;
  ELSIF job.source_kind='experience' THEN
   SELECT m.body,ch.key INTO body,actor FROM living_experience_moments m JOIN living_experiences e ON e.user_id=m.user_id AND e.id=m.experience_id JOIN conversations c ON c.user_id=e.user_id AND c.id=e.conversation_id JOIN characters ch ON ch.id=c.character_id WHERE m.user_id=p_user AND m.id=job.source_id AND m.source='character';
  END IF;
  IF body IS NULL OR actor IS NULL THEN CONTINUE;END IF;
  BEGIN
   i:=0;
   FOR a IN SELECT value FROM jsonb_array_elements(job.actions) LOOP
    IF length(coalesce(a->>'quote',''))<8 OR position(a->>'quote' IN body)=0 THEN RAISE EXCEPTION 'actual character words required';END IF;
    command:=a->>'action';IF command NOT IN('goal','new_home','propose_move','respond','disclose') THEN RAISE EXCEPTION 'unsupported housing action';END IF;
    IF command='respond' AND coalesce((a->>'accept')::boolean,false) AND (a->>'quote' !~* '(yes|agree|accept|love to|like to|want to|let.s|sounds (good|right)|works for me|ready to)' OR a->>'quote' ~* '(not ready|don.t want|do not want|rather not|maybe|might|unsure)') THEN RAISE EXCEPTION 'explicit character housing consent required';END IF;
    IF command IN('new_home','propose_move') AND a->>'quote' !~* '(mov(e|ing)|roommate|shar(e|ing)|liv(e|ing)|stay|rent|buy)' THEN RAISE EXCEPTION 'explicit housing proposal required';END IF;
    IF command='disclose' AND (a->>'quote' !~* '(come over|welcome|invit(e|ing)|visit|my (place|home|house)|address)' OR a->>'quote' ~* '(don.t|do not|cannot|can.t|not welcome)') THEN RAISE EXCEPTION 'explicit home disclosure required';END IF;
    payload:=jsonb_strip_nulls(a-'action'-'quote')||jsonb_build_object('source',job.source_id);
    PERFORM housing_command(p_user,md5(job.source_kind||':'||job.source_id||':housing:'||i)::uuid,actor,command,payload,p_now);i:=i+1;
   END LOOP;
   UPDATE housing_action_outbox SET processed=true,failure=NULL WHERE user_id=p_user AND source_kind=job.source_kind AND source_id=job.source_id;n:=n+1;
  EXCEPTION WHEN OTHERS THEN
   -- Invalid choices never break paid message delivery or unrelated world progression.
   UPDATE housing_action_outbox SET processed=true,failure='housing_action_validation_failed' WHERE user_id=p_user AND source_kind=job.source_kind AND source_id=job.source_id;
  END;
 END LOOP;RETURN n;
END$$;
CREATE FUNCTION housing_diagnostics(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required';END IF;
 RETURN jsonb_build_object('available',true,'homes',(SELECT count(*) FROM housing_residences WHERE user_id=p_user),'proposals',(SELECT coalesce(jsonb_agg(x),'[]') FROM(SELECT id,status,version,plan_id,responses FROM housing_proposals WHERE user_id=p_user ORDER BY created_at DESC LIMIT 30)x),'failures',(SELECT coalesce(jsonb_agg(x),'[]') FROM(SELECT source_id,failure,processed FROM housing_action_outbox WHERE user_id=p_user AND failure IS NOT NULL ORDER BY created_at DESC LIMIT 20)x));
END$$;
-- Every new privileged helper is service-only, including default-ACL environments.
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'housing_%' OR p.proname IN('calendar_event_action','calendar_travel_buffer','town_command','venue_session','experience_scene_apply','experience_command','venue_act','shared_world_command')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
END LOOP;END$$;
