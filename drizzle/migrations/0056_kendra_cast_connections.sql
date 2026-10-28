-- Idempotent: extend installed cast guards for Kendra; preserve ownership, grants and data.
ALTER TABLE public.character_voices DROP CONSTRAINT character_voices_character_key_check;
ALTER TABLE public.character_voices ADD CONSTRAINT character_voices_character_key_check CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna','kendra'));
ALTER TABLE public.photo_reference_state DROP CONSTRAINT photo_reference_state_character_key_check;
ALTER TABLE public.photo_reference_state ADD CONSTRAINT photo_reference_state_character_key_check CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna','kendra'));
ALTER TABLE public.spicy_photo_jobs DROP CONSTRAINT spicy_photo_jobs_character_key_check;
ALTER TABLE public.spicy_photo_jobs ADD CONSTRAINT spicy_photo_jobs_character_key_check CHECK (character_key IN ('tess','maya','riley','claire','jordan','sienna','kendra'));
DO $migration$
DECLARE signature text; definition text; updated text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'public.experience_seed(uuid,timestamptz)','public.protect_living_plan()','public.venue_reconcile_departures(uuid,timestamptz)',
 'public.relationship_player_command(uuid,uuid,text,text,text,uuid)','public.relationship_sync_character(uuid,text)',
 'public.set_profile_media(uuid,text,text,text,text,uuid)','public.phone_command(uuid,uuid,text,jsonb,timestamptz)',
 'public.spicy_photo_preferences(uuid,text,boolean,boolean,integer)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
  IF position('''kendra''' IN definition) > 0 THEN CONTINUE; END IF;
  updated := replace(definition, '''sienna''', '''sienna'',''kendra''');
  IF updated = definition THEN RAISE EXCEPTION 'Expected cast guard absent: %',signature; END IF;
  EXECUTE updated;
 END LOOP;
END $migration$;