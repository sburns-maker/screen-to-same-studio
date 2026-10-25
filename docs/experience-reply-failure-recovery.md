# Diagnosing interrupted in-person replies

The Claire / Paper & Fern screenshot shows the earlier refresh/revision UI is
installed. The outing is interactive and a user contribution has been recorded;
the next scene step failed. It does not establish whether the failure came from
calendar synchronization, current-scene storage, the model, output validation or
final persistence. The workspace has no authenticated live database/log access.
This branch does **not** claim that the live underlying failure has been found or
fixed from the screenshot.

Previously the experience catch block hid most errors behind one generic message,
left the failed operation with no diagnostic, and labeled scheduling preparation
as model generation. Refresh lost the only detailed error. The recovery controls
were also below the full scene history.

## Changes

- Separate calendar synchronization, context, scene synchronization, generation,
  calendar-action preparation, validation, reconciliation and final-save phases.
- Map known errors to reviewed codes and messages. Unknown errors disclose only
  their phase and operation reference; never SQL, prompts, model bodies or headers.
- After the authoritative failure RPC, best-effort save `{failure:{version,phase,
  code}}` in the existing operation `result` JSON. The update is fenced to owner,
  experience, operation, original token and failed status; it cannot change a
  retried/running/completed job. This diagnostic is not an outcome or a memory.
- History reads sanitize the diagnostic, remove raw result JSON and return it only
  for the owned failed operation. Running/completed operations do not show an old
  failure; pre-existing failures without metadata remain unknown.
- Place pending recovery controls above history. Display the saved failure and
  reference after refresh. Preserve the same action ID, body, existing attempt
  limits and explicit-retry flow. No automatic paid retries or generated fallback
  dialogue, and no weakened calendar validation, intimacy boundaries or leases.

No migration, provider/model change, completion or memory rewrite. No production
changes or deployment. These server-side metadata writes take effect only when
the reviewed code is deployed and a new failure occurs.

## Tests and live follow-up

A local database-engine regression sets up Claire's 4 PM book club at Paper & Fern,
claims it at 5:09 PM, records a reply, injects a provider failure, reloads the saved
failure and retries with the same ID. It verifies one user contribution, one final
character response, no completion/memory/relationship award, denial for another
user, and no repeated inference after successful replay. Model responses are
mocked; this is not reproduction of the unknown production failure or live audio.
Unit/UI tests check sanitization, distinct phases, durable display and no automatic
retry merely from opening the page.

For the existing failure, obtain the server log entry `[living-experience]` near
October 25, 2026, 5:09 PM America/New_York. Share only operationId, phase and reason
(or the new code). After deploying reviewed changes, a subsequent failed explicit
retry should show a saved cause/reference directly. Do not recreate, complete,
reset or clear the outing or its operations as a diagnostic workaround. A
successful mocked retry is not proof that live Claire replies now succeed.

Validation: 887 full-suite tests passed; 48 optional PostgreSQL tests skipped.
Focused reply recovery tests passed, including the Claire fixture; TypeScript,
focused lint, production build and diff checks passed. Provider failures/responses
are mocked. Existing billing/access 402/403 signals remain visible to the world
worker's spending circuit breaker. No live acceptance was performed.
