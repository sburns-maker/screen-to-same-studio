# Phase 5 — in-app phone calls

Baseline: `origin/main` d9fd8df. Existing primary `runTurn` owns personality, canon, selective memories, relationship math, world/schedule context, consent, structured output, durable outbox and conversational Plans. Existing media, world worker and developer authorization must remain intact. There was no live calling/audio transport or durable call ledger.

## Architecture decision before paid integration

Use a bounded speech-to-text → **the existing runTurn** → speech-output chain for the initial implementation. A separate Realtime session supplied with an approximate prompt would duplicate character reasoning and weaken continuity. The chained design preserves the existing brain and authoritative calendar. It is turn-based, with microphone/speaker audio and interruption controls, not full-duplex WebRTC. Latency cannot be claimed equivalent to Realtime.

Provider investigation: official OpenAI Realtime WebRTC, speech, transcription and pricing pages all returned CONNECT 403 on 2026-10-23. No OPENAI_API_KEY or production Supabase credentials are available here. The installed `ai` and `@ai-sdk/openai` declarations/implementations expose transcription and speech adapters and Realtime APIs. That establishes the installed SDK contract only; it does **not** verify a live model's availability, current support, current prices or latency. No voice model identifier is silently selected. Model names and a validated-provider flag must be explicitly configured before paid calls can start. No billable verification is performed automatically.

Normal text/image model settings stay unchanged. The voice adapter is disabled by default. Server authorization, durable attempt reservations and a capped session are required before audio leaves the browser. Audio remains transient and is never stored in database/storage. Initial live-call use requires explicit opt-in to keeping text transcripts in Messages until the user deletes them; no hidden default transcript recording. Setup explains this limitation.

A spoken assistant response is prepared using the existing outbox but cannot commit its memories, relationship delta or invitation until playback is acknowledged. Interruptions/disconnects discard the prepared response. A late acknowledgement cannot revive a closed call. This avoids canonizing unheard agreements. User speech is an actual transcribed user contribution, never an invented user action. Ringing and missed calls incur no AI requests.

## Implemented scope

- Five primary contacts have Call controls, stable reserved fictional 814 numbers, current portraits, a phone screen and Recents. The ten existing discoverable NPCs have explicit number allocations for future use; their voice brains are not implemented or silently substituted. No `tel:`/PSTN/carrier integration exists.
- Outgoing ringing takes 5–11 seconds before the simulated availability outcome resolves. Sleep, work, travel, existing shared-event presence and other current calls can prevent connection. Microphone permission is requested only after the user chooses to connect/answer. Busy/missed ringing does not invoke a model.
- Browser capture uses MediaRecorder, short automatic silence boundaries and bounded PCM conversion. Server validation requires canonical mono 16 kHz PCM WAV with at most ten seconds of actual samples; a claimed duration cannot bypass the input cap. No speech is uploaded after local hangup. Pause/silence leaves the call connected. An explicit Interrupt control stops playback and starts a new contribution; automatic spoken full-duplex barge-in is not implemented.
- The server reserves an attempt, transcribes actual microphone audio, records the real user contribution and calls existing `runTurn` with a voice-channel hint. That exact engine retrieves selective memory, personality/canon, relationship state, current world context and plans. It returns a short spoken reply, disables photo generation for this transport and prepares its usual atomic outbox without committing it. Speech is synthesized only server-side.
- Full playback acknowledgement commits the same outbox transaction used by Messages, then runs the existing calendar synchronizer. An interrupted or failed reply is not delivered as a text message and does not commit its memory/intentions/relationship delta or invitation. Answering/opening a call deterministically awards **no** relationship points. Normal completed dialogue still uses existing clamped relationship math.
- A model can explicitly choose to end a voice call using a transport-only closing marker, which is stripped before speech/history. Ordinary dialogue-turn completion does not hang up. This is a capability, not evidence that a live model's closing behavior has been visually/audibly accepted.
- Incoming offers require a real, due, unexpired, source-quoted callback promise from that character, explicit user incoming consent, a Real-Time/unmuted conversation, availability and quiet-hours compliance. They use the existing durable world worker, with no inference during ringing. At most one offer/user/24 hours and one offer/promise prevent repeated calling after decline. The callback is fulfilled only after an answered spoken response is acknowledged.
- In-app visual incoming alerts work while an authenticated app shell is open. Missed offers appear in Recents after expiration. There is no OS-level CallKit/Android Telecom integration, background VoIP push or guaranteed audible ringtone. A closed app cannot be promised native incoming ringing.
- A callback-request action writes an explicit user request into the existing conversation. It does not fabricate the character's agreement or guarantee a callback. Full recorded voicemail is deferred; raw audio is not stored.
- The existing collapsible, developer-authorized Simulation Debug adds Calls configuration, state, availability reason, failures, server preparation latency, duration, spending reservations, model access checks and memory-delivery semantics. Read-only model access checks do not generate audio or establish endpoint compatibility.

