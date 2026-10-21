CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  preferred_name text NOT NULL,
  full_name text NOT NULL,
  age integer NOT NULL,
  pronouns text NOT NULL DEFAULT 'she/her',
  avatar_key text,
  zip text NOT NULL DEFAULT '16602',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "characters readable by signed-in users" ON public.characters FOR SELECT TO authenticated USING (true);

INSERT INTO public.characters (key, preferred_name, full_name, age, pronouns, avatar_key, zip, sort_order) VALUES
  ('tess', 'Tess', 'Tess Morgan', 34, 'she/her', 'tess', '16602', 0),
  ('maya', 'Maya', 'Maya Reynolds', 31, 'she/her', 'maya', '16601', 1),
  ('claire', 'Claire', 'Claire Bennett', 35, 'she/her', 'claire', '16602', 2),
  ('jordan', 'Jordan', 'Jordan Hayes', 33, 'she/her', 'jordan', '16635', 3),
  ('ben', 'Ben', 'Ben Carter', 36, 'he/him', 'ben', '16602', 4);

ALTER TABLE public.conversations ADD COLUMN character_id uuid REFERENCES public.characters(id);
ALTER TABLE public.conversations ADD COLUMN last_read_at timestamptz;
UPDATE public.conversations SET character_id = (SELECT id FROM public.characters WHERE key = 'tess') WHERE character_id IS NULL;
ALTER TABLE public.conversations ALTER COLUMN character_id SET NOT NULL;
CREATE UNIQUE INDEX conversations_user_character_key ON public.conversations (user_id, character_id);

CREATE TABLE public.user_profile (
  user_id uuid NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profile TO authenticated;
GRANT ALL ON public.user_profile TO service_role;
ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile facts select" ON public.user_profile FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own profile facts insert" ON public.user_profile FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile facts update" ON public.user_profile FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile facts delete" ON public.user_profile FOR DELETE TO authenticated USING (auth.uid() = user_id);