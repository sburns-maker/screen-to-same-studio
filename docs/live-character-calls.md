# Live character calls

- Flag: `ENABLE_LIVE_CHARACTER_CALLS=true` plus `OPENAI_API_KEY`.
- Limits (env, optional): `LIVE_CALL_MAX_SECONDS` (default 300, 60–900), `LIVE_CALL_DAILY_LIMIT` (20), `LIVE_CALL_MONTHLY_SECONDS` (7200) per user.
- Voices: Voice Studio step 4 "Use chosen voice for X's calls" writes `character_voices` (developer-only).
- Sleeping characters don't pick up; nothing is charged.
- After a call with real speech, one short memory is saved for that character only.
- Schema: `character_voices`, `live_character_calls`, `reserve_live_call()` (applied 2026-10-24; same SQL as the planned 0029_live_character_calls).
