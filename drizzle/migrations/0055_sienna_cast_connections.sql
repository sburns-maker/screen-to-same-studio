-- Extend only installed cast guards; preserve function ownership, grants and all historical data.
ALTER TABLE public.character_voices DROP CONSTRAINT character_voices_character_key_check;
ALTER TABLE public.character_voices ADD CONSTRAINT character_voices_character_key_check CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna'));
ALTER TABLE public.photo_reference_state DROP CONSTRAINT photo_reference_state_character_key_check;
ALTER TABLE public.photo_reference_state ADD CONSTRAINT photo_reference_state_character_key_check CHECK (character_key IN ('tess','maya','claire','jordan','ben','riley','sienna'));
ALTER TABLE public.spicy_photo_jobs DROP CONSTRAINT spicy_photo_jobs_character_key_check;
ALTER TABLE public.spicy_photo_jobs ADD CONSTRAINT spicy_photo_jobs_character_key_check CHECK (character_key IN ('tess','maya','riley','claire','jordan','sienna'));
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
  updated := replace(definition, '''tess'',''maya'',''claire'',''jordan'',''ben'',''riley''', '''tess'',''maya'',''claire'',''jordan'',''ben'',''riley'',''sienna''');
  updated := replace(updated, '''tess'',''maya'',''riley'',''claire'',''jordan''', '''tess'',''maya'',''riley'',''claire'',''jordan'',''sienna''');
  IF updated = definition THEN
   updated := replace(definition, '''tess'',''maya'',''claire'',''jordan'',''ben''', '''tess'',''maya'',''claire'',''jordan'',''ben'',''sienna''');
  END IF;
  IF updated = definition THEN RAISE EXCEPTION 'Expected cast guard absent: %',signature; END IF;
  EXECUTE updated;
 END LOOP;
 -- Current calendar_advance handles every owned conversation plan generically; no cast expansion is needed.
 SELECT pg_get_functiondef('public.calendar_advance(uuid,timestamptz,jsonb)'::regprocedure) INTO definition;
 IF position('origin=''conversation''' IN definition)=0 OR position('p_blocked ? p.organizer' IN definition)=0 THEN
  RAISE EXCEPTION 'Unexpected installed calendar presence contract';
 END IF;
END $migration$;