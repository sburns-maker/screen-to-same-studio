# Missed call continuity

## Root cause

Incoming call offers and outcomes were saved in `phone_calls` and displayed in Recents, but `runTurn` built the character's prompt from messages, memories, calendar, world knowledge and housing without the call ledger. Unanswered calls have no spoken transcript/summary to fill that gap. A character could therefore deny an actual recorded attempt.

## Change

`recentCallContext` reads up to 16 rows from the existing ledger, constrained by authenticated owner, conversation, character and the preceding seven days (not future timestamps). A pure formatter adds up to eight recent factual records to the shared character context. Text and legacy spoken turns, living experiences and GPT-Live session instructions reuse it. It is a read-only context adapter, not another memory store, scheduler, call log or SMS transport.

Incoming means the character called the player; outgoing means the player called the character. Missed/declined/failed attempts do not establish a conversation, agreement, audible device ring, purpose, voicemail or blame. Answered records establish only an answered attempt; topics must come from actual retained memories. Expired ringing rows are described as unanswered without needing a data mutation. Explicit developer test-ring reasons are excluded from character-initiated history. Failed history lookups add a cautious unavailability instruction rather than asserting no call occurred. No provider internals or raw failure payloads appear in the prompt or logs.

## Release and limits

No migration, historical rewrite or relationship adjustment is required. Nothing is deployed automatically. Existing call records are reused on the next fresh turn after a reviewed merge and Lovable sync/build. An already-prepared reply may still contain its old context. The adapter covers recent attempts in `phone_calls`; the separate `live_character_calls` ledger does not identify callers or link reliably to old ringing entries, so this fix does not infer those facts. Calls older than seven days still need retained memories or historical lookup. Actual model compliance and production Maya records were not inspected live.

Manual acceptance: let an actual (not developer test) incoming call expire, verify the character's missed entry, then ask that character whether they called. They should acknowledge the attempt without inventing an audible ringtone, call topic or shared conversation. A different character must not know about the attempt. Repeat with a declined call, a genuine callback, and a voice session.

Validation: full default suite **1,029 passed / 55 opt-in skipped**; focused phone/context/prompt suite **51 passed**; TypeScript, focused ESLint (legacy formatting rule disabled on existing files), production build and diff checks passed. All paid-provider calls are mocked.
