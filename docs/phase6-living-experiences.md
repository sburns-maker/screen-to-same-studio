# Phase 6 — Living Experiences: architecture and first implementation

## Vision
A plan can be experienced as a natural interactive shared outing or allowed to progress off-screen. It is not a move-by-move game. Integrate with existing calendar, venues, in-person activities, character brain and memory.

## First committed slice
`src/lib/experience-lifecycle.ts` is a pure, testable lifecycle contract with matching unit tests. It supports scheduled -> interactive -> paused -> interactive -> completed, and scheduled -> auto_running -> completed; cancellation only before claiming. A configurable `claimDeadline` (e.g. start + 4h) allows joining a planned dinner late with no relationship penalty.

**Critically, this is NOT a runnable live experience yet.** It contains no database schema, RPC, background worker, UI, new prompts or live plan writes. No production behavior has changed. Review and implement the remaining architecture below before merging for release.

## Required next phases
1. Add an additive experience table keyed uniquely by user and plan, with status, immutable claim timestamp, version, owner/conversation, summary of confirmed progress, deadline, and unique outcome; enforce user/account isolation.
2. Add service-side **transactional** `claim`, `auto_claim`, `pause`, `resume`, `finish`, `finish_remainder` and `cancel` SQL RPCs. Conditional compare-and-swap on state/version ensures the background worker and user cannot both win. Unique outcome/event key prevents duplicate plan, memory or relationship writes. Row locking must protect claim.
3. The world worker should only auto-claim an untouched scheduled experience **after** the configured start window ends; it must never auto-progress interactive or paused scenes. Auto-simulate only after acquiring the DB claim atomically, with idempotent retry.
4. User-facing Plan action: Experience / Let it unfold / Skip & Simulate. Once started, show an in-person conversation scene with concise environmental descriptions, free text, time-skips between meaningful beats and optional photos. Pause/resume independent of device session.
5. Reuse canonical character runTurn, existing memory, relationship and world/venue activity context. Ensure spoken/in-person dialogue is not silently sent as ordinary SMS; store session events separately and save only confirmed shared events into long-term memory.
6. Natural romance may happen by mutual cues and established context, but never force a kiss or invent an unearned milestone on auto. No explicit predetermined milestones.
7. Finish automatically after a partially played experience must summarize **only unplayed remaining moments**, preserving already recorded player actions. A single authoritative outcome synchronizes Plans, history, messages and world presence.
8. Developer preview, transactional integration tests against real migrations, background race test, and mobile regression. No deployment until these pass.

## Important concurrency invariants
- Browser timers/locks are insufficient: authoritative locks and unique constraints belong in Postgres.
- Claiming after 5:30 but before configured deadline is allowed even if real-world time passed; do not treat real-life unavailability as standing up a character.
- A claimed interactive scene never becomes auto-eligible just because the tab closed or midnight passed.
- An explicit "Finish automatically" is the *only* opt-in to complete an already claimed interactive experience off-screen.
- Do not duplicate existing Plan invitations; connect uniquely to current plan IDs.

## Additional implementation — October 23
- Migration 0025 now includes a transactional, idempotent user-contribution ledger. Contributions require a currently interactive claim and fail closed for paused/completed scenes. The endpoint is authenticated and scopes every query to user ownership.
- New server endpoints read the moment history and record a user's explicitly entered moment.
- **Still not release-ready:** the UI has not yet been expanded to display interactive moments; the character engine is not integrated; there is no background claim/finish worker; the system has no proven atomic calendar/memory completion semantics. Do not apply migration 0025 or merge the draft on this basis alone.
