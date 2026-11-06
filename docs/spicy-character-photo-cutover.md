# SpicyAPI character-photo migration and Lovable exit

## Scope
All **character** images (ordinary selfies, work photos, candid photos, romantic and suggestive photos) should use SpicyAPI's reference-conditioned edit generation. Object/scenery images are **out of scope**. Chat and character reasoning remain on their existing language-model provider.

## Implemented in this branch (gated, OFF by default)
- `SPICY_ALL_CHARACTER_PHOTOS=true` opts character photo categories into the existing durable SpicyAPI job queue; object photos remain on the old generator.
- Ordinary selfies receive everyday, non-sexualized prompts, not romantic prompts.
- Photo metadata preserves the original ordinary photo type rather than mislabeling it as `mature_romantic`.
- Ordinary jobs skip mature-photo relationship gating while the mature/suggestive categories retain their existing eligibility gates.
- Basic routing and prompt regression tests added.

## Required validation before enabling
1. Audit actual production SQL for `spicy_photo_reserve`, `spicy_photo_claim`, `spicy_photo_finish`, `spicy_photo_jobs` for hard-coded mature-photo categories, data-shape and eligibility constraints. Fix incompatible SQL through reviewed migrations; do not assume schema compatibility.
2. Verify approved reference and signed reference URL handling for every participating adult character, including Claire and non-romantic characters. No silent fallback to Lovable/OpenAI.
3. Confirm that the **ordinary photo quality screen** and text verification work independently after migration. Generation uses SpicyAPI; optional quality/vision checks are separate and must not secretly cause image-generation fallback.
4. Configure `SPICY_ENABLED`, verified account key, supported edit model, quote checks and daily/monthly/job spending budgets on the **new self-hosted server**. Never commit secrets, force a paid test, or disable spend caps to get a photo.
5. Exercise one normal work selfie, an off-duty selfie and a permitted romantic picture in **isolated staging**. Check photo ID, type, canonical likeness, scene fidelity, storage, delivery and single-charge behavior. Polling must not duplicate jobs, photos or captions.
6. Reconcile the **fresh** Lovable production database and all media (the 2026-10-26 export is outdated) with the existing isolated rehearsal environment. Preserve identities, conversations, world events, canonical reference assets and migration ledgers.
7. Only after successful end-to-end acceptance: move the app and scheduler off Lovable, gate the original paid-image provider off, and cut over with a tested rollback.

## Safety
This branch does not authorize a live database restore, application restart, DNS switchover, provider charge or scheduler activation. Preserve the user's dirty WSL working tree and the existing Qdrant service.

## Current known limitation
The implementation has not been run against the live SpicyAPI account or the user's local repo, and SQL compatibility is not yet confirmed. Keep the switch OFF until the above checks pass.
