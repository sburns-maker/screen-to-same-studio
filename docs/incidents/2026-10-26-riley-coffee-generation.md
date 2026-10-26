# Riley coffee outing — rejected generation request

Reference: `b1c8ef87-ed85-4106-97fd-973a7c204332`. Scheduled October 26, 2026, 4 PM America/New_York at Switchyard Coffee. Last saved action agreed to continue the afternoon at Juniper Commons.

## Evidence and limits

The user supplied a Lovable diagnostic report: `[living-experience]` phase `generation`, code `model_unavailable`; corresponding `[character-ai]` `provider_http`, HTTP **400**, model **gpt-6-luna**, operation **reply**, timestamp `2026-10-26T21:05:49.671Z`, with earlier rejections. Lovable reported operation `failed`, attempts **2/3**, action saved in both operation body and moment ordinal 50, and 50 saved moments/current interactive context retained in experience `2da55d27-64ac-47bc-9ec8-403f111ac9f5`.

This is the operator's production report, not a direct production query from this workspace. No production keys, database credentials or log connector are available here. The rejected parameter/provider error code was not retained by the old sanitizer. HTTP 400 confirms rejection of the request; it does not identify whether the cause was schema, payload, model configuration or another invalid parameter. There is no evidence in this report for a 429 rate limit, 401 authentication error, timeout, local context cap or failed database completion. Do not invent the missing error body or change the model/schema speculatively.

## Trace

`experiences.tsx` sends the saved plan/action/body/revision through authenticated `experienceAction`. `generateExperience` reserves via `experience_command`, loads owned character and history, synchronizes the live scene, then calls Riley's `generateContactReply` with the shared canon/memory/relationship context and experience-channel adapter. `runStructured` submits a strict structured request through the OpenAI Responses API (`gpt-6-luna`, max output 4096, input cap 100000 characters, 60000 ms timeout, SDK retries zero). Only successful generation proceeds through schedule validation, scene checks, reconciliation and the transactional commit.

A failed attempt records sanitized failure information and marks the operation failed under its current token/status fence. The existing user moment was reserved before generation; it is not recreated on same-ID retry. Prior dialogue is not rewritten. `Retry pending scene` uses the existing pending ID and body. The database locks, operation identity/body checks, token/revision fences and completed receipts prevent duplicate player moments, accepted AI responses and outcome/relationship applications. Failed provider work may still have costs; idempotent persistence is not a promise that explicit model retries are free.

## Confirmed fix

The confirmed implementation defect was diagnostic loss and misleading temporary-outage advice: all statuses except 402/403 became the same generic error, and provider logs had no outing operation ID. Keep the model, structured payload, world history and migrations unchanged. Add a safe typed error with allowlisted provider code/parameter root/request ID, status, model and retryability; correlate the outing ID in provider logs; preserve safe diagnostics in the existing JSON failure record and display them. Existing failure records remain readable and are not backfilled. Known permanent failures are not automatically resubmitted by the experience worker. Unknown old failures direct the player to investigate rather than promising retry will solve them. SDK retries stay zero.

No live generation was triggered, no retry allowance reset, and no production record, dialogue, memory or relationship history was edited. No migration or secret changes are required.

## Retry assessment

Per Lovable, the saved scene is eligible for a same-ID retry without recovery reset. The implementation's idempotency checks were tested separately, including real PostgreSQL transactions. Nevertheless **do not consume the last ordinary attempt against the unchanged repeatedly rejected request**. Deploy the reviewed diagnostic change only through the user's normal release process; identify the provider's actual rejected code/parameter through available request diagnostics or one explicitly authorized controlled attempt after configuration review. Then use **Retry pending scene** on the existing operation. Do not resubmit the player's action as a new turn, simulate the outing to bypass the error, or unlock more attempts as a substitute for diagnosis.

The exact upstream rejection cause and a successful live recovery remain unverified.

## Automated validation

