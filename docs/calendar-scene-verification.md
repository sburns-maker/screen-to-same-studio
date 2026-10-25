# Calendar and live-scene verification

Reviewed GitHub/Lovable main at `0971f01` (includes PRs #71 and #72), then synchronized the newly merged photo-delivery logging fix through `7afbcc3` (PR #73). This work is isolated on `fix/calendar-scene-verification`. No production queries, data edits, migrations or deployment were performed.

## Architecture retained

`social_plans` remains the authoritative event. Messages and experience-channel dialogue produce evidence-backed actions via `calendar-coordinator.server.ts` and the service-only scheduling RPCs. `calendar_action_receipts` deduplicates effects; Plans, conversation context and availability read the canonical records. The existing text/media outbox commits structured actions with delivered replies. Living Experience claims and completion share the per-user calendar transaction lock, retain independent ownership and synchronize one outcome with calendar/memory state.

Migration 0039 already separates `living_experiences.live_scene` and its source-backed transition ledger from historical calendar venue/title. The latest actual user journal transitions guide the experience prompt; calendar provenance does not relocate the character. Existing photo context also consumes this live scene. No second character brain, calendar or location store was introduced.

## Findings and repairs

1. A newer manual editor bypassed the canonical contract. It used direct updates, unconditionally cleared missing details/conflicts and could mark both parties accepted. It separately updated RSVPs and experience timing without a shared transaction, version fence or retry receipt. That could produce false Confirmed states, duplicate retry effects or an edit racing a claimed date.

   **Repair:** migration `0040_transactional_plan_edits.sql` adds a service-only `calendar_edit_plan` RPC. It uses the existing per-user calendar lock, row ownership/version checks, actual user-message evidence, canonical `calendar_apply`, receipts and `experience_seed` reconciliation in one transaction. Stale versions and mismatched request reuse fail safely. Claimed, paused, completed and terminal outings cannot be edited. Unknown venues and conflicts go through the existing validation; no conflict list is manually erased.

   Existing mutual agreement survives a title-only correction. Changing a time, duration or established venue is a counterproposal; it never forges the character's acceptance. The checkbox now says **I accept these details**. The ordinary character engine receives the actual edit message and can respond through the existing turn pipeline; a provider failure leaves the edit saved and pending. Replaying an edit does not re-invoke that turn. The UI refreshes the shared agenda, uses a stable action ID and expected version, and recovers its save button after failure.

2. Manual edits used a second Eastern-time converter that guessed an offset and mishandled DST boundaries. The editor now uses the same strict `zonedInstant` implementation as conversation scheduling. Impossible dates, spring-forward gaps and fall-back ambiguous clock times require clarification instead of silently choosing a time. Duration bounds now match the canonical contract (15–360 minutes).

3. Live-scene persistence was already implemented, but `activeCommitment` could abandon an interactive/paused outing after its old calendar end and bounded catch-up interval. Baseline schedules could then win in downstream context despite protected experience ownership.

   **Repair:** the protected interactive/paused experience retains its latest confirmed location/activity across real days until explicitly resolved. Original calendar metadata remains unchanged. Completion still uses the existing bounded post-outing context; no later travel, attendance, dialogue, relationship gain or private-home entry is invented.

## Verification

Automated tests use actual SQL persistence with mocked paid models. Existing scenarios cover both invitation directions, acceptance, awaiting details, negotiation, cancellation, same-event updates, scheduling conflicts, linked follow-ups during an active outing, calendar/memory synchronization and ordinary non-romantic plans.

New regressions additionally cover:

- Title correction preserving existing agreement, one canonical ID and replay receipt.
- Changed-time reconfirmation and matching experience start/deadline after acceptance.
- Missing venue remaining Awaiting details; genuine cross-character/player overlap remaining visible.
- Invalid venues, foreign ownership, stale revisions, changed action reuse, paused experience protection and transactional rollback.
- The shared DST converter and no persisted edit evidence for invalid local times.
- Real PostgreSQL multi-connection reschedule-versus-claim races, concurrent duplicate edits, service-only grants and owner rejection.
- The existing park → Valley Table → car → home/front-door sequence, refreshed scene state, replay, pause/resume and preserved original calendar provenance.
- Interactive and paused home scenes staying authoritative after several real days.
- Editor failure feedback, version/action-ID requests and canonical agenda invalidation.
- Migration 0040 leaves preexisting plans and memories byte-for-byte unchanged in the test fixture; it performs no backfill.

## Review/deployment requirements

Review migration **0040 after 0039** through Lovable's normal server-side migration workflow. Do not reset data or rerun historical seed/backfill scripts. `calendar_edit_status()` returns 40 server-side when installed. No new environment variable or provider change is required. Existing Living Experience flags, canonical identity assets and AI/image budgets are unchanged. Before that migration, the new editor explicitly reports that safe editing needs 0040; it does not fall back to direct table writes.

Manual acceptance after approved deployment:

1. Character invites the player to coffee with a specific time/venue; accept in chat. Verify one Confirmed event in Plans and the conversation card.
2. Agree to book club without a venue/time. Verify Awaiting details, then supply details and verify the same event updates. Do not manually mark an incomplete plan confirmed.
3. Edit only an agreed plan's title: confirmation remains. Propose a new time: it needs the character's response. Verify the conversation and Plans then agree, and overlapping commitments remain flagged.
4. Start an outing, pause and refresh. Try editing it from another session: ownership must remain protected.
5. In the normal experience channel, explicitly complete the walk, drive to Valley Table, arrive, order/finish dinner, drive home, arrive and walk to the front door. Verify Current scene follows each actual transition, while the original calendar venue remains Juniper Commons. Resume after a pause and confirm no return to the park.
6. Finish the experience and verify one completed outcome and grounded memory. No live voice test is required for these checks.

Limits: production migration installation, scheduler health, Android behavior and real-model wording have not been verified remotely. Scene extraction remains conservative and recognizes explicit performed actions; ambiguous narrative may still need clarification. The existing automatic historical extraction is intentionally not a bulk repair of old saved records. Voice, personality refinement, travel expansion and photo-provider changes are outside this repair.

## Recorded validation

- Full suite: **799 passed, 12 opt-in PostgreSQL tests skipped** in that run.
- Separate disposable PostgreSQL 17 run: **12 passed**, including migration application through 0040, real concurrent edit/claim arbitration and duplicate edit receipts.
- Focused calendar, scene and editor regression run: **54 passed** (the full suite additionally exercises the unchanged scene-delivery and memory workflows).
- TypeScript, production build, focused lint on every changed implementation/test file and `git diff --check`: passed. Repository-wide historical lint debt is not represented as passing.
- CI now covers these calendar/scene integration and UI tests; the existing PostgreSQL workflow runs the migration/transaction tests.
