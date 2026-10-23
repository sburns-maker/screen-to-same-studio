# Memory → Plans reconciliation (separate feature branch)

This branch is intentionally isolated from Voice Studio and **does not modify live data**.

## Implemented
- Pure preview function scans prior character memories for explicitly confirmed commitments, matches an existing plan in the *same conversation and event category*, extracts supported absolute or conversation-relative dates, local times and known venue keys.
- Never creates new plans or overwrites existing fields.
- Marks conflicting calendar details, inconsistent memories and ambiguous Eastern local times for human review.
- Tests for historical Tess dinner confirmation, speculative statements, wrong conversations and calendar conflicts.

## Next implementation stage (not included)
- Developer-only authenticated endpoint to load bounded historic memory rows and live social plans with account-scoped filters.
- Review screen showing full source-memory text, proposed field changes and explicit select/approve actions.
- Server-side conflict recheck and auditable, transactional commit using the calendar's supported RPC/contracts. Do not directly bypass calendar_apply scheduling/state invariants.
- Explicit confirmation and idempotency so repeated clicks do not duplicate or overwrite decisions.

**Do not merge/deploy this partial implementation while Lovable is completing the voice features.** Source code only. No migration, queries, production setting or data mutation was performed.

## Historical test case
Tess's October 21, 2026 memory explicitly confirms Friday October 23 at 5:30 PM at Fanelli's Italian Villa, meeting there; the current Plans UI shows dinner awaiting details. Venue recognition depends on whether Fanelli's is in the registered place catalog, so that must be validated before treating location as resolved.
