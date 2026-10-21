# Tess roadmap

## Done (living-world pass)
- Photos for all five contacts: generation-only for Maya/Claire/Jordan/Ben with per-character canonical references (private storage), type restrictions (Claire/Jordan/Ben no intimate; Ben platonic), style-variety nudges, cooldown/frequency reuse. Tess's curated-first system untouched.
- World tick: 15-min managed schedule → /api/public/jobs/world-tick; atomic lease (unique index), bounded (20 users/4 AI calls), durable AI pause + single-probe resume, push sweep for delayed replies, initiation through the same turn pipeline.
- Real Web Push: VAPID keys (private in server secrets), aes128gcm sender on Web Crypto, per-device subscriptions with RLS, expiry cleanup, quiet hours, per-conversation mute, test button, SW push/click handlers.
- Settings: background-notification toggle with live status, quiet hours, test notification. Profile: per-conversation Real-Time Mode + mute.
- Developer Living World Timeline at /world (events, job history, AI pause state, manual tick), linked from Debug.
- Tests: 94 passing; typecheck clean; build OK.

## Open / partial
- Background push verified end-to-end only on a real Android PWA install — needs published app + device test.
- Social graph between characters and non-Tess long-run life events: not built (canon relationships only).
- Offline queue is localStorage, flushes while app is open; closed-app flush not verified.
- Email confirmation: auto-confirm enabled for development; RLS unchanged.
- VAPID subject is a placeholder mailto; rotate keys requires re-subscribing devices.
