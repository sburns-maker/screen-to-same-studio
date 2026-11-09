-- Carly Reed and Brooke Halloway (After Dark). Additive: existing characters,
-- conversations, memories, photos and storylines are untouched.
INSERT INTO public.characters (key,preferred_name,full_name,age,pronouns,avatar_key,zip,sort_order)
VALUES ('carly','Carly','Carly Reed',28,'she/her','carly','16602',9),
       ('brooke','Brooke','Brooke Halloway',26,'she/her','brooke','16602',10)
ON CONFLICT (key) DO UPDATE SET preferred_name=EXCLUDED.preferred_name,
  full_name=EXCLUDED.full_name,age=EXCLUDED.age,pronouns=EXCLUDED.pronouns,
  avatar_key=EXCLUDED.avatar_key;

ALTER TABLE public.character_voices DROP CONSTRAINT IF EXISTS character_voices_character_key_check;
ALTER TABLE public.character_voices ADD CONSTRAINT character_voices_character_key_check
 CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna','kendra','jade','carly','brooke'));
ALTER TABLE public.photo_reference_state DROP CONSTRAINT IF EXISTS photo_reference_state_character_key_check;
ALTER TABLE public.photo_reference_state ADD CONSTRAINT photo_reference_state_character_key_check
 CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna','kendra','jade','carly','brooke'));
ALTER TABLE public.spicy_photo_jobs DROP CONSTRAINT IF EXISTS spicy_photo_jobs_character_key_check;
ALTER TABLE public.spicy_photo_jobs ADD CONSTRAINT spicy_photo_jobs_character_key_check
 CHECK (character_key IN ('tess','maya','riley','claire','jordan','sienna','kendra','jade','carly','brooke'));

-- Extend installed inline cast guards (same pattern as 0066). Idempotent.
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
  IF position('''carly''' IN definition) > 0 THEN CONTINUE; END IF;
  updated := replace(definition, '''kendra'',''jade''', '''kendra'',''jade'',''carly'',''brooke''');
  IF updated = definition THEN RAISE EXCEPTION 'Expected cast guard absent: %',signature; END IF;
  EXECUTE updated;
 END LOOP;
END $migration$;

-- Durable, per-user Carly -> Brooke introduction state.
CREATE TABLE IF NOT EXISTS public.after_dark_introductions (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'not_mentioned'
    CHECK (status IN ('not_mentioned','text_offered','contact_accepted','declined','met')),
  brooke_consented boolean NOT NULL DEFAULT false,
  offer_message_id uuid,
  offered_at timestamptz,
  responded_at timestamptz,
  met_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('contact_accepted','met') OR brooke_consented)
);
GRANT SELECT ON public.after_dark_introductions TO authenticated;
GRANT ALL ON public.after_dark_introductions TO service_role;
ALTER TABLE public.after_dark_introductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read their introduction" ON public.after_dark_introductions;
CREATE POLICY "Owners read their introduction" ON public.after_dark_introductions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
