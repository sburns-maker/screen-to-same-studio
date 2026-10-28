# Live character calls

- Flag: `ENABLE_LIVE_CHARACTER_CALLS=true` plus `OPENAI_API_KEY`.
- Limits (env, optional): `LIVE_CALL_MAX_SECONDS` (default 300, 60–900), `LIVE_CALL_DAILY_LIMIT` (20), `LIVE_CALL_MONTHLY_SECONDS` (7200) per user.
- Voices: Voice Studio step 4 "Use chosen voice for X's calls" writes `character_voices` (developer-only).
- Sleeping characters don't pick up; nothing is charged.
- After a call with real speech, one short memory is saved for that character only.
- Schema: `character_voices`, `live_character_calls`, `reserve_live_call()` (applied 2026-10-24; same SQL as the planned 0029_live_character_calls).

## Captured dialogue in conversation history

Live calls previously retained only a browser transcript and attempted one short
optional memory at hang-up. No full transcript was persisted, and a missing or
failed summary could leave later texts without the topic discussed.

Captured transcript lines now save as ordinary owner-scoped `messages` with
`channel: voice`, `live_call_id`, `transcript_ordinal` and
`transcript_source: live_call_capture`. The chat labels them “Phone call
transcript”; its existing history query supplies those lines to later text
turns. These records are actual captured speech, not invented summaries, SMS
sent by the user, relationship acceptance, or a reason to generate a reply.
They carry no `commitment_action` or push notification request.

The existing heartbeat interval also checkpoints completed lines. The last line
is kept out of checkpoints while it can still receive transcript deltas; normal
hang-up includes it before attempting the optional memory. Leaving the call
screen also attempts finalization. IDs derive from call ID + ordinal, and
conflict-ignore inserts keep completed lines immutable across retries and
concurrent checkpoints. Server checks both call ownership and its matching
owner/conversation/character. No audio bytes or provider credentials are stored.

Persistence does not depend on summary eligibility or success. Call prices,
voices, eligibility, incoming selection, lease/deadline controls and summary
charging rules are unchanged; checkpoints make no model requests. There is no
new migration or secret for this change.

Limitations: only text emitted to the existing transcript collector can be
saved. Missing caller transcription is surfaced at hang-up, not filled in by
inference. A browser/network interruption can lose the newest uncheckpointed
line; device background/page-close delivery is not guaranteed. The existing
transcript bounds still apply. Past calls whose text was never stored cannot
be reconstructed from call-attempt records. The optional memory remains a
separate one-attempt operation; this change does not retry paid summaries.

After publishing, make a short explicitly authorized test call, speak and hear
a distinct topic, hang up, and verify labelled user/character transcript lines
in that same conversation before asking a related follow-up. Check a dropped
connection and verify completed checkpoints survive without duplicates. Local
tests use disposable PostgreSQL and mocked providers, not a paid live call.
