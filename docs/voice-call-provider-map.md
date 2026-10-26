# Voice Studio and phone architecture

There are **two distinct phone providers** in this project:

1. `/live-call/$conversationId` uses GPT-Live and the six saved custom `voice_...` values from the `character_voices` table. `resolveCharacterVoice` in `src/lib/live-calls.server.ts` already retrieves those. Enable with `ENABLE_LIVE_CHARACTER_CALLS=true` only after deployment/voice and budget checks. Existing Voice Studio assignments are preserved.
2. `/call/$callId` uses the separate turn-based OpenAI transcription and text-to-speech chain in `src/lib/voice-provider.server.ts`. The `VOICE_*` settings for this legacy endpoint refer to built-in TTS voice names, not the saved custom GPT-Live `voice_...` IDs. Do **not** copy custom voice IDs into `VOICE_*`, which would not make that endpoint compatible. Legacy incoming ringing currently targets this older chain.

This branch adds safe default ASR/TTS model names and limited budget defaults, **but does not silently replace any character voice**. Calling remains fail-closed until explicitly configured/validated. The debug UI links to the existing GPT-Live route and provides a read-only saved-voice check so the older status can no longer be mistaken for the Voice Studio status.

### Important outstanding work
Inbound/spontaneous calls using the *saved custom voices* require routing the incoming offer through the existing GPT-Live session flow, plus preserving browser ringing, cost controls and acknowledgement-based memory. This is a separate implementation. Do not claim that this PR enables incoming GPT-Live calls or that the two providers are interchangeable.

No credentials need to be pasted into source or PR comments.

### Incoming GPT-Live bridge (opt-in)
The existing worker can offer an in-app ringing notification using the saved GPT-Live Voice Studio identity, but **no paid provider session is created until the user follows the offer and taps Answer on the GPT-Live screen**. The server verifies the call is incoming, ringing, unexpired, belongs to that user and conversation, and has an approved character voice before starting WebRTC. Decline and unanswered expiry incur no GPT-Live cost.

In Lovable's server-side environment, enable `ENABLE_LIVE_CHARACTER_CALLS=true` and `ENABLE_INCOMING_GPT_LIVE_CALLS=true`. Keep the existing `OPENAI_API_KEY`, character_voices registry, live-character-call reservation migration, call_preferences and world-worker scheduling. **Do not enable the old speech-chain provider** solely for GPT-Live incoming calls. The old `ENABLE_INCOMING_VOICE_CALLS` flag is not needed in GPT-Live mode.

The existing phone SQL function caps ring duration at 30 seconds and the browser UI only polls while the app is open. No native background ringing or push ringing is implemented here. A live incoming session consumes the existing GPT-Live daily and monthly limits and still requires microphone permission. Custom voices are resolved from the server-held `character_voices` registry. Old phone event and new GPT-Live session are separate but paired by the incoming offer ID during the explicit answer/hangup flow.

Before enabling on production, manually test: visible ring, accept within 30 seconds, correct custom voice, decline, expiry, duplicate attempts, lost network, end-call state, session budget exhaustion, mute/quiet hours and cooldown. Tests mock provider activity; they cannot prove live microphone or voice compatibility. 
