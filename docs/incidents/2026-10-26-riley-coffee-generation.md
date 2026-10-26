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
