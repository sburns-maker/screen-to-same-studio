# Developer photo category lab

Open **Simulation Debug → Photos → Photo category lab (developer only)**.
There is a separate exact-category generation button for object/environment,
candid portrait, casual selfie, personal selfie, affectionate close-up
(`intimate_selfie`) mature romantic and suggestive. Unsupported categories are disabled.
Riley supports all six. Mature romantic is the existing **non-explicit, fully
covered adult portrait** category; this feature does not add explicit imagery.

## What is intentionally bypassed

This is a rendering test, not a character deciding whether to send a photo.
It skips chat frequency/pacing, relationship thresholds, saved chat photo refusal
and mature-chat preferences, schedules, current locations and autonomous-selection
lotteries. A server-written test scene requests the exact category. This is clearly
a fictional test setup, not a new event in the character's life. No dialogue model
chooses a different category or substitutes a text-only response.

Tests are shown in a private developer preview gallery by default. No messages,
push notifications, generated-images chat records, memories, relationship points,
profile photos or canonical references are changed. Normal settings remain saved.
The gallery choice was the stated default while the optional delivery-preference
question was pending; normal chat delivery of test images is not implemented.

## What remains mandatory

Every action requires authenticated ownership of the contact plus the existing
`ENABLE_DEV_PHOTO_ACTIONS=true` and `DEVELOPER_PHOTO_USER_IDS` allowlist. Database
and configured character ages must be adult. Capability checks still disable
unsupported categories (for example Ben's romantic portraits). Portraits use
`currentCanonical` and actual approved reference pixels, the configured provider and
model selection, `generateTessImage`, content rules, and visual design/scene screening.
Ordinary categories continue using the normal image provider. **Suggestive is
SpicyAPI-only** and requires enabled SpicyAPI, per-character adult confirmation
and explicit opt-in, valid provider configuration, verified funds and approved
references. It never falls back to OpenAI/the ordinary image provider. If the
SpicyAPI prerequisites are unavailable, the test fails with an explanation
before consuming image-attempt budget. No unscreened output is used. Original image bytes stay in private `tess-photos` storage at an
owner/test-specific path; signed preview links expire after 120 seconds and can
be refreshed without another generation. Images failing checks are not previewed
as successful results. Missing provider/approved identity fails safely.

Each button is an explicit paid test request. The existing per-contact/user daily
and monthly image attempt budget is shared with normal photos and cannot be reset
from this menu. Image and vision calls, including the existing bounded identity
retry, may incur charges. Merely opening the menu, checking history, refreshing a
preview link or releasing an expired reservation makes no model call.

## Reservations and the reset issue

Lab reservations use `developer-photo-lab:<conversationId>`, separate from
`photo-turn:<conversationId>`. A stuck normal text/photo reply therefore cannot
block a rendering test; no chat cooldown, boundary or relationship score needs to
be reset for a lab test. The database's existing unique running-job index allows
one active lab test per contact. Stable request IDs never regenerate a completed,
failed or uncertain action. A network-uncertain explicit retry retains its ID,
including after a status check that cannot yet find it. A new click after a known
terminal result is a new paid request, not a free regeneration.

An expired generating **lab** lease can be released after five minutes. A
conditional status/start-time/phase/owner update cannot overwrite a late stored
result. Its old request ID stays failed permanently; a new test requires another
explicit click. The existing normal-response recovery control remains separate
and unchanged. No normal history, refusal, budget or pending paid action is erased.
This code work has not reset any live Riley record or generated a live image.

## Implementation and verification

No migration; suggestive uses existing SpicyAPI configuration and explicit consent. Reuses `job_runs`, `media_attempts`,
the existing budget RPC, private storage and shared canonical/generation services.
The normal texting/photo/video delivery paths are unchanged. The route component
is keyed by conversation so delayed UI results cannot appear in another contact's
newly mounted lab.

Automated tests mock paid generation. They check all six Riley categories despite
low relationship state, disabled chat photos and a running normal reply; correct
anchors across all six contacts; preserved conversations/state/memories; exact
category requests; private storage; deduplication; failed/uncertain replay; active
test exclusion; developer/owner/adult/capability checks; identity lookup failure;
shared budget limits; expired test release; and the mobile category controls.
These tests do not prove live visual identity fidelity or live provider success.
After reviewed deployment, generate one desired category, inspect its preview and
diagnostics, then choose the next test explicitly. If a test is interrupted, check
its status first instead of repeatedly starting new requests. Nothing was merged,
published, applied to production or charged during automated verification.

Validation: 917 application tests passed, with 50 optional PostgreSQL tests skipped;
19 focused lab tests passed. TypeScript, focused lint, production build and diff
checks passed. Paid generation was mocked. No live image, billing, visual-quality
or Android acceptance result is claimed.
