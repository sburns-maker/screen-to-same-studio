# Outing photo screening, bench continuity and completion recaps

## What the screenshots establish

The 2 PM photo reached generation and failed rendered-image screening with
`scene_mismatch`. Both outdoor labels belong to an earlier, text-based location
check. They cannot establish that the generated image matched the request. The
rejected pixels and the vision model's detailed reason were not available here;
this repair does not claim to prove that particular rejection was wrong. The
later same-action deferral is intentional duplicate-charge protection.

## Changes

- The shared vision screen explicitly compares the **candidate** scene, not the
  canonical reference portrait's background. It checks visible contradictions,
  not proof of narrative details, venue names, unseen companions or a full-body
  walking action in a close selfie. Identity screening stays independent.
- Vision returns an allowlisted scene rule (location, activity, required subject,
  visible detail or uncertain). Private world-event diagnostics retain that rule
  and rendered-image stage, and the existing developer timeline displays them
  separately from the text location check. Older logs cannot be retroactively
  explained. No free-text vision rationale or raw prompts are exposed.
- Fixed a schema mismatch: `scene_consistent` was accepted as a local reason for
  environment photos but missing from the provider's reason enum.
- A performed bench/picnic-table seating action now persists in the existing
  live scene's `area` and supported `talking` activity. Refresh does not reset it
  to walking. A shared walk requires an actual recorded resumption; suggestions
  and historical references don't move participants. No new DB activity enum.
- The final completion instruction asks for important details from the beginning,
  middle and end of the whole journal, preserving boundaries and distinguishing
  travel interests from bookings. It uses the existing transaction and single
  outcome memory, without an additional inference pass or relationship changes.
  All recorded moments already remain in the owner-scoped journal. This is not
  proof that every detail from the user's live outing exists in extracted memory;
  no live database was accessed or old memories rewritten.

## Safeguards and rollout

No migration, model switch, new retry loop, image budget change, canonical-reference
change or romantic scoring change. A genuine or uncertain visual failure still
withholds the candidate. Scene failures do not regenerate; only the existing
bounded face-drift retry remains. A later passing identity retry records the final
successful screen rather than retaining the first candidate's failed verdict.
Small prompt/schema changes may affect token usage; number of calls is unchanged.
Nothing is deployed or applied to production by this branch.

## Verification and manual acceptance

Automated coverage uses mocked visual/image providers and local PGlite migrations,
not live paid images. Tests cover outdoor candidate vs indoor reference contract,
sanitized rendered-scene rules, failed-screen delivery prevention and no extra
image generation, persistent bench state, invalid walking rejection, explicit
walking resumption, unchanged calendar venue, full-journal completion context and
one saved outcome on retry. Existing park → restaurant → car → home tests remain.

After review/deployment, use a **new** normal photo action in the current context.
Do not clear the failed action ledger or replay an uncertain paid request. If it
fails, inspect the generated-image stage/rule as well as location labels. An old
`scene_mismatch` entry still has no detailed reason. Check a bench conversation
across refresh, then explicitly resume walking. At completion inspect whether the
recap covers earlier topics as well as the goodbye. Live visual and Android
acceptance remain necessary; no guaranteed live generation success is claimed.

Validation for this branch: full suite 888 passed / 48 optional PostgreSQL tests
skipped; focused scene/photo/experience suite 93 passed; final visual-screen suite
28 passed. TypeScript and production build passed. Focused lint passed (legacy
compact source/test files checked with their existing formatting rule disabled);
`git diff --check` passed. No production or paid provider tests were run.
