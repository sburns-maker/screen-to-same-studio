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

## Early introduction follow-up
When full runtime integration is implemented, track `completedCarlyExchanges` and `BrookeIntroductionStatus` per owner/conversation. Within the **first 1–3 meaningful Carly exchanges**, naturally mention Brooke; after user curiosity, offer a group meal or social invitation. Do not generate an introduction when the scene context is urgent or awkward. Persist `mentioned`, `invited`, `declined`, `met`, and `contact_accepted` to prevent loops. The pure staging helper `nextBrookeIntroductionBeat` expresses the intended pacing, but it is **not yet wired into runtime messaging**.

## Portrait cleanup follow-up
New concept renders were made and larger portrait preview crops exported separately in `after_dark_cleaner_previews.zip` for user review. These crops are **not true standalone high-resolution canonical portraits**, and upscaling does not restore details absent from poster-sized source images. Final photo integration requires separately generated, identity-matched high-resolution portrait sources (preferably at least 1024 px across the face/upper-body crop) and an independent quality check for face, hair, tattoo continuity, and uncropped clothing.
