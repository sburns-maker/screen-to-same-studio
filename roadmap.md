# Roadmap

## In progress
- [ ] Signed-in photo test: curated photo verified (mabel-sock, persists on reload/history); generated-photo run interrupted — resume/verify generated photo + persistence.

## Queued (character + photo consistency pass)
- [ ] Canon: legal name Jessica Morgan, everyday name Tess; nickname origin story (toddler couldn't say "Jess"); add to character bible + personal memory; never invent Theresa/Tessa/etc.
- [ ] Natural reveal only; once user learns it, save shared relationship memory; context-dependent reactions to being called "Jessica".
- [ ] Profile keeps displaying "Tess Morgan" (no Jessica spoiler).
- [ ] Photo identity vs pose: reference defines identity only, not pose/composition; update server-side prompt builder with the new identity wording.
- [ ] Pose/expression/camera/hairstyle/clothing/makeup variety; structured photo request gains pose_type, camera_angle, crop_type, hairstyle, expression, clothing_category, setting, selfie_type.
- [ ] Repetition avoidance: track last 5 Tess-containing generated photos' attributes; discourage repeating combos (context first, variety second).
- [ ] Extend generated_images metadata (additive columns) for the new attributes + identity_reference_used.
- [ ] Mabel: designate canonical Mabel reference from curated photos; use for future generated images containing Mabel.
- [ ] Preserve all photo eligibility rules, existing photos, and all working systems.
- [ ] Tess timezone -> America/New_York (matches ZIP 16602 weather anchor).
- [ ] Tests: name canon, pose metadata variance, repetition discouragement, eligibility unchanged, Mabel reference.
