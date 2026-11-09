# Carly Reed and Brooke Halloway — After Dark cast staging

The source now integrates **two fictional adult characters** and a durable, consent-aware introduction. Migration 0072 is still **unapplied**: this shared preview/production database must not be changed before review. Registries and runtime wiring are checked in; this is not a deployed feature.

## Character roles
- **Carly Reed (28)**: Long jet-black hair, icy-blue eyes, floral tattoos; Pittsburgh-born exotic dancer and occasional bartender at the entirely fictional *After Dark*. Social, confident, spontaneous, interested in casual dating; independent apartment and black Dodge Challenger. Directly available as a first-contact character when cast integration lands.
- **Brooke Halloway (26)**: Shoulder-length natural platinum blonde waves, blue eyes; dancer at the same fictional club, originally from Erie. College-to-nightlife career pivot; rents with two coworkers. Playful, spontaneous and willing to date, but with her own schedule and boundaries. Texting unlocks after consented introduction acceptance, before the moving-help meeting.

## Reference photos (prepared separately, not committed as binary assets)
`Carly_Reed_01_primary.jpg`, `Carly_Reed_02_alternate.jpg`, `Carly_Reed_03_evening.jpg`;
`Brooke_Halloway_01_primary.jpg`, `Brooke_Halloway_02_alternate.jpg`, `Brooke_Halloway_03_evening.jpg`.
They are crops from the approved concept poster. Smaller alternative crops lack enough resolution for full-quality canonical photo generation. Before production, obtain a high-resolution clean portrait for each subject; upload through the existing canonical/reference library.

## Integration checklist before enabling
1. Add names to `CharacterKey`, `CHARACTERS`, identity/display and avatar registries, server validators, seed migrations, and every exhaustive Record keyed on the cast.
2. Register per-character canonical image assets and quality-controlled reference slots; permit bold, consensual adult-flirtation photo styles without assuming every photo needs to be intimate.
3. Create Brooke's contact only after Carly's visible offer is accepted. The moving-help encounter is the subsequent first meeting; neither name mentions nor scores unlock her.
4. Add independent work schedules at fictional *After Dark*, map coordinates only if securely grounded as a fictional venue, and independent relationship/consent state.
5. Integrate background NPC friendship edges and invitation lifecycle in the world; no auto-accepted dates or intimacy.
6. Add integration tests for database migration, phone contacts, avatars, photo generation, first message, independent state, consent, and unlock behavior. Run app build + all CI before enabling.

**Merging code alone does not apply migration 0072 or approve private reference slots.** Carly's three supplied photos and a usable Brooke alternate remain outstanding.

## First-conversation introduction: practical help
After the first meaningful conversation Carly asks: "Hey, random favor. My friend Brooke needs an extra set of hands moving something. She said it's okay to pass you her number if you're up for helping. Mind texting her? I think you'll like her."

- The player can decline without penalty. Carly does not keep nagging them.
- Brooke explicitly opted into the introduction and the player accepts before her number is shared.
- Unlock Brooke's texting contact at **mutual acceptance of contact exchange**, not after the move.
- The player texts Brooke, Brooke schedules the moving help, and their first in-person meeting happens while moving a box or piece of furniture.
- Relationship, flirtation, or any physical intimacy proceed separately; helping is not transactional.
- Runtime wiring uses `brooke-introduction.ts`, its server service and authenticated actions; `ensureConversations` consults the persisted gate.

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
  completed moving-help plan in Brooke's thread is found. An unrelated outing never counts.
- Counts exclude hidden Carly messages; accepting/declining requires the durable, visible offer message. A partially saved offer cannot unlock Brooke.
- Brooke's original 1086×1448 primary is now bundled byte-for-byte as her canonical portrait and display avatar. Her evening original is server-only and imports into private storage only on an explicit owner action; it is not automatically approved.
- Carly photos still fail closed (`Canonical profile is not registered`) until her primary is supplied.
- After Dark's two workplace entrances resolve to the existing Carly club key for the exact shared label, without relaxing other ambiguous venue validation.

## Administrator steps for the six reference photos

1. After review and authorized migration application, open Carly's thread, accept her introduction, then open Brooke's thread. No acceptance, messages or encounters were performed on the real game during this work.
2. Settings → Reference Library → Character → Brooke. Preview the canonical portrait, confirm identity and approve the canonical slot.
3. Click **Add supplied evening photo**. Preview the newly uploaded candidate, select **Alternate angle**, confirm identity and approve. Importing alone never changes a reference slot or enables SpicyAPI.
4. Upload a replacement for `Brooke_Halloway_02_alternate.jpg` using **Upload reference**. The supplied file is only **142×193** and is retained unchanged for comparison, but deliberately not activated or enlarged. The existing JPEG quality gate requires at least 256 pixels on each side; preferably supply an original around 1000 pixels or larger. Preview and assign it to **Half-body** after review.
5. Supply Carly's primary, alternate and evening images; her canonical portrait must be bundled before her library can resolve identity. Once ready, use the same upload/preview/confirm/approve process for Carly's two alternate slots.
6. Verify each character shows **Three references approved** with distinct hashes and no changed slots for other characters. Explicit adult confirmation and provider opt-in remain separate; uploading never enables paid generation.

Private uploads use `tess-photos/<owner>/reference-uploads/<character>/<content-sha256>.jpg`, matching migration 0057's candidate validator. The authenticated server validates an owned conversation, private bucket, original JPEG dimensions, size, character binding and hashes before registration. The browser receives previews, not storage URLs.

## Verification — November 9, 2026

- Changed-path checks: **48 passed** (introduction, disposable migration compatibility, canonical bytes, private candidate import, reference interface, club label, photo setup).
- Full available suite: **1813 passed, 8 failed, 55 skipped**. Remaining failures are six phone-call tests, one developer-photo test, and one provider-preference test, matching the previously reported categories; an old-code baseline was not rerun, so their pre-existing status is not independently proven here.
- Automatic preview build/type validation: latest result **build OK**. No separate manual application build/typecheck was run because the platform performs them automatically.
- Public mobile preview: no runtime errors or horizontal overflow. Real Carly/Brooke messaging and approved provider output remain **unverified**, since migration 0072 has not been applied and no production interaction or paid generation was authorized.
- All three Brooke files were inspected visually. Primary and evening are 1086×1448; alternate is 142×193 and is deliberately not a usable reference slot.
- No database writes, storage writes, paid API calls, publish, deployment, PR merge or PR creation were performed. PR creation is unavailable through the current tools. The repository contains the implementation and migration for review, not a fully activated release.
