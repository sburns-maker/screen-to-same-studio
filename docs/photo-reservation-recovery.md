# Photo reservation diagnostics and recovery

## Observed failure

The debug screen showed general photo eligibility but returned `photo generation already reserved` on delivery. That string means a running `photo-turn:<conversation>` ledger row exists in a non-prepared phase. The same ledger protects **all** character turns, including text-only replies, so it does not prove an image is currently generating or that the character refused. The screenshot alone does not establish whether the row was still active or interrupted; inspecting its phase and start time is necessary.

Previously preview skipped this ledger check entirely. Delivery attempted recovery, reported the generic reservation reason and disabled the share button, without offering status inspection or recovery. Expiry cleanup also updated a job by ID alone after reading it, allowing a concurrent preparation to be overwritten as failed. A late `preparePhotoDelivery` update could affect zero rows yet proceed as if preparation succeeded.

## Changes

- Owner-scoped, sanitized reservation inspection exposes only action ID, known phase, start time, age and recovery eligibility. It never returns saved dialogue, image paths, provider payloads or credentials.
- Developer previews now check the same pending job before continuing with eligibility, without releasing it, delivering anything or calling a model.
- The existing developer-only Photos panel adds **Check delivery status** and, when appropriate, **Recover existing request**. Both require the existing server flag, developer allowlist and owned conversation. Status works without a prompt.
- Recovery delivers only an already prepared response through the existing atomic delivery RPC. It can instead release an explicitly generating reservation older than the existing five-minute expiry, while retaining its unique action ID. It never invokes text/image generation, retries an ambiguous provider request or changes photo boundaries/budgets.
- Expiry uses a conditional database update matching ID, running status, generating phase, owner and original start time. If another worker prepared/delivered the response meanwhile, recovery reads again and preserves or delivers that result. Unknown phases and pending phone-playback acknowledgements are retained for inspection.
- Failure cleanup is restricted to a still-generating action. Preparation requires a still-generating, owned, running row and verifies that one was actually returned. A late provider result cannot silently resurrect an expired action or report a nonexistent preparation as success.
- Notifications retain the existing world-worker delayed-message/push sweep and deduplication. Recovery does not issue a new or fabricated notification. Existing RPC stale-turn, state, message and calendar checks remain authoritative; database errors can still defer delivery until the migration issue is resolved.

No schema migration, new provider, frequency rule or paid background action is added. No existing user data was changed during development.

## Safe manual acceptance after reviewed deployment

1. Photos → **Check delivery status**. Record the action ID, phase and start time. This is read-only and free of model calls.
2. For `generating` under five minutes, allow the original request to finish and check status again. Do not send repeated photo requests.
3. For `prepared`, choose **Recover existing request**. Confirm that the existing response appears once through its ordinary visibility delay and normal notification process. No image regeneration should occur.
4. For an expired `generating` reservation, recovery releases the conversation only. It retains the original action as failed so that retry cannot charge it again. A new preview and explicit share action are required for a genuinely new request.
5. For `voice_prepared`, complete/end the relevant call through the normal call workflow. Unknown phases remain blocked and should be inspected.
6. Preview a new opportunity and, if desired, explicitly ask the character to share. Willingness, identity, scene, privacy, frequency and budget protections still apply.

Local mocked regression tests cover read-only diagnostics, active/expired requests, owner isolation, expiry/preparation and expiry/delivery races, repeat recovery, retained action uniqueness, preserved voice/unknown states, rejected late provider results, failure cleanup and preview blocking before model calls. They do not establish the state of the screenshot's live request or prove live Android/push/provider delivery. Those acceptance checks require the reviewed app and working database migrations; no production deployment is performed here.

Validation: 32 focused reservation/delivery/preview tests passed; the full application suite passed **823 tests** with 39 opt-in database tests skipped. TypeScript and production build passed. Focused lint on the new reservation tests and updated delivery-error test passed; repository-wide lint is not claimed. No live provider calls, production database changes, migrations or deployment were performed. Android interaction and live delivery remain manual acceptance checks.
