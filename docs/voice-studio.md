# Voice Studio — safe activation

Route: `/voice-studio`. Linked from a developer-authorized character's Simulation Debug page.

## Current feature set
- Developer-only status check (OpenAI API key, creation flag and saved voice setting presence).
- Three explicitly confirmed prompt-to-voice variations per character.
- The creator returns a saved OpenAI voice ID without automatically approving it.
- Candidate IDs persist in this device's local storage across refreshes; they are not approvals.
- The mounted audio player supports blocked-playback recovery, one script append after `session.started`, immediate speaker silence on Stop and a bounded final-event drain. Direct OpenAI GPT-Live uses `session.commentary.append`, not the Realtime `response.create` sequence.
- **In-app paid auditions remain blocked.** The one-shot server function cannot enforce durable cross-instance concurrency, usage reservations or a server-owned duration deadline. The server safety gate rejects auditions even if someone sets the enable flag. No paid verification was performed.
- Before enabling, add a separately reviewed persistent budget/lease mechanism and server-owned OpenAI sideband lifecycle with disconnect/deadline termination. This may require schema/deployment additions; do not create them without review. No database migration was applied here.

## Lovable setup order
1. Review/publish code and verify the app builds. Keep all live calling flags off.
2. Confirm `OPENAI_API_KEY` belongs to the OpenAI project intended to own the voices.
3. Set server-only `ENABLE_VOICE_DESIGN=true`. No need to enable paid calling to create voice objects.
4. In AI Town open any authorized Simulation Debug screen and choose **Open Voice Studio**.
5. Select Tess and click Natural, Refined or Playful. Each click requires a confirmation. The creation endpoint itself is free according to OpenAI, but saved voices are project-scoped.
6. Copy candidate IDs. Open OpenAI's GPT-Live Playground and audition the voice ID with the supplied script and description. Live playback is billed.
7. Put the approved voice ID in server variable `GPT_LIVE_VOICE_TESS`, not `VOICE_TESS`.
8. **Do not enable `ENABLE_GPT_LIVE_CALLS` yet.** The existing phone route is still the prior turn-based adapter and does not use custom prompt-generated voices. Full-duplex WebRTC, delegated canonical responses and playback-acknowledged memory writes require an additional implementation.

Do not paste API keys into AI Town fields or chat. Server-side keys remain secret.
