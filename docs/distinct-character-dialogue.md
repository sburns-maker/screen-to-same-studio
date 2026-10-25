# Distinct character dialogue

Based on GitHub/Lovable main `7b8ca2f`, on `fix/distinct-character-dialogue`. No production data, models, voices, migrations, deployment or paid generations were changed/executed during development.

## Why the voices converged

The core prompts heavily emphasized dry humor, witty examples, banter and defensive replies. Their common topic guards tracked repeated subjects, but not shared rhetorical habits such as courtroom jokes and mock-official complaints. Riley had no topic-saturation profile. Non-Tess replies reused Tess's deterministic sentence filter: it could delete a genuine “I appreciate that” or “that means a lot,” and also removed presenter phrasing regardless of the other person's style. Historical word-overlap suppression could then discard an intentional plan readback or repeated boundary. These mechanics favored the remaining quips even when the underlying response had a sincere part.

## Changes

`dialogue-personality.ts` defines typed, distinct delivery tendencies for all six primary characters, plus a canon-first fallback for future contacts. It defines how their humor, rhythm and emotional openness may differ without adding biography, events or mandatory reply templates:

- Tess: specific, economical and composed; occasional understated humor, with room for plain kindness and tiredness.
- Maya: expressive and playful, with ordinary candid reactions and quieter moods; no permanent chase routine.
- Claire: considered and concise, personally warm without automatically becoming romantic or therapeutic.
- Jordan: spare and wry, able to accept kindness without issuing an emotional test; her privacy and boundaries remain.
- Ben: casual, practical and entirely platonic; offhand amusement without a polished punchline every turn.
- Riley: observant, sometimes meandering or goofy, comfortable with quiet; shift work and snack jokes are not her entire identity.

Both existing character-generation adapters use these rules for normal replies, autonomous texts, photo captions and in-person experiences. The live voice prompt uses a shorter version of the same tendencies inside its existing prompt cap. No voice assignment, calling availability, paid-session authorization or calendar-write capability changes.

The bounded conversation check notices repeated legal/courtroom bits, mock bureaucracy, stock chaos labels and prove-yourself teasing in the last ten character messages. It supplies pattern labels, never copies raw user instructions into the system prompt. It does not ban factual legal/work questions, delete old messages or rotate topics through a fixed catalog. Serious-response requests and vulnerable moments can get plain responses. Goodbyes may end naturally, while actual questions and requests for plan details take priority. Autonomous generation does not misread yesterday's user goodbye as a current request to end.

The output filter now retains genuine thanks/acknowledgment and does not impose Tess's presenter bans on other characters. Tess's established deterministic restrictions on self-description, presenter phrasing, emoji and exclamation use remain. Existing per-contact limits remain, with explicit Riley configuration. Deduplication applies within the newly generated turn; historical overlap alone cannot erase a requested factual confirmation or repeated boundary. Historical joke repetition is handled by context guidance instead of silently deleting the response. There are no canned substitute replies or automatic extra generation attempts.

Memory retrieval, owner isolation, state math, consent/photo boundaries, calendar actions, live scene authority and all persisted histories remain on their existing paths. Ben's zero-romance constraint remains explicit. These rules do not award relationship progress for a clever line or force warmth, affection or romance.

## Verification and acceptance

Automated tests use mocked structured providers. They verify exact prompt composition and output preservation; they are not proof of subjective live-model quality.

Covered: six distinct profiles; same-conversation repeated-routine detection; single callbacks and factual questions; sincerity retained in new and historical context; non-Tess expressive wording; repeated factual plans/boundaries; same-turn deduplication; Riley topic saturation; unresolved questions versus sign-offs; autonomous initiation; experience-channel separation; memory/state/action metadata preservation; and bounded shared voice direction without new calendar permission.

After a reviewed code deployment, manually compare a few ordinary exchanges across established contacts:

1. Mention an ordinary tiring day. Look for a grounded answer rather than six different versions of a roast, a therapy speech or a mandatory question.
2. Express sincere appreciation. Jordan may accept it plainly; nobody has to turn it into a challenge or romantic milestone.
3. Ask a practical plan detail twice. Confirm it is answered and not filtered as repetition.
4. Continue a thread with several existing courtroom or mock-official jokes, then change the topic. The next response should leave the routine behind without inventing a fresh event to entertain the user.
5. Say “Sounds good, what time?” versus “Sounds good. Goodnight.” Verify clarification versus a natural close.
6. Resume an existing experience. Voice tendencies should vary while the latest confirmed venue, actual actions and character boundaries remain authoritative.

The criteria are varied, context-appropriate conversation over several turns, not a prescribed sample line. One joke or one short reply is not a failure. Real-model tone and Android/live audio remain manual acceptance checks. No live audio test is required to review the text changes.

## Deployment and cost

This branch requires **no new migration or secret**. The separate 0035–0038 migration-ledger permission blocker is not bypassed or modified here. Its resolution and installation of 0039–0041 remain an independent database-owner/Lovable support task.

There is a modest added prompt-token cost for static voice guidance and occasional pattern labels, but no additional model calls, new provider, voice purchase, polling or model retries. Existing spending safeguards and model choices remain unchanged. Prompts guide behavior; they do not guarantee a particular emotional response or perfect resistance to repetitive language.

Recorded validation: full suite **816 passed, 12 opt-in PostgreSQL tests skipped**; focused dialogue/channel/voice tests **45 passed**. TypeScript, production build, focused lint and whitespace checks passed. The final focused checks also cover a repeated factual jury-duty topic (not a comic routine), and outstanding plan details taking priority over conversation closure. Existing unrelated repository-wide lint debt is not reported as passing. No database code changed; external PostgreSQL transaction tests were not rerun for this dialogue-only change.