- Full default suite: **1,066 passed**, 55 opt-in skipped. An initial sandbox-only `spawnSync EPERM` in the read-only migration checker was resolved by running with subprocess support; the final full run passed.
- Initial targeted architecture/retry/provider/UI checks: 62 passed. Expanded diagnostic/provider/UI/adapter group: 83 passed, with two additional worker regression cases subsequently covered by the full run (32 worker/integration cases passed separately).
- Disposable local PostgreSQL 17: **12 actual multi-connection transaction tests passed**, including claim races, duplicate completion and atomic rollback; the container was removed afterward.
- TypeScript, production build, focused ESLint (legacy formatting rule disabled on existing files) and diff checks passed.
- Provider responses are mocked. No paid generation, production retry or direct production database validation was performed.

## Screenshot follow-up: visible diagnostics and legacy wording

A subsequent screenshot shows the new HTTP 400 classification alongside the old database summary “retry the same action safely.” That old summary describes persistence idempotency and must not imply the rejected generation will succeed. Render that exact legacy summary as neutral “review saved failure details” advice without altering its stored value.

Display the already-saved model/status/providerCode/parameter/request ID above the conversation history, so the user does not need to scroll through 50 moments. Reading/refetching diagnostics is not a generation attempt. Missing saved values are explicitly labelled “not recorded”; the UI cannot reconstruct past error bodies. Do not assume the earlier 2/3 attempt count is still current after a later attempt.

The sanitizer now accepts direct or nested error objects and uses a bounded JSON `responseBody` fallback when the SDK cannot parse its usual error envelope. Only allowlisted code/parameter roots are returned; raw messages, response bodies, prompts and credentials are never exposed. Synthetic regression fixtures use `unsupported_parameter`/`reasoning.effort` to test extraction; those are NOT claims about the actual production rejection. Exact upstream cause remains pending the saved production diagnostic fields.

Follow-up verification: **1,069 default tests passed / 55 opt-in skipped**; 65 focused tests passed; TypeScript, production build, focused lint (legacy formatting rule disabled on existing files) and diff checks passed. No production generation or retry was triggered.

## Isolated developer provider check

Because the rejected parameter is still unknown, add one explicit developer-only check of the production `replySchema` and configured model using a short fixed fictional test prompt. It sends no user dialogue/history/reference photos and discards the response. It cannot advance/finish an outing, consume an outing retry, create chat, write memories, alter relationships or plans. Authentication, existing developer flag/allowlist, owned-conversation checks, existing daily AI reservation and text-provider limits remain required.

The service-only `job_runs` ledger reserves a server-derived owner/UTC-day ID before any paid request. One check per account per UTC day; concurrent/repeated clicks cannot submit a second request, including after a failed/uncertain attempt. No new migration or secret is needed. Only its isolated job record and one existing AI budget reservation are changed. Explicit button text discloses text-AI usage; mounting/refetching does not run it.

After review/merge and Lovable sync/build: Riley → Simulation debug → World → Living Experiences → **Run one provider check (uses text AI)**. If rejected, report HTTP/code/parameter and the allowlisted hint. If it succeeds, shared model/schema works for the short case; the full-history outing still requires investigation. Do not interpret probe success as an outing recovery. The probe never automatically retries or resets Riley's operation. Derived hints such as schema_rejected/model_access/context_size are fixed categories from an upstream error message, not retained raw text or a claimed root cause for the earlier failure. Meaningful quoted parameter names are limited to the same allowlist.

The next event retains its configured start window; do not rush into repeated failures at its exact scheduled minute. Actual provider checks are only run explicitly after deployment, not during development or CI.

Isolated-check release validation: **1,076 tests passed / 55 opt-in skipped**, 40 focused tests passed, TypeScript, production build and focused lint passed. The new concurrent-check test exposed a test-loader race in concurrent dynamic mock imports; using stable server imports fixed it, and the final full suite passed. All provider activity in these tests is mocked. No production check or outing generation was invoked by development.
