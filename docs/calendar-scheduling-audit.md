# Calendar and scheduling repair

Source reviewed: GitHub/Lovable `main` at `2952249` (fast-forwarded into the existing `feature/phase6-living-experiences` branch). No production database, deployment, or character histories were accessed or changed.

## Architecture and root causes

`social_plans` already is the canonical event table. Conversation invitations, NPC gatherings, Plans, venue participation and Living Experiences must use its existing IDs. `social_rsvps`, `calendar_transitions`, and `living_experiences` are participant responses, audit history and execution records, respectively; they are not competing calendars. Travel retains its existing trip/presence records.

The audit found these failures:

- Calendar extraction consumed visible Messages only. Real user contributions and agreements in the separate in-person experience journal never reached it.
- Text delivery and calendar extraction were separate commits. A visible reply could promise agreement while its calendar update failed later.
- Availability could recheck an already accepted appointment against the ordinary work schedule and downgrade it. The experience claim overlap check also counted unrelated, private NPC gatherings as player conflicts.
- SQL fixes 0036 and 0037 were present but absent from the migration journal. New installations could omit them. Character proposers are actual character keys, not a universal `character` literal.
- Parser patches missed direct invitations, short contextual times and some negotiated details. Arbitrary UUID ordering could reverse a user proposal and its reply when their timestamps matched, particularly during voice playback.
- Plans and conversation chips used different queries and cache refreshes. The calendar query silently truncated history at 100 records, and the screen separately rendered legacy gatherings.
- An immediate follow-up lacked a parent relationship. Updating the active plan could trip its protection, and an unclaimed child outing could otherwise be simulated while the parent remained paused.

## Implemented contract

### One event and transactional evidence

Additive migration **0038_canonical_scheduling.sql** extends `social_plans` with `description`, `time_zone`, `time_hint` and an owner-scoped `parent_plan_id` foreign key. Existing columns retain initiator, both responses, timestamps, conversation linkage, status, missing details, conflict reasons and attendance. Existing experience records retain real claim/completion timestamps and fictional appointment time; no second clock is introduced.

`calendar_event_action` validates a real, owned, visible message or actual user/character experience moment. `calendar_action_receipts` stores bounded source/action receipts, not a second event state. Stable IDs and a per-user calendar transaction lock make repeated requests and concurrent acceptances deterministic. Service-only RPC grants and owner-only receipt reads preserve tenant isolation.

A structured `schedule_actions` reply field supplements deterministic extraction. The server validates IDs, venue, exact current user acceptance evidence, duration, timezone and availability. Changed date/time/activity/duration/venue terms reset the other participant's response; an unchanged accepted appointment is not rechecked against the baseline weekly routine. Both participants' acceptance plus complete, conflict-free details confirms the event automatically. Missing or ambiguous details stay pending. A proposal alone never grants the other person's consent.

Text/media outbox delivery now commits scheduling effects in the same transaction as its existing messages, state, memories and delivery receipt. A calendar write failure rolls back the response and relationship change; the prepared turn can be delivered again without a new model/image generation. Turn-based phone replies retain the existing playback acknowledgement before committing. Already committed experience operations cannot acquire new effects from a changed replay payload.

A read-only, idempotently refreshed memory projection identifies confirmed/canceled/rescheduled plan context explicitly as **not proof of attendance**. Actual completed-experience memory and relationship effects still belong to the existing single-outcome experience transaction. There is no historical backfill or relationship award for accepting an appointment.

### Experiences and availability

Actual user contributions are evaluated from the in-person journal, using its fictional clock. The character reply uses the existing authoritative character engine and structured scheduling contract; it is not inserted into SMS. Quoted in-person dialogue also supports the legacy deterministic fallback.

A walk followed by dinner creates a new child plan, preserving the walk's ownership and recorded choices. `after_parent` means the parent's planned end plus the existing travel buffer, not fabricated user attendance or travel. The child requires its own mutual acceptance and venue. A paused parent blocks both manual child claims and autonomous simulation. After recorded parent completion, a bounded continuation window allows the linked outing to begin at its fictional scheduled time. No background job can steal the parent.

Availability checks use canonical accepted user commitments and the character's accepted legacy RSVPs, including travel buffers and activity duration. Other characters' private meetings do not block an unrelated contact's experience. Prompt context includes only that character's plans and redacted player busy intervals, not other conversations' details.

The existing scheduled world worker still calls calendar synchronization and the bounded experience worker while the app is closed. There is no new browser-dependent scheduler or continuous AI loop. Production cron installation/health has not been remotely verified.

### Time and UI

Shared IANA conversion handles Eastern daylight saving time and rejects ambiguous/nonexistent wall times. Relative dates use the source message timestamp in America/New_York, or the experience's fictional timestamp. Approximate times such as “after lunch” remain hints. Bare contextual times retain the existing daytime/evening inference; ask for AM/PM if this interpretation is not intended. “Next Monday” means the upcoming Monday, or seven days later when the source date is already Monday.

Plans now offers month/week/agenda views, invitations, active experiences, history, participants, venue/travel links, missing details and conflicts. Manual creation sends an explicit invitation; it does not assume character acceptance. Conversation chips use the same canonical query. Accepted plans do not require another Accept button. Active experiences link to their protected controls instead of exposing conflicting calendar mutations.

Owner-filtered Realtime subscriptions and shared query invalidation update screens after changes; polling/focus refresh remains a fallback. The SQL adds tables only to an already existing `supabase_realtime` publication. No public buckets, GPS behavior, provider settings or photo paths were changed. Developer-authorized Calendar scheduling diagnostics show event versions, responses, dependencies and persistence receipts.

## Files and module boundaries

