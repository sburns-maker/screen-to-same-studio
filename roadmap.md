# Tess roadmap

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
- Background push verified end-to-end only on a real Android PWA install — needs published app + device test.
- Social graph between characters and non-Tess long-run life events: not built (canon relationships only).
- Offline queue is localStorage, flushes while app is open; closed-app flush not verified.
- Email confirmation: auto-confirm enabled for development; RLS unchanged.
- VAPID subject is a placeholder mailto; rotate keys requires re-subscribing devices.
