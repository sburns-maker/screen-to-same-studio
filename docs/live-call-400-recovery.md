# Live call HTTP 400 and stale ringing recovery

The screenshot confirms a rejected provider request and a still-visible incoming banner. HTTP 400 alone does not identify the rejected field. Official Live documentation could not be fetched from this workspace, and production error bodies/credentials were not accessed. Do not present the change as proof of a successful live voice call.

## Request and diagnostics

Calls now use a pure request builder with the same model, delegation, opening message and saved custom-voice audio shape as existing Voice Studio sessions. The additional `audio.input.turn_detection` block is removed: it was not shared with that existing path and its Live compatibility was unverified. Provider defaults handle input behavior; live latency, turn-taking and interruption behavior need device testing. No built-in voice fallback, model change, automatic paid retry or credential change.

Rejected requests expose only allowlisted error codes and recognized parameter paths in the user error. Server `[live-call-provider]` diagnostics include HTTP status, safe code, safe parameter and a bounded request ID. Raw provider messages, SDP, instructions, headers and keys are never logged. Safe failure details remain in the existing live-session close reason. Unknown/malformed errors remain unclassified rather than echoing raw content.

## Lifecycle

A valid incoming offer is checked before setup, then the existing durable per-user lease is acquired before the offer is claimed. Lease losers/duplicate requests cannot fail another attempt's offer. Fresh expiry and ownership checks precede the claim and paid POST. Claimed offers are failed if subsequent setup fails. HTTP errors, network failures and malformed successful responses mark the session failed. If storing a known successful provider session fails, close it server-side rather than claiming success.

The browser refreshes call and voice-session history after connection attempts and hangup. Answer/decline hides the handled banner immediately; its ringtone already stops. Expired banners disappear at the deadline independently of the next poll. Following a failed/ended incoming attempt, an explicit new Call is an outgoing callback rather than re-answering a terminal incoming ID. There is no automatic redial. Existing microphone-release code remains in use.

## Validation and Lovable

Mocked server-handler tests cover successful saved-voice setup, HTTP 400 with sanitized diagnostics, invalid JSON, reservation failure, already-held leases and duplicate answers. UI tests cover immediate banner removal, expiry without polling, history refresh and an explicit callback after failure. Provider compatibility and real audio are not proven by these mocks.

No database migration or secret changes. Review/merge, sync and build in Lovable, then explicitly attempt one fresh call. Test incoming Answer, declined/missed calls, microphone permission, two-way speech, interruptions, hangup and Recents. If it fails, share only the new safe HTTP code/error code/parameter/request ID. Do not repeat paid attempts while the reason is unknown. Do not automatically deploy or run production scripts.

Final automated results: **1,052 tests passed / 55 opt-in skipped**; **47 focused tests passed**; TypeScript, production build, focused ESLint (legacy formatting rule disabled on existing files) and diff checks passed. All external voice calls are mocked. Actual provider compatibility and device audio remain unverified.
