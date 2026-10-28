# Character-aware photography

Baseline: `origin/main` **61a237b**, including the media viewer/profile management and merged Flare identity-flexibility work. Latest `main` through **c1f7fdb**, including the Jordan “patiently” word-boundary fix, is integrated. Branch: `codex/character-photo-personality`. No deployment, production migration, paid generation or live-data edit was performed.

## Changes

`src/lib/photo-personality.ts` centralizes typed photography profiles for Tess, Maya, Claire, Jordan and Ben: photographic styles, expression options, contextual setting examples, wardrobe/hairstyle possibilities, selfie habits, caption voice, relative spontaneity and weighted scenario preferences. An optional typed supporting-profile registry/fallback supports future NPC integration; it does **not** grant an NPC image capability or approve its identity. Hair-color, face, age and other identity facts remain governed by the actual approved reference and established character canon.

Tess has restrained/deadpan humor with flexible reaction selfies. Maya is more expressive and situational, including tired or imperfect moments without compulsory cheerfulness. Claire favors quiet details; Jordan selective understated sharing; Ben practical, platonic snapshots. These are preferences, not a dress code or mandatory expression. Existing chance/hour/message values are moved into this shared source without changing them. Existing contextual cooldowns, eligibility, willingness, developer controls, spending protection and deduplication remain intact.

`planPhotography` selects from reusable scenario tags using current schedule/activity (including the existing active shared-plan/story schedule), relevant current user cues and a stable action-key hash. Profile-specific weights apply only to context-supported candidates. Examples: Maya can get `venue_update` when actually at the venue; a user question about a future venue visit does not move her there. A busy/asleep or unsafe activity produces no scenario candidates. Ambiguous routines such as “errands or Mabel walk” remain ambiguous. No scenario is required to share a contextually appropriate photo.

Conversation/world-memory retrieval stays character-scoped and unchanged. Its existing context still informs the character's creative photo decision; the new deterministic selector uses the current activity, rather than treating old memories or future plans as current locations. Selecting a tag creates no world event, visit, object, outfit, friendship or relationship progress.

## Prompts, captions and continuity

The existing shared image generation service composes: approved identity pixels and identity rules; explicit current scene/style; factual current location and continuity; soft photography tendencies; existing global safety, text-rendering and smartphone-realism rules. It preserves the priority **identity > factual continuity > user-established scene > tendencies > aesthetic defaults**. Scene/style requests and genuine emotional circumstances supersede default expression/outfit options. Object-only images remain object-only. Caption text is not inserted into the image prompt.

Caption guidance goes to the existing character dialogue call, independently from image styling: short dry observations for Tess, warmer conversational commentary for Maya, each other contact's established voice. Captions must describe only the chosen scene and avoid repeating recent signatures/jokes. This does not add a second caption model call. Photo-generation failure still withholds the proposed attachment/caption through the existing delivery pipeline. Semantic caption correctness and exact visual detail remain model-dependent; no extra paid caption/image validation model was introduced.

Only **delivered, screened generated portraits in this conversation** can contribute new visual continuity. Successful message metadata stores a small `photo_visual` snapshot (character, known location, chosen style and current grounded objects). Pending photos, user photos and another character's snapshot are ignored. A same-character, same-known-location snapshot within **20 minutes** supplies hairstyle/clothing hints; this is a hint lifetime, **not a photo cooldown**. It neither delays nor prevents sharing. Unknown/changed locations and older photos do not establish continuity. Prior generated pixels are never reused as identity references.

Missing style fields can inherit same-moment hair/clothing; explicit proposed style or scene details can vary them. Lighting/weather guidance uses current regional conditions only where relevant and does not impose outdoor lighting on indoor scenes. Current activity grounds known objects such as Mabel or coffee. The selector does not invent possessions from a preferred scenario. Historical photos without the new metadata remain usable and are not retrospectively labeled as screened/continuity evidence. Exact outfit/object/lighting consistency is not independently verified by a new vision pass.

Clear known-location contradictions are rejected before reserving an image attempt (e.g. current home versus proposed venue). Unknown location stays permissive; this is a conservative lexical check, not a physical-world scene parser. No invented travel is used to repair conflicts. Existing composition-repeat rules are preserved.

## Diagnostics

Simulation Debug adds **Character photography** behind the existing developer authorization. It shows the profile, illustrative current scenario/candidates, continuity source/reason, eligible types, pacing reason, latest recorded choice/decline, latest generation style/model/identity screen/retry diagnostics and recent failure. The current debug preview uses a separate illustrative key; actual generation metadata records the real selected scenario. Developer photo preview returns the same plan without generation.

`PhotoDiagnostics.photography` records sanitized structural prompt components (reference/context/scene/continuity/tendencies/safety), scenario, location category, chosen style and continuity. Full prompts, transcripts, image bytes and credentials are not logged. URLs, email addresses, credential-shaped strings and long tokens are redacted from free-text diagnostic style values. Normal visible reply metadata records a compact decision reason without inventing a character message when she chooses silence. No new diagnostics are exposed in ordinary texting bubbles.

