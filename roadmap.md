# Tess roadmap

## Voice Studio audition validation
- Done: repaired mounted audio, one-shot script trigger, playback detection, blocked-audio recovery, startup/Stop/disconnection cleanup; verified direct-OpenAI documented events with mocked transport, without paid requests.
- Blocked: auditions remain disabled until durable concurrency/spending reservations and a server-owned OpenAI sideband deadline are implemented and reviewed; no schema changes authorized here. Normal calls remain disabled.
- Done: 509 tests passed; edited files lint clean; automatic preview build/typecheck OK. Signed-in developer mobile page loads with all five selectors and no horizontal overflow. Repository-wide lint has 3,455 pre-existing findings. Physical Android/audio and production paid playback remain unverified; not published.

## Multi-week life upgrade
- Done: persistent multi-week situations for all five characters; deterministic branching, postponement/fading/open-ended outcomes, shared milestones, participant context, and idempotent personal outcome memories, integrated with schedule, latency, initiation and photo prompts. No additional AI calls or schema changes.
- Done: 9 focused tests; 30-day simulation produced 6 situations, 30 milestones, 24 transitions and 4 remembered outcomes; replay/partial-write recovery and user isolation passed. Full regression suite run once: 141 tests passed; preview build OK.
- Done: signed-in /world tick created five situations and five initial milestones in the requesting user's world; existing timeline read them back; zero AI calls, no runtime errors or tick errors.
- Limit: ten finite canon-grounded topics (two per character), never repeated; exhausted topics leave quiet lives rather than generating unlimited new plots. Actual 30-day elapsed production operation is not yet observed; time advancement was simulated through the real persistence module with an in-memory transport.

## Current fixes (Sean's report: push toggle off, empty inbox)
- Done: dropped stale UNIQUE(user_id) on conversations (leftover from Tess-only schema) that blocked seeding Maya/Claire/Jordan/Ben — inbox now shows all 5 contacts (verified signed-in).
- Done: VAPID public key in push-config.ts didn't match VAPID_PRIVATE_KEY secret; replaced with the derived key. User must re-toggle Background notifications after the next publish.
- Note: drizzle/migrations is read-only; the constraint drop was applied via SQL only.

## Current photo correction
- Done: remove unsupported Claire/Jordan restrictions; separate capability, eligibility and willingness.
- Done: support platonic personal photos, persistent romantic intent and refusal boundaries.
- Done: add adult-only, default-off non-explicit mature portrait preference where provider permits.
- Done: 111 tests pass; existing photo rules preserved; live Claire reply and covered-sleepwear image generation succeeded.
- Blocked verification: signed-in preference persistence could not be exercised because the browser inbox remained blank; no successful UI persistence claim.

## Done (living-world pass)
- Photos for all five contacts: generation-only for Maya/Claire/Jordan/Ben with per-character canonical references (private storage), shared ordinary capabilities for romantic-capable adults, Ben friendship-only, style-variety nudges, cooldown/frequency reuse. Tess's curated-first system untouched.
- World tick: 15-min managed schedule → /api/public/jobs/world-tick; atomic lease (unique index), bounded (20 users/4 AI calls), durable AI pause + single-probe resume, push sweep for delayed replies, initiation through the same turn pipeline.
- Real Web Push: VAPID keys (private in server secrets), aes128gcm sender on Web Crypto, per-device subscriptions with RLS, expiry cleanup, quiet hours, per-conversation mute, test button, SW push/click handlers.
- Settings: background-notification toggle with live status, quiet hours, test notification. Profile: per-conversation Real-Time Mode + mute.
- Developer Living World Timeline at /world (events, job history, AI pause state, manual tick), linked from Debug.
- Tests: 94 passing; typecheck clean; build OK.

## Done (social world pass)
- Social ecosystem: per-character canon NPC circles (family/coworkers/hobby/exes), social_links with levels + reasons, deterministic weekly shared events (Tess Thu trivia with Marcus/Lena/Dev preserved), sparse plausible overlap (Maya/Ben may attend same trivia; attendance ≠ meeting), per-character knowledge (witnessed/told) with isolation, rare reasoned link evolution.
- Social tick runs inside the world tick per user: bounded (≤12 events/user/week), idempotent (deterministic event ids, upserts, level-guarded link changes), no AI calls.
- Reply prompts inject only the character's own knowledge rows; rules forbid referencing anything else or other people's private conversations.
- /world debug: social networks, shared events with participants/met lists, character knowledge with source.
- Tests: 21 new (social-logic.test.ts), 132 total passing; typecheck clean.

## Open / partial
- Done: background push confirmed working by Sean on the published app (public visibility + push worker served from /api/public/push/, VAPID key fixed, stale sign-up reset).
- Done: multi-week situations now use persistent roots and milestone events, separate from recurring weekly events.
- Social-graph visualization on /world is list-based, not a graphical diagram.

- Offline queue is localStorage, flushes while app is open; closed-app flush not verified.
- Email confirmation: auto-confirm enabled for development; RLS unchanged.
- VAPID subject is a placeholder mailto; rotate keys requires re-subscribing devices.
