-- DRAFT / activation dependency: Nina's approved photos and all runtime registries
-- must be committed before applying this additive migration to production.
-- Never retroactively copy Kendra's messages, memories or romantic state to Nina.
INSERT INTO public.characters(key,preferred_name,full_name,age,pronouns,avatar_key,zip,sort_order)
VALUES ('nina','Nina','Nina',27,'she/her','nina','16602',11)
ON CONFLICT(key) DO UPDATE SET preferred_name=EXCLUDED.preferred_name,
 full_name=EXCLUDED.full_name,age=EXCLUDED.age,pronouns=EXCLUDED.pronouns,avatar_key=EXCLUDED.avatar_key;

ALTER TABLE public.character_voices DROP CONSTRAINT IF EXISTS character_voices_character_key_check;
ALTER TABLE public.character_voices ADD CONSTRAINT character_voices_character_key_check
 CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna','kendra','jade','carly','brooke','nina'));
ALTER TABLE public.photo_reference_state DROP CONSTRAINT IF EXISTS photo_reference_state_character_key_check;
ALTER TABLE public.photo_reference_state ADD CONSTRAINT photo_reference_state_character_key_check
 CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna','kendra','jade','carly','brooke','nina'));
ALTER TABLE public.spicy_photo_jobs DROP CONSTRAINT IF EXISTS spicy_photo_jobs_character_key_check;
ALTER TABLE public.spicy_photo_jobs ADD CONSTRAINT spicy_photo_jobs_character_key_check
 CHECK (character_key IN ('tess','maya','riley','claire','jordan','sienna','kendra','jade','carly','brooke','nina'));

-- Installed stored functions may contain hardcoded character allowlists.
-- Fail explicitly rather than silently leaving Nina without complete operation.
DO $migration$
DECLARE signature text; definition text; updated text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'public.experience_seed(uuid,timestamptz)',
 'public.protect_living_plan()',
 'public.venue_reconcile_departures(uuid,timestamptz)',
 'public.relationship_player_command(uuid,uuid,text,text,text,uuid)',
 'public.relationship_sync_character(uuid,text)',
 'public.set_profile_media(uuid,text,text,text,text,uuid)',
 'public.phone_command(uuid,uuid,text,jsonb,timestamptz)',
 'public.spicy_photo_preferences(uuid,text,boolean,boolean,integer)'
 ] LOOP
   SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
   IF position('''nina''' IN definition)>0 THEN CONTINUE; END IF;
   updated := replace(definition, '''carly'',''brooke''',
                                     '''carly'',''brooke'',''nina''');
   IF updated=definition THEN
     RAISE EXCEPTION 'Expected Carly/Brooke cast allowlist absent: %', signature;
   END IF;
   EXECUTE updated;
 END LOOP;
END $migration$;

-- Introduction is a per-user, once-only event. A message or attached picture
-- must have been delivered through the real messaging/photo pipeline before
-- writing their IDs here. Never use an invented media URL or grant eligibility.
CREATE TABLE IF NOT EXISTS public.nina_introductions (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','delivered','declined')),
  opening_message_id uuid,
  opening_photo_id uuid,
  introduced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(status <> 'delivered' OR
    (opening_message_id IS NOT NULL AND opening_photo_id IS NOT NULL AND introduced_at IS NOT NULL))
);
ALTER TABLE public.nina_introductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner reads Nina introduction" ON public.nina_introductions;
CREATE POLICY "Owner reads Nina introduction" ON public.nina_introductions
  FOR SELECT TO authenticated USING(auth.uid() = user_id);
GRANT SELECT ON public.nina_introductions TO authenticated;
GRANT ALL ON public.nina_introductions TO service_role;
