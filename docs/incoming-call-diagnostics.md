# Incoming-call readiness and developer test ring (PR #71)

This extends the existing in-app **OpenAI speech-chain phone service**, surfaced by CallsDebug. It does not change the separate GPT-Live/Voice Studio system, character memories, voices, providers, world-worker cadence or incoming-call probability.

**Current update:** incoming calls no longer require Real-Time text mode. See the Practice-mode section below.

## What changed

- Read-only, developer-authorized diagnostics show server and user switches, transcript consent, quiet hours, current contacts' Real-Time/mute state, availability, occupied presence, six-hour call pacing and deterministic hourly selection. Character-specific reasons are readable; no secrets or raw provider payloads are returned.
- Diagnostics use `phoneSnapshot(..., false)` so checking readiness cannot sweep/complete an existing call. The ordinary phone UI keeps its existing cleanup behavior. Expired but unswept active records are conservatively reported as active until normal cleanup runs.
- A confirmed developer test creates one normal 25-second incoming ring through `phone_command`. It is explicitly marked developer-triggered, never presented as an autonomous character decision. It respects the incoming server switch, user opt-in, transcript consent, quiet hours, mute settings, availability and occupied presence, plus existing database caps and one-active-call constraint.
- The developer control supplies a stable request ID, disables repeated clicks while pending and retains that ID after uncertain failures. Replaying a recorded request cannot ring again or create paid processing. The existing PostgreSQL transaction and unique constraint arbitrate competing requests.
- No model requests occur during diagnostics, ringing, decline or expiry. Explicitly answering can use the existing paid speech workflow and its existing limits. The test bypasses hourly random selection and recent-call pacing only; it does not raise database spending/session limits.
- Main's canonical shared `tess` message-sender contract and conversation-scoped callback proof remain intact. No database migration is introduced by this PR.

## Configuration and safe manual test

Use existing server-side configuration; never put API keys in browser variables:

- `ENABLE_DEV_PHOTO_ACTIONS=true` and `DEVELOPER_PHOTO_USER_IDS=<your account UUID>` authorize these existing developer tools.
- The speech-chain provider must already be configured and validated: `ENABLE_VOICE_CALLS`, `VOICE_PROVIDER_VALIDATED`, `OPENAI_API_KEY`, transcription/speech model and per-character voice configuration, and existing voice budgets. See `docs/phone-calls-phase5.md` for the full provider setup.
- `ENABLE_INCOMING_VOICE_CALLS=true`, plus the user's Calls settings: enabled, incoming permitted, transcript consent. No preferences are silently enabled by this feature.
- Existing migration 0023 and the phone service's normal database dependencies must already be installed. This PR adds no new migration.

After reviewing and deploying the branch through the normal Lovable workflow:

1. Open the chosen contact's Simulation Debug → Calls → Incoming call diagnostics and test ring.
2. Refresh eligibility. Check the global and per-contact reasons. A successful snapshot does not prove the production world worker ran or that a paid audio session works.
3. Use an available, unmuted Real-Time contact outside quiet hours. Select **Trigger one test incoming ring**, then approve the explicit confirmation.
4. For a no-generation test, decline or let the 25-second ring expire. Verify one matching Recents record. Do not answer unless you want to test potentially billable audio.
5. To validate automatic calls separately, confirm the backend world scheduler is deployed and running. This control does not invoke or replace the world scheduler.

A contact without a provisioned number for this calling service (currently including Riley in the bundled phone directory) is reported as unsupported instead of promising a working ring. This does not change eligibility in the separate live-call system. Enabling additional speech-chain contacts requires its own reviewed phone-directory/backend support.

Automated tests mock paid providers and use a disposable SQL database. Android/PWA notification/audio hardware and a live provider conversation remain manual acceptance checks. No production deployment, credentials changes or paid calls were performed during this work.

## Validation

- Full suite: **787 passed, 9 opt-in PostgreSQL tests skipped**.
- Focused call/UI suite: **19 passed**, using actual SQL persistence and mocked paid providers.
- TypeScript, production build, focused ESLint and `git diff --check`: passed.
- The existing optional external-PostgreSQL transaction suite was not rerun for this application-only change. Repository-wide historical lint debt is not represented as passing.


## Practice mode and incoming calls

Spontaneous incoming calls, source-grounded promised callbacks and explicit developer test rings are now independent of `conversations.real_time_mode`. That flag controls text timing. Incoming calls still use actual server time, actual availability, quiet hours and a stable hourly choice; advancing Practice interactions does not fast-forward call cooldowns or provider sessions.

No call preferences are enabled automatically. Existing calling/incoming opt-ins, transcript consent, server/provider readiness, supported fictional phone contacts, mute/presence, six-hour per-contact spacing, one-active-call protection and provider/session spending limits remain. Quiet-hour/presence lookup failures fail closed. Contacts without a number in this specific speech-chain service remain unsupported and are skipped rather than stopping other contacts. The separate GPT-Live/Voice Studio provider is not changed or automatically enabled. No public telephone routing or production scheduler change is introduced.

Diagnostics still show the text mode as information, with an explicit note that either mode allows calls. A developer test ring is still labeled as a test and incurs no model/speech generation until answered. Automated integration tests cover both mode values, duplicate offers, incoming opt-out, quiet hours, mute, owned contacts, callbacks and provider mocks remaining untouched during ringing. Live Android/background notification acceptance still requires the deployed application.
