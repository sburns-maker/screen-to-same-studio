ALTER TABLE public.conversations ADD COLUMN photo_frequency text NOT NULL DEFAULT 'normal';

CREATE TABLE public.generated_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  photo_type text NOT NULL,
  scene text NOT NULL,
  includes_tess boolean NOT NULL DEFAULT false,
  is_selfie boolean NOT NULL DEFAULT false,
  relationship_stage text,
  state_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL,
  model text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_images TO authenticated;
GRANT ALL ON public.generated_images TO service_role;
ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gen select" ON public.generated_images FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own gen insert" ON public.generated_images FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own gen update" ON public.generated_images FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own gen delete" ON public.generated_images FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "tess photos own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tess-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "tess photos own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tess-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "tess photos own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tess-photos' AND (storage.foldername(name))[1] = auth.uid()::text);