## Preserved pipeline and costs

- Direct provider/default **`gpt-image-2.5-flare`**, existing `OPENAI_IMAGE_MODEL` override and gateway behavior are unchanged.
- Canonical identity resolution, explicit user approval, photo/profile/viewer/video paths, visual/text screening, bounded identity mismatch retry, action receipts, image budgets and atomic delivery are unchanged.
- No new model calls, scheduler jobs or paid regeneration loops. Extra input tokens are added to image prompts and to dialogue prompts only when photo categories are available. Existing identity-repair costs remain; no new cost multiplier is enabled.
- New snapshots/diagnostics use existing JSON message metadata and failure-event payloads. **No migration, new secret, provider credential or feature activation is required.** No histories, memories, scores, plans, media or world records are reset/backfilled.

## Validation and acceptance

Automated tests use mocked paid image/vision/text boundaries. Tests cover distinct profiles, unchanged sharing probabilities, grounded/ambiguous/busy scenarios, weighted determinism, future-profile fallback, explicit scene priority, continuity expiry/location isolation/visibility, legitimate hair and expression variation, object-only composition, separate caption guidance, diagnostic redaction and the normal developer/foreground turn path. Existing identity, retry, budget, delivery, world, memory, media-viewer and video tests run with the full suite. Older test assertions were updated to match Flare and the already-merged bounded identity retry; no provider behavior was changed to satisfy them.

**Results:** all **429 tests in 45 files** passed, as did `tsc --noEmit`, the production `vite build`, focused ESLint and whitespace checks. Existing build warnings remain.

Manual visual acceptance remains required: on an authorized preview, use the existing developer **Preview** first (free), then separately approve a paid opportunity at a compatible time. Compare a Tess clinic-break photo and Maya venue/home moments against their actual current approved references; test a short same-location follow-up, an explicitly changed hairstyle, a mood-appropriate tired expression and an environment-only photo. Inspect separate captions and the debug scenario/style/retry record. The character can still decline. No live image was generated during this task and automated tests do not establish actual rendered likeness, wardrobe fidelity or caption accuracy.

## Subject balance after repeated objects

The owner/conversation-scoped delivered-photo lookup now also feeds a separate
24-hour subject history (latest six screened generated attachments, deduplicated
by storage path). It counts object/environment photos as well as photos with the
character in frame. Hidden, pending, rejected and other-character photos do not
contribute. Object photos still cannot supply outfit or hairstyle continuity.

Two most recent object-only photos add a soft suggestion to consider an ordinary
eligible selfie or candid in the actual setting. There is no forced alternation,
romantic escalation, new photographer or outfit change, and direct requests for
objects remain valid. Topic repetition guidance explicitly allows the character's
face rather than implicitly requiring a new object. Shared guidance applies to
all cast members while preserving each photography profile and all eligibility
and willingness checks. No images are regenerated and no additional model call
is made. Curated/legacy photos without screened character metadata are excluded
from this signal rather than assigned an unverified subject.

`photo-subject-balance.test.ts` exercises 20 synthetic opportunities per character;
these checks validate prompt context, not actual model choice or generated pixels.
After publication, review naturally delivered photos for subject balance, current
location/clothes and identity. A run of object photos may still be an intentional
choice or a selfie boundary; inspect existing photo diagnostics before changing
permissions. This workspace cannot verify the user's live conversation history.

## Reference pose anchoring

Canonical portraits remain unchanged and authoritative for stable appearance.
Their head tilt, smile, gaze, shoulder line, arm position and camera distance are
not identity traits. `photo-reference-prompt.ts` provides a shared contract to
the ordinary and Spicy image prompts, with an explicit target capture assembled
from the selected pose, expression, camera angle, crop and capture method.
The broad reference-overrides-description language is restricted to stable
appearance; scene instructions control pose and framing. No provider settings,
references, screening thresholds, paid retries or budgets change.

Both dialogue adapters ask for a concrete pose (body/shoulders, head, gaze and
visible hands where relevant), rather than just "natural", "selfie" or "sitting".
They use actual scene and recent-photo context, preserve explicit same-pose
requests, and do not rotate emotions, invent photographers or change established
clothes for variety. The existing composition selector still chooses plausible
framing without random draws; it is not an image-pose detector.

Confirmed code weaknesses were the broad reference precedence language and
under-specified pose planning. Provider tendency to carry reference geometry
into the output remains a hypothesis without the matching live request and
reference/output review; prompts already contained general anti-copy guidance.
The change is a stronger instruction, not proof of pixel-level variety.

Verification: mocked generation over 20 opportunities for each character keeps
canonical bytes/hash and scene/outfit continuity while including explicit target
capture instructions. Direct builder tests cover both image providers, objects,
mirror geometry, unspecified poses and deliberate same-pose requests. After
publication, visually review a sequence for head/torso/arm placement as well as
crop, location and identity. Compare the actual chosen pose metadata to the
result before attributing a repeat to planning versus the image model. No paid
generation was run during these checks.
