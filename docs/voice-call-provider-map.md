# Voice Studio and phone architecture

There are **two distinct phone providers** in this project:

1. `/live-call/$conversationId` uses GPT-Live and the six saved custom `voice_...` values from the `character_voices` table. `resolveCharacterVoice` in `src/lib/live-calls.server.ts` already retrieves those. Enable with `ENABLE_LIVE_CHARACTER_CALLS=true` only after deployment/voice and budget checks. Existing Voice Studio assignments are preserved.
2. `/call/$callId` uses the separate turn-based OpenAI transcription and text-to-speech chain in `src/lib/voice-provider.server.ts`. The `VOICE_*` settings for this legacy endpoint refer to built-in TTS voice names, not the saved custom GPT-Live `voice_...` IDs. Do **not** copy custom voice IDs into `VOICE_*`, which would not make that endpoint compatible. Legacy incoming ringing currently targets this older chain.

This branch adds safe default ASR/TTS model names and limited budget defaults, **but does not silently replace any character voice**. Calling remains fail-closed until explicitly configured/validated. The debug UI links to the existing GPT-Live route and provides a read-only saved-voice check so the older status can no longer be mistaken for the Voice Studio status.

### Important outstanding work
Inbound/spontaneous calls using the *saved custom voices* require routing the incoming offer through the existing GPT-Live session flow, plus preserving browser ringing, cost controls and acknowledgement-based memory. This is a separate implementation. Do not claim that this PR enables incoming GPT-Live calls or that the two providers are interchangeable.

No credentials need to be pasted into source or PR comments.
