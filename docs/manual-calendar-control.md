# Explicit calendar control

## Why this changed

Previously `syncCalendar` replayed queued chat through intent recognition on
calendar reads, messages, calls and world ticks. Later context could classify text
as a cancellation, detail change or reschedule. `calendar_advance` also changed
accepted events to in-progress or missed based on elapsed time. Calendar buttons
and the manual invitation form created chat messages and invoked another AI reply.
The screenshot/report does not identify the exact source message that canceled
the user's live date; no production database was accessed.

## New behavior after migration 0044

- Discuss arrangements normally. In Plans choose **Add agreed plan**, enter the
  details and explicitly check **We already agreed to this plan**.
- Save writes the existing canonical `social_plans` event and its existing audit,
  RSVP, memory and experience contracts. It creates no SMS, push or character AI
  request. Confirmation is a player report of an existing agreement, not invented
  character dialogue. Missing details and real schedule/travel conflicts remain
  visible instead of silently creating an incompatible confirmed appointment.
- Edit details and reschedule directly. A new explicit agreement checkbox can
  confirm changed terms; ordinary edited proposals still require agreement.
  Confirm/decline/cancel actions stay in Plans and send no message.
- Automatic message/voice/experience extraction returns no scheduling mutations.
  The database rejects automatic evidence by returning an unchanged result, so
  older workers and prepared replies cannot cancel, reschedule or alter records.
- Calendar maintenance updates companion presence for accepted schedules but
  never rewrites plan status or terms based on elapsed time. Explicit recorded
  venue participation can start an outing with the existing arrival/consent
  checks. Living Experiences retain their existing claim, pause, completion and
  configured off-screen simulation lifecycle; their genuine outcomes can still
  complete plans. Other world activity, NPC meetings, calls and photos continue.
- Existing canceled records are **not automatically restored**. Review them and
  explicitly record the still-agreed date; do not turn a genuinely declined plan
  into a confirmed one or overwrite its historical cancellation.

## Architecture and safeguards

0044 adds a service-only manual-action audit, separate from conversation messages.
It extends the existing `calendar_event_action` source handling with a guarded
catalog update; it does not replace event validation or introduce another event
store. Unknown installed function contracts abort the migration transaction.
Only manual evidence reaches canonical mutation. Owner authorization, explicit
agreement, calendar advisory locks, revision checks, active-experience guards,
stable action IDs, conflict/travel checks and strict local time validation remain.
Retries return the same receipt; different requests cannot reuse an action ID.
New RPCs and audit data are unavailable to browser roles. No portraits, messages,
memories, relationships or old event records are deleted or rewritten.

## Deployment

Review and merge this branch, then run the normal migration runner through
`0044_manual_calendar_control.sql`, then build/publish the matching app. **0044 is
required**: before it is installed the app deliberately retains its legacy
calendar contract for compatibility. No production migration, merge or deployment
was performed by this task. Do not edit historical migration files or manually
mark 0044 applied. The old calendar38 compatibility preflight targets the archived
0034→0042 reconciliation, not an installed 0044 schema whose function changes are
intentional. Use the normal ledger/runner for subsequent migrations.

## Validation and manual checks

Tests cover quiet agreed-plan creation/edit/cancellation, replay deduplication,
queued cancellation and stale structured replies, unchanged plans after elapsed
time, safe companion presence, explicit venue entry, missing details, conflicts,
DST gaps, tenant rejection, active ownership, UI agreement confirmation and saved
historical records. Paid providers are not invoked. PostgreSQL transaction tests
exercise concurrent agreement conflicts, edit/claim races and restricted RPCs.
The actual Drizzle-runner suite separately tests archived reconciliation through
0042 and full current-head installation/reconciliation through 0044.

After deployment: agree to a coffee/date in chat; add it in Plans; confirm no
extra user or character message appears; refresh Plans and let a tick pass; verify
its title/time/status are unchanged. Edit or cancel explicitly, then verify
conversation context reflects the canonical record. Live mobile acceptance is
still required. Manual calendar actions add no inference/image charges.

Validation results: 897 application tests passed; 50 opt-in PostgreSQL tests were
skipped in that run and all 50 were then executed separately against disposable
PostgreSQL 17 databases (12 transaction tests + 38 actual-runner/compatibility
checks), all passing. The final guarded migration also passed 8 local database
integration tests. TypeScript, focused lint, production build and diff checks
passed. No live production/UI acceptance or paid model call was performed.
