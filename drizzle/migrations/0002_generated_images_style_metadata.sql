ALTER TABLE public.generated_images
  ADD COLUMN pose_type text,
  ADD COLUMN camera_angle text,
  ADD COLUMN crop_type text,
  ADD COLUMN hairstyle text,
  ADD COLUMN expression text,
  ADD COLUMN clothing_category text,
  ADD COLUMN setting text,
  ADD COLUMN selfie_type text,
  ADD COLUMN identity_reference_used text;