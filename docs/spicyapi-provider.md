# SpicyAPI mature-photo replacement

This replaces the API18 runtime adapter, not ordinary photo generation or phone calls.
`mature_romantic` retains its existing non-nude adult category and all relationship,
willingness, refusal, photo-boundary, image-budget and reference-approval rules. Tess,
Maya, Riley, Claire and Jordan may use this provider; Ben remains excluded. Developer
rendering stays isolated from normal chat, memories and relationship state.

## Verified contract and limits of verification

Implemented from the official excerpts supplied by the project owner:
- https://spicyapi.ai/models/seedream-5-0-flash
- https://spicyapi.ai/models/seedream-5-0-pro
- https://docs.spicyapi.ai/docs/tasks
- https://docs.spicyapi.ai/docs/idempotency

The environment could not retrieve these domains (proxy CONNECT HTTP403). No pasted
credential was used and no authenticated live model-schema fetch or paid generation was
performed. Only the supplied verified fields are sent. Live schema/price/CDN and image
acceptance remain staging checks. Nothing was deployed or installed in production.

Flash: `bytedance/seedream-5.0-flash/edit`; optional Pro:
`bytedance/seedream-5.0-pro/edit`. Configuration chooses a model before reservation;
there is no automatic Pro fallback. POST `/api/v1/jobs/createTask` sends `model` and
`input.image_urls`, `prompt`, `aspect_ratio:3:4`, `resolution:2k`, `output_format:png`,
`background:opaque`; Pro also sends `enable_thinking:true`. HTTP202/code200 yields a
persisted task ID. GET `/api/v1/jobs/recordInfo?taskId=...` supplies state and assets.
Only settled finite nonnegative costs reconcile conservative spending reservations.
No automatic refund is assumed for failures. An actual cost above its estimate blocks
new reservations until the operator reviews the estimate.

## Persistence, delivery, privacy

Migration 0051 adds service-only SpicyAPI tasks, atomic budget reservations, worker leases
and completion RPCs. Authenticated clients cannot read task payloads or mutate jobs.
Existing API18 records, costs, historical migrations, approved canonical assets and
reference slots remain intact. API18 network adapter/refresh code is removed. A new
per-character `spicy_enabled` flag defaults false: old API18 consent is not reused.

Each logical action gets a persisted `photo-msg-<action UUID>-render-1` idempotency key
before submission. A repeated action reuses its task and never buys another image.
Creation is not automatically retried, even within SpicyAPI's 24-hour idempotency window.
Unknown POST acceptance stays conservatively reserved and requires operator investigation;
changing the secret, model or reference never silently resubmits an uncertain action.

A chat turn commits its state/memories/calendar effects once through the existing atomic
outbox, with a pending attachment. That outbox releases the conversation lock, so text
can continue. Polling updates the original message after private storage and visual
screening; it never replays relationship progress. The pending metadata survives later
text replacement. Failed tasks become explicit unavailable attachments without a broken
image or an automatic regeneration. Tests remain in the developer lab, not chat.

A short post-response continuation, the existing managed world worker, and an authenticated
10-second pending-chat refresh resume saved tasks. Polls back off toward 15 seconds,
honor Retry-After, and use leases to prevent overlapping finalization. Browser closure
never authorizes resubmission. The world worker schedules photo work separately rather
than awaiting it in the phone/call scheduling path. For dependable closed-app delivery,
keep the existing managed worker healthy and running frequently enough to retrieve
provider outputs before the approximately 20-minute signed-asset expiry. Host runtime
limits can interrupt continuations; the durable task remains recoverable.

Polling timeouts keep the task pending. After 24 hours of waiting, the attachment fails
explicitly without re-submitting. A missing destination after one hour is retained as a
failed task with its conservative cost. Unknown submissions without a task ID require
manual dashboard reconciliation, not a new request ID.

Approved canonical references are resolved per owner/character and hashes checked against
the generation anchor. Existing approved half-body/alternate references may supplement
that same person's identity. Generated outputs are never automatically approved. Reference
URLs are signed server-side and never logged or stored in task payloads. Result URLs are
fetched only from configured exact HTTPS CDN hosts (including each redirect); output
requests never carry the API key. PNG MIME/magic and a 20MB cap are checked before private
storage and existing visual screening. A canonical change or revoked preference/boundary
while waiting prevents delivery. Stored-byte recovery verifies hashes before reusing a path.

## Lovable configuration after code review

1. Rotate the credential exposed in chat. Enter the replacement as server-only
   `SPICY_API_KEY` in Lovable Secrets, never a browser field or VITE-prefixed variable.
2. Apply migration `0051_spicy_photo_tasks.sql` through the normal migration runner.
   No manual production SQL, historical migration edits, data reset or SSH is required.
3. Keep `SPICY_ENABLED=false` initially. Set `SPICY_MODEL` to Flash or the verified Pro ID.
   Optional overrides: `SPICY_MODEL_TESS`, `_MAYA`, `_RILEY`, `_CLAIRE`, `_JORDAN`.
4. Verify actual account pricing/usable credit and set positive integer cent values for
   `SPICY_JOB_RESERVATION_CENTS`, `SPICY_DAILY_BUDGET_CENTS`, and
   `SPICY_MONTHLY_BUDGET_CENTS` (job <= daily <= monthly). Configure an adequate estimate
   for the most expensive enabled model; documentation sample prices are not estimates.
5. Set `SPICY_OUTPUT_HOSTS` to verified exact CDN hosts from provider documentation/account
   support. Set `SPICY_ACCOUNT_CREDITS_VERIFIED_AT` only after checking usable API credit.
   Verification expires after 24 hours. No invented balance or quote endpoint is called.
6. Keep normal OpenAI, storage, world worker, call settings and visual-screen credentials
   unchanged. Enable `SPICY_ENABLED=true` only in authorized staging after these checks.
7. In the existing Settings reference library, review references and explicitly opt in
   for each desired character. Existing mature-photo preference and willingness still apply.
8. Verify the live input schemas via authenticated `/api/v1/models/{model}` when available;
   there is no billable schema fetch or quote request in automated tests. Review a separately
   authorized staging generation before production rollout. Remove obsolete API18 secrets
   from Lovable only after confirming no other deployment still needs them; this work never
   modifies the production environment.

## Automated/manual acceptance

All external responses are mocked. Tests cover body/header/model contracts, per-character
canonical isolation, wrong references, adult opt-in, ordinary routing, pending task
persistence, one submission on concurrent/repeated actions, unknown acceptance, budget
caps, private RLS, successful/failed completion, polling errors and output validation.
Manual staging must verify genuine provider permissions, account billing, CDN hosts,
Android pending-photo updates, closed-app worker recovery and actual image identity/quality.