- `calendar-contract.ts`, `calendar-coordinator.server.ts`, `calendar-time.ts`: structured actions, validation, source adapters and date conversion.
- `interactive-world.server.ts`, `calendar-logic.ts`: existing calendar lifecycle, canonical availability, bounded source queue and deterministic fallback.
- `calendar-store.server.ts`, `scheduling-agenda.server.ts`, `scheduling.functions.ts`, `use-schedule.ts`: common owner-scoped reads, invitation API and cache synchronization.
- `tess.server.ts`, `tess.functions.ts`, `living-experiences.server.ts`: shared intelligence and atomic scheduling integration, keeping channels separate.
- `CalendarBoard`, `ConversationPlans`, `SchedulingDebug`, authenticated routes: calendar views, scene continuation and developer diagnostics.
- `live-calls.functions.ts`, `live-calls.ts`: existing live voice reads canonical availability/calendar context. Its existing lack of a calendar write tool remains explicit.
- Small unrelated baseline corrections: travel's already used `followUp` input is validated, the arena header no longer passes an unsupported prop, experience recovery uses the selected scene, and UI mocks include the existing recovery function.

## Review and Lovable configuration

1. Review the feature branch and migration. Do not merge automatically.
2. Have Lovable inspect the **actual database migration ledger and function definitions**. The journal now registers 0036 and 0037 in addition to 0038. If 0036/0037 were manually applied, reconcile their ledger entries; do not blindly rerun their non-idempotent definition patches. Never edit an applied migration to replace production history.
3. Once approved, apply missing migrations in order through **0038**, in one transaction per migration using Lovable's server-side migration workflow. Do not reset tables, recreate histories or bulk re-extract old conversations. Production execution was not performed here.
4. Deploy the reviewed application only after schema validation. Existing server secrets remain required (`OPENAI_API_KEY` and existing Supabase server configuration); no new secret or paid provider is introduced. Preserve `LIVING_EXPERIENCES_ENABLED=true` if outings are enabled. Preserve the existing world-worker schedule, lease and budget configuration.
5. Verify `calendar_contract_status()` returns 38, `experience_status()` returns 26, and the developer Calendar scheduling pane says ready. Check RLS and scheduler health in the deployment, not just the editor preview.

## Manual acceptance

Use a test account; do not reset production memories.

1. Ask Maya for coffee at a specific available future date/time and known venue. Her agreement should confirm one event. Refresh Plans and the chat; IDs and status must agree.
2. Let a character propose an outing; accept in chat. No second manual confirmation should be needed. Try a missing time and then negotiate it: the same event stays pending until both agree to complete details.
3. Make a genuine overlapping proposal to another character. See the conflict without disclosing the first conversation. Reschedule and accept; then cancel and verify the original ID remains.
4. Start an eligible Riley walk at Juniper Commons. Ask about burgers afterward at Valley Table. Verify a linked meal plan, no alteration of the walk, and no false conflict with that parent. Pause and refresh. The worker must not advance either protected parent or dependent child. Finish the recorded walk, then use Continue your outing to enter the meal.
5. Complete an experience and check its single outcome, status, actual journal and later character memory. No hypothetical attendance or automatic romance should appear.
6. In Android Chrome and the installed PWA, verify calendar/week scrolling, navigation, pause/resume and cross-device refresh. Automated responsive markup tests are not physical-device acceptance.
7. Close the app and inspect the scheduled worker processing a due, unclaimed test outing. This is a deployment acceptance check, not something local tests prove.

## Limits

- Live Realtime calls retain their existing instruction to discuss new plans provisionally and confirm through Messages; this change does not add a live voice scheduling tool or falsely claim spoken changes were persisted. The older turn-based voice path remains integrated after playback.
- Ambiguous natural language can still need clarification. Structured character actions are primary; deterministic extraction remains a fallback for real user text. No unreviewed replay of historical messages is performed to repair previously missed plans.
- Canonical history is paged with an explicit 10,000-event safety limit. Other existing experience/media history bounds remain; this is not an unlimited history redesign.
- There is no external reservation, email/host lookup or address-verification service. Registry availability does not prove a real booking.
- Automated paid-provider mocks prove transaction and orchestration behavior, not live character quality, mobile hardware behavior or production scheduler health. No paid generations were made during tests.
- No new AI calls are required for scheduling: actions ride the existing dialogue call, and routine synchronization is deterministic SQL/TypeScript. No model/provider or spending limit was changed.

## Validation results (2026-10-24)

- Full `npm test`: **756 passed**, with the 7 opt-in external PostgreSQL cases skipped in that run.
- Separate PostgreSQL 17 transaction run: **7 passed** against a disposable localhost database, applying all repository migrations through 0038. Includes observed lock contention between competing claims/acceptances, reconciliation rollback, replay safety, RLS and service RPC permissions.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; build artifacts were not deployed.
- Focused ESLint on all new scheduling modules/components/tests: passed. `git diff --check`: passed.
- Full `npm run lint`: still fails repository-wide formatting/type-lint debt. The preexisting travel module alone has 13 non-formatting errors, reproduced directly from `origin/main`; that unrelated cleanup is not bundled into this repair. The overall lint command is not reported as passing.

The regressions include approximate rescheduling losing its old precise time, real historical-record preservation through migration, protected Riley walk → burgers continuation after a multi-day pause, safe address/time follow-through receipts, actual text-outbox delivery failure/recovery without another model call, canonical agenda privacy, and calendar UI/conversation status consistency. A late parent completion persists a fresh four-hour child claim window; adjusting it uses the recorded parent completion as the anchor while preserving fictional appointment timestamps.

Scheduling-action replies become visible once generated so their actions and reply commit together. Ordinary delayed reply behavior is unchanged. All paid providers were mocked; live provider quality, physical Android/PWA behavior and production cron delivery remain manual acceptance checks.