## Privacy and reliability

The additive **0023_phone_calls.sql** migration adds private call preferences, calls and attempt records, plus an explicit fictional-number allocation registry. Existing chats, memories, photos, scores, world events and plans are not reset. Call mutation RPCs are service-only; every server function authenticates the user and checks owned conversations/calls. One active call/user and one outstanding turn/call are enforced transactionally. A restrictive message-insert policy prevents simultaneous client text inputs from racing the same character's active call; other conversations remain usable.

Text transcripts are off by default. The first implementation requires the user to enable **Save call transcripts in Messages until I delete them** before calling; it does not yet offer summary-only calls. The user can revoke permission (ending an active call) and delete that call's transcript from Recents. Deletion also redacts private prepared-response payloads. Confirmed summary memories and plans are retained separately; deleting text is not a character-history reset. Audio bytes are transient server/browser memory, are never uploaded to Supabase storage, and are not included in logs. Provider processing/data-retention terms must be reviewed separately.

Track capture, playback, audio contexts, recorder timers and object URLs are released on hangup/unmount. Late microphone permission cannot reopen an ended call. Reloading a lost active screen fails closed instead of showing an apparently usable connected microphone. Clean hangup timestamps/duration are server-recorded. If a browser closes without delivering its final request, the server session expires and its duration is a **bounded estimate**, not proof of the exact network-loss instant. Hard platform background/resume guarantees are not claimed.

Input, text and synthesized output requests have no automatic provider retries. An ambiguous attempted turn remains charged against its reservation and cannot be regenerated by reusing its ID. Maximums: ten call offers/day, one live call/user, twenty attempts/call, ten seconds/capture and 1,000 spoken reply characters. Session duration defaults to five minutes and cannot exceed ten. Interrupted pending speech cannot be recovered by the normal photo/text outbox sweeper. Ordinary text/image delivery retains its existing behavior when voice is disabled.

## Provider configuration in Lovable Cloud — review first

No setup below was applied to a live environment. Review/apply migration **0023** only after existing **0022**, in staging first. Merging source does not install SQL.

Retain the existing server `OPENAI_API_KEY`, Supabase server bindings and current text/image settings. Do not put secrets in frontend variables. Add these **server-side** values only after reviewing current official documentation and costs:

| Variable | Meaning |
| --- | --- |
| `ENABLE_VOICE_CALLS` | Defaults off; set `true` only for an approved preview |
| `VOICE_PROVIDER_VALIDATED` | Defaults off; explicit acknowledgement that the chosen models/voices and endpoint compatibility were checked |
| `OPENAI_TRANSCRIPTION_MODEL` | Explicit currently supported speech-recognition model; no assumed default |
| `OPENAI_SPEECH_MODEL` | Explicit currently supported speech-output model; no assumed default |
| `VOICE_TESS`, `VOICE_MAYA`, `VOICE_CLAIRE`, `VOICE_JORDAN`, `VOICE_BEN` | Five distinct approved provider stock-voice IDs; no cloning |
| `VOICE_MAX_SESSION_SECONDS` | 30–600; defaults 300 |
| `VOICE_TURN_RESERVATION_CENTS` | Required conservative per-attempt reservation based on verified prices |
| `VOICE_DAILY_BUDGET_CENTS` | Required per-user daily reservation ceiling; absent/invalid disables readiness |
| `VOICE_MONTHLY_BUDGET_CENTS` | Required per-user monthly reservation ceiling; absent/invalid disables readiness |
| `ENABLE_INCOMING_VOICE_CALLS` | Separate opt-in for worker callback offers; defaults off |

Existing `ENABLE_DEV_PHOTO_ACTIONS` / `DEVELOPER_PHOTO_USER_IDS` still gate developer diagnostics. Existing world-tick scheduling must be configured independently for closed-app incoming offers; see [living-world activation](living-world-activation.md). No new scheduler was activated.

In a reviewed Lovable preview:

