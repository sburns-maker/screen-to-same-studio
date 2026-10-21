# Roadmap

## Done
- [x] Signed-in photo test: curated mabel-sock chosen by Tess, persists on reload + History; sleep boundary at 2 AM works; Frequent setting works.
- [x] Canon: legal name Jessica Morgan, everyday Tess; toddler "Jess"→"Tess" origin in character bible; Theresa/Tessa/Contessa forbidden; natural-reveal-only rule; shared memory once user knows; proportional reactions to "Jessica".
- [x] Profile still displays "Tess Morgan" (verified, no Jessica spoiler).
- [x] Photo identity-vs-pose: reference defines identity only; new prompt wording; "same woman, different real photos".
- [x] Structured style fields on generate requests: pose_type, camera_angle, crop_type, hairstyle, expression, clothing_category, setting, selfie_type (selfie/mirror/propped/friend, no invisible photographer).
- [x] Repetition avoidance: last 5 Tess photos' styles fed to the model + varyStyle nudge on exact repeats (context first).
- [x] generated_images extended with 9 style/identity columns (migration 0002).
- [x] Mabel canonical reference: mabel-sock.jpg uploaded to tess-reference/mabel.jpg; used as second reference image when scene includes Mabel.
- [x] Tess timezone → America/New_York (TESS_TZ); her availability/life context runs on Eastern, matching ZIP 16602.
- [x] Tests: 35 passing (canon, image prompt, style variety, eligibility unchanged).

## Open
- [ ] Generated photo landing in a live signed-in chat (blocked earlier by in-character 2 AM sleep boundary; pipeline verified standalone). Try again during her daytime hours.
