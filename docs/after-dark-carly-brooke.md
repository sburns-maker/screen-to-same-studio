# Carly Reed and Brooke Halloway — After Dark cast staging

This branch stages **two fictional adult characters** and an explicit, consent-aware social introduction rule. They are **NOT yet registered as live contacts**: this work deliberately avoids updating the large global `CharacterKey` union and database cast before every dependent runtime validator, seed, and photo pipeline is ready.

## Character roles
- **Carly Reed (28)**: Long jet-black hair, icy-blue eyes, floral tattoos; Pittsburgh-born exotic dancer and occasional bartender at the entirely fictional *After Dark*. Social, confident, spontaneous, interested in casual dating; independent apartment and black Dodge Challenger. Directly available as a first-contact character when cast integration lands.
- **Brooke Halloway (26)**: Shoulder-length natural platinum blonde waves, blue eyes; dancer at the same fictional club, originally from Erie. College-to-nightlife career pivot; rents with two coworkers. Playful, spontaneous and willing to date, but with her own schedule and boundaries. Unlock via actual meeting and her independent choice to exchange contact information.

## Reference photos (prepared separately, not committed as binary assets)
`Carly_Reed_01_primary.jpg`, `Carly_Reed_02_alternate.jpg`, `Carly_Reed_03_evening.jpg`;
`Brooke_Halloway_01_primary.jpg`, `Brooke_Halloway_02_alternate.jpg`, `Brooke_Halloway_03_evening.jpg`.
They are crops from the approved concept poster. Smaller alternative crops lack enough resolution for full-quality canonical photo generation. Before production, obtain a high-resolution clean portrait for each subject; upload through the existing canonical/reference library.

## Integration checklist before enabling
1. Add names to `CharacterKey`, `CHARACTERS`, identity/display and avatar registries, server validators, seed migrations, and every exhaustive Record keyed on the cast.
2. Register per-character canonical image assets and quality-controlled reference slots; permit bold, consensual adult-flirtation photo styles without assuming every photo needs to be intimate.
3. Wire actual contact creation and messaging after a Carly encounter; keep Brooke initially locked until an in-scene meeting and her independent agreement. Never unlock through a name mention or arbitrary score.
4. Add independent work schedules at fictional *After Dark*, map coordinates only if securely grounded as a fictional venue, and independent relationship/consent state.
5. Integrate background NPC friendship edges and invitation lifecycle in the world; no auto-accepted dates or intimacy.
6. Add integration tests for database migration, phone contacts, avatars, photo generation, first message, independent state, consent, and unlock behavior. Run app build + all CI before enabling.

**Do not merge this staging-only branch expecting the contacts to appear in the app.** It captures approved identities and introduction policy while integration is pending.

## First-conversation introduction: practical help
After the first meaningful conversation Carly asks: "Hey, random favor. My friend Brooke needs an extra set of hands moving something. She said it's okay to pass you her number if you're up for helping. Mind texting her? I think you'll like her."

- The player can decline without penalty. Carly does not keep nagging them.
- Brooke explicitly opted into the introduction and the player accepts before her number is shared.
- Unlock Brooke's texting contact at **mutual acceptance of contact exchange**, not after the move.
- The player texts Brooke, Brooke schedules the moving help, and their first in-person meeting happens while moving a box or piece of furniture.
- Relationship, flirtation, or any physical intimacy proceed separately; helping is not transactional.
- The `nextBrookeIntroductionBeat` and `canStartBrookeHelpText` helpers and tests are staged, **not yet wired to the live phone system or server**.

## Three reference photos per woman
Exported as six separate JPGs in `after_dark_six_reference_photos.zip` (not yet uploaded to the in-app image reference library):
- Carly_Reed_01_primary.jpg — 1024x1536, standalone generation
- Carly_Reed_02_alternate.jpg — 1024x1536, standalone generation
- Carly_Reed_03_evening_lower_resolution.jpg — 308x493, a different pose but from a composite; **replace before using as a canonical third slot**.
- Brooke_Halloway_01_primary.jpg — 1086x1448, standalone generation
- Brooke_Halloway_02_alternate.jpg — 1086x1448, standalone generation
- Brooke_Halloway_03_evening.jpg — 1086x1448, standalone generation

Please check facial/tattoo/hair identity consistency in all generations before making them canonical references. The exact images are intentionally not committed to source control or claimed uploaded to app storage. An authorized storage upload and third Carly replacement remain open work.

## Live integration status (completion)

- Migration `0072_after_dark_carly_brooke.sql` (written, journaled, **not applied**): adds both
  `characters` rows, extends the three cast check constraints and eight installed function
  guards (idempotent), and creates owner-readable `after_dark_introductions`.
- Introduction: `brooke-introduction.ts` (pure rules) + `.server.ts` (conditional, one-shot
  transitions) + `.functions.ts` (accept/decline). Carly's offer is inserted once after ≥3
  player and ≥3 Carly messages with no serious topic in the latest player text. Brooke's thread
  is created only after acceptance; decline is final and penalty-free. `met` is recorded when a
  Living Experience in Brooke's thread completes.
- Photos fail closed (`Canonical profile is not registered`) until portraits are bundled.

## Administrator steps for the six reference photos

1. Send the six files in chat, named e.g. `carly-1-primary.jpg`, `carly-2-halfbody.jpg`,
   `carly-3-evening.jpg`, and the same for Brooke.
2. The two primary portraits are committed as `src/assets/avatars/carly-canon.jpg` and
   `brooke-canon.jpg` and registered in `canonical-profile.server.ts` (immutable bundled bytes).
3. The four alternates are uploaded to private `tess-photos/<owner>/reference-uploads/` and
   registered in `photo_reference_uploads` for that character.
4. In Settings → Photo setup → Reference library, choose Carly (then Brooke), approve the
   primary, and review the two alternates into slots 2 and 3.
5. Verify: Photo setup shows each character's canonical reference "structurally usable" and
   three approved slots; no other character's slots change.
