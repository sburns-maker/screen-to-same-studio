# Living Experience revision recovery

The screenshot's “Experience changed or is unavailable” text was a catch-all for
many RPC failures. It did not prove an experience was deleted, nor identify a
particular live database failure. No live database was accessed for this repair.

The UI independently polled the outing list every 15 seconds and the selected
history every 5 seconds. The displayed conversation could therefore be newer
than the revision sent with an action. The selected scene, controls and action
now use the highest revision from these two owner-scoped reads. Successful action
results immediately update the list cache without replacing a newer revision.
Postgres still enforces all ownership, revision and idempotency checks.

Reviewed errors now distinguish revision conflicts, an in-flight response,
pending-scene recovery, moment limits and unavailable state transitions. Unknown
errors stay sanitized. The refresh action reloads the saved outing and history,
preserves the draft, and never automatically repeats a paid request. Durable
action IDs remain stable on explicit retry. No schema or migration changes.

Regression coverage includes history/list revision skew, retaining typed text
after rejection, refresh without automatic replay, and a database-engine test:
claim → stale turn rejected without inference or moments → read current revision
→ explicitly retry same action ID → exactly one user moment and model call.
Database-engine integration uses local PGlite; external AI is mocked.

Manual check after review/deployment: reopen an existing interactive outing,
continue it, refresh between turns, and pause/resume. If another device changes
it, the next rejected action should explain the conflict and preserve the draft.
Refresh saved outing and retry explicitly. Never recreate or auto-complete an
outing to recover from a stale screen. Live Android and production acceptance
remain untested here. Nothing was deployed and no production records changed.
