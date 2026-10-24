# Riley Hart — Canonical Photo Identity (approved October 24, 2026)

The approved high-resolution generated source is delivered as `riley-hart-canonical.png` in the ChatGPT conversation. This GitHub PR cannot embed the binary source automatically from the conversation file; **the avatar is still a placeholder** until the supplied PNG is added to `src/assets/avatars/riley-canon.png` and `src/lib/character-portraits.ts` imports that file instead of `night-shift.svg`.

When installing the asset:
- Keep the original full-resolution image unmodified as the primary face reference for future image generations.
- Lock visual identity: Riley is a 28-year-old woman with blue eyes, shoulder-past long blonde curly hair worn completely down, a slim and curvy build, and a natural expressive face.
- Canon clothing is navy medical scrubs and black zip hoodie while on shift; non-work outfits can vary.
- Future photos may change camera pose, clothing, lighting and location but must preserve face identity and hair/eye characteristics.
- Never regenerate an independent new face simply because a pose changes.

Database: apply `docs/sql/20261024_riley_night_shift.sql` after review. Do not merge this PR until checks pass and the real asset is installed.
