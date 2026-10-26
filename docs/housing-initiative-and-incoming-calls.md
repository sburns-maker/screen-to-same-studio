# Housing initiative and incoming-call audit

## Findings

Housing has no separate chance-per-tick or daily invitation quota. Characters can emit grounded `housing_actions` during ordinary messages, autonomous messages and experiences. The worker applies persisted housing actions/moves; it does not run an independent model to invent a housing proposal each tick. Previously the housing context emphasized permissions without much encouragement to initiate ordinary home activities.

The shared housing context now explicitly permits characters to initiate cooking, movies, games, gatherings and casual visits when relevant, and offer their own address during visit planning. Friendship is sufficient context for hosting when the character wants it; scores never authorize access. Unanswered invitations must not repeat. Tentative moving wishes can arise from relevant circumstances, but major move/cohabitation proposals still need a grounded reason, all necessary consent and explicit player approval. This is model guidance, not a measured live initiation rate or a guarantee of invitations. No extra inference loop or paid call was added. Actual spontaneous housing frequency must be assessed in staging with real dialogue.

Incoming calls had three remaining Real-Time gates: due callbacks, spontaneous offers and developer test ringing. All are removed. Muting, opt-out, transcript consent, quiet hours, availability, occupied presence, six-hour per-contact spacing and database caps remain. Quiet-hours and presence lookup failures fail closed. Spontaneous offers and developer diagnostics now use one shared eligibility evaluator and one pure hourly selection function; callbacks retain their separate source-quote proof and priority. Failed RPC offers now mark the worker checkpoint failed rather than masquerading as ordinary nonselection.

Selection stays at the existing 12% base chance per eligible hourly slot, multiplied by character initiation tendency: Tess 12%, Maya 18%, Claire 13.2%, Jordan 6.6%, Ben 14.4%. Polling does not reroll. These percentages are opportunities, not guarantees or observed delivery rates. No rate increase is justified until production execution and provider setup are verified.

## Important service mismatch

The conversation Call button opens GPT-Live / Voice Studio. Autonomous incoming offers currently belong to the separate OpenAI speech-chain service. Working GPT-Live does not configure incoming calls. Studio voice assignments do not configure the speech-chain voices. This patch does not silently replace the established incoming audio transport or switch models.

Riley lacks a `phone_contacts` / fictional-number allocation for the speech-chain service. Shared evaluation now skips her explicitly rather than trying a doomed offer. She remains supported by the separate live-call service. Provisioning her incoming voice/number requires a reviewed backend addition; this patch does not promise she can call.

Incoming offers require the existing speech-chain setup:

- `ENABLE_INCOMING_VOICE_CALLS=true`, `ENABLE_VOICE_CALLS=true`, `VOICE_PROVIDER_VALIDATED=true`.
- Server-only `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_SPEECH_MODEL`.
- Valid distinct `VOICE_TESS`, `VOICE_MAYA`, `VOICE_CLAIRE`, `VOICE_JORDAN`, `VOICE_BEN` values.
- Positive `VOICE_DAILY_BUDGET_CENTS`, `VOICE_MONTHLY_BUDGET_CENTS`, `VOICE_TURN_RESERVATION_CENTS`.
- User Calls preferences enabled, incoming enabled and transcript consent explicitly granted.
- A working authenticated `/api/public/jobs/world-tick` scheduler. Local tests do not establish that production cron runs.

No secrets, provider flags, permissions, budgets or user preferences are enabled by this patch.

## Worker evidence and manual verification

Each processed user receives a service-only `world_control` checkpoint keyed to their user ID, containing only last-check timestamp, offered boolean and failure boolean. It runs independently of text inference budget. Developer-authorized Calls diagnostics read only the caller's checkpoint; no global job payloads, transcripts or other users' records are exposed. Current eligibility is a read-only snapshot, not a historical explanation of every skipped hour. Checkpoints begin with the new worker deployment; absent old checkpoints do not prove the scheduler never ran.

After normal review/deployment, open Simulation Debug → Calls and refresh eligibility. Check global blockers, hourly selection, per-contact availability and last worker call-check timestamp. Trigger a developer ring with a Practice-mode unmuted supported contact to verify the in-app UI without requiring Real-Time. Declining or letting it expire makes no provider request; answering can incur the existing audio charges.

Incoming ringing is only an in-app banner while the app is open. The app does not implement native background incoming ringing or incoming-call Web Push. Closed-app offers can expire as missed calls. GPT-Live incoming integration, Riley provisioning and background call notifications are separate follow-up work.

## Persistence and release

No migration, production data change or historical migration edit is needed. Existing housing privacy/consent enforcement, memories, calendar behavior, image pipeline, voices, phone-session limits and transcript controls are preserved. No deployment or live paid test was performed.

## Automated validation

- Full default suite: 952 passed; 55 opt-in tests skipped. These include SQL-backed PGlite integration tests, not live production calls or cron verification.
- Focused phone/CallsDebug/housing/offline-world suite: 57 passed. Separate world/live-call regression suite: 32 passed. Phone suite rerun after failure-reporting adjustment: 20 passed.
- TypeScript and production build passed. Focused ESLint passed; existing densely formatted phone/world files were checked with only the Prettier rule disabled. Repository-wide historical lint debt is not reported as resolved.
- Tests cover a Practice-mode spontaneous persisted ring, no reroll/duplicate after decline, Practice-mode promised callback and developer ring, quiet hours, muting, occupied presence, opt-out, developer authorization, cross-user checkpoint isolation and worker execution evidence with zero autonomous inference budget.
- Housing tests verify the shared initiative guidance and existing privacy/consent/persistence contracts; they do not measure live model invitation rates.