1. Keep incoming calls off. Confirm the new migration and existing chat/media tests first.
2. Inspect current [Realtime documentation](https://developers.openai.com/api/docs/guides/realtime-webrtc), [speech](https://developers.openai.com/api/docs/guides/text-to-speech), [transcription](https://developers.openai.com/api/docs/guides/speech-to-text), and [pricing](https://developers.openai.com/api/docs/pricing) in a browser that can reach them. Record the exact chosen model/voice IDs and pricing. Deprecated/unsupported models must not be chosen merely because the SDK recognizes their string.
3. Enter explicit model/voice settings and conservative budgets. The developer **Check model access (no generation)** action can check account visibility through server-side GET `/v1/models/{id}`. Visibility is not a paid speech-generation test.
4. Only after compatibility review, enable the validated flag and voice flag in preview. In Calls settings, explicitly opt into outgoing calls and transcript retention. Microphone access also requires browser permission on HTTPS/localhost.
5. Make one short approved paid preview call to an available character, speak a brief sentence, wait for a reply and hang up. Confirm microphone shutdown, transcript/Recents, usage and failure logs. Do not enable production or incoming calls based solely on mocked tests.
6. Test Maya's actual plan-confirmation scenario at a time she can answer, and validate the same Plans event and subsequent Messages memory. Test interruption, mute, denied permission, Bluetooth/output controls, network loss, Android Chrome, installed PWA and iOS. Audio output selection depends on browser support; otherwise use normal device volume/Bluetooth controls.
7. Enable incoming offers only after outgoing quality is accepted. Enable the user's separate incoming preference and exercise a genuinely sourced callback promise. Verify quiet hours, expiry, decline and no repeated offers.

## Costs and latency — not verified live

The installed SDK source uses the OpenAI speech and transcription endpoints. Realtime APIs are also exposed by the installed package, but neither their current account access nor pricing could be researched from the blocked official sites. **No current audio dollar rate, model availability or latency benchmark is claimed.** No audio model was selected or changed automatically.

For `n` user voice turns plus an opening greeting, the chain normally uses `n` transcription requests, `n+1` existing character replies and `n+1` speech-output requests. Silence and ringing generate none. A full twenty-attempt session can use at most nineteen transcriptions and twenty text/speech replies, with up to 190 seconds of validated microphone input and 20,000 speech-output characters. Actual usage is usually lower and depends on pauses and reply length.

Estimate from current verified provider rates:

`transcription audio minutes × input-audio price + sum(existing dialogue input/cached/output tokens × text prices) + speech output characters/audio tokens × selected speech price`.

The previously user-supplied GPT-6 Luna text rates ($0.10/M input, $0.01/M cached input, $0.50/M output) can be used as an **unverified scenario assumption**, not a new pricing verification. For ten exchanges at 10k–20k input tokens and ~150 output tokens each, text alone is approximately $0.011–$0.021 before caching; add the transcription/speech charges. Do not extrapolate current text spending to voice.

Reservations are spending protection, **not an exact provider invoice or guaranteed dollar cap**. Set them conservatively from validated worst-case rates and keep provider project/prepaid controls and usage alerts in place. A reservation of five cents with a 100-cent daily ceiling, for example, allows twenty attempted turns that day; it does not establish the actual cost of those turns. Failed/uncertain requests retain their reservation.

This implementation is sequential/turn-based. It is expected to feel slower than full-duplex WebRTC because transcription, the existing structured character reply and speech synthesis occur in sequence. Actual latency is measured in diagnostics and must be accepted on-device. Streaming audio, automatic spoken barge-in and a verified Realtime sideband architecture remain follow-up work; they must preserve authoritative transcript/plan/memory delivery and hard attempt limits rather than introducing a second character brain.

## Validation and remaining acceptance gates

Automated tests use the actual disposable PostgreSQL schema, actual primary turn/outbox/memory/calendar code and fake external speech/text providers. They cover ringing without inference, incoming promise offers, acceptance/decline/missed states, no points for answering, actual-source continuity, plan updates only after playback, interruption/hangup, duplicate reservations, budget failure, cross-user denial, transcript deletion, quiet hours, microphone permission failure/late arrival, media cleanup and bounded WAV validation. Existing text/photo/video regression suites remain required.

**Live microphone-to-provider-to-speaker acceptance is incomplete.** No provider credentials or real phone hardware were available; no live speech request or billable generation was made. The implementation remains disabled until configured and reviewed. Mocked browser/provider tests do not demonstrate natural voice quality, interruption quality, mobile responsiveness or realtime performance. No native carrier/phone-system, audio voicemail, NPC voice calls or fictional social-network feature was deployed.

Validation on this branch: **496 tests passed across 53 files**, `npx tsc --noEmit` passed, focused ESLint passed and `npm run build` passed. The existing PWA precache glob warning remains and needs device/preview follow-up. No production migration, deployment, merge, social-media implementation or live billable audio request was performed.

The repository test adapter now accepts omitted RPC arguments, matching Supabase's actual API; latest-main capability probes use that supported form. No production service was changed merely to satisfy the test adapter.
