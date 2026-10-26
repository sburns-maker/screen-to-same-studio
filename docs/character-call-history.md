# Character call history and ringing

Chat → conversation options → **Call history**, or profile → **Calls & recents**, opens that conversation's latest 50 call records. **All contacts’ calls** returns to the account-wide list. Filtering occurs server-side along with the authenticated user constraint; no client-supplied user IDs are accepted. Polling retains the existing call sweep, so expired incoming offers become missed calls without paid generation.

Incoming offers show name, number, direction, offered time (Eastern), missed/declined/failed state, and existing answered duration. No invented historical calls or delivery/ringing confirmations are added. A missed call means an offer was unanswered; it does not prove the device rang audibly.

Live voice sessions have a separate labelled section using their existing owner-scoped ledger. Only explicit safe fields are returned, never provider session IDs, voices or transcripts. Existing live rows have no reliable answer timestamp or link to the legacy ringing row. Therefore they remain labelled sessions (possibly also represented by an incoming call entry), without guessed direction, deduplication or connected duration. Usage is shown only when actually recorded. Unknown-table or access errors remain visible rather than appearing as an empty history.

## Sound

Calls → **Enable & test sound** enables a device-local in-app ringtone and unlocks browser audio with a user gesture. Incoming banners explain when sound is off/blocked and offer the same unlock action. Oscillators stop on answer, decline, offer expiry, component cleanup, or muting; no microphone, media provider or paid request is used for ringing. A decline failure refreshes authoritative state. Device silent mode/volume still apply. Browsers can suspend audio on reload or in the background; native/background ringing is not claimed. Local sound preference is independent of server incoming-call consent.

## Validation and release

No database migration, secret, paid voice test, production query or deployment required for coding. After review/merge and Lovable sync/build, enable/test sound on Android Chrome, trigger one developer test incoming ring, answer/decline one and let another expire; verify the correct character history and sound cleanup. Repeat after reopening/backgrounding to check browser restrictions. Actual Maya production history was not accessed during development.

Automated checks: full default suite 1,015 passing / 55 opt-in skipped (before adding the two incoming-banner tests and two voice-history UI tests); final focused call suite 37 passing including those UI tests. TypeScript, production build and focused ESLint passed. Provider/audio browser calls are mocked; actual Android audio and production Maya history remain manual acceptance checks.

### Contact loading follow-up

Call history is now a labelled, always-visible link below the conversation header and on the live call screen; the profile link remains. Chat, profile and live call routes show neutral loading/error UI until their own contact data resolves, rather than rendering the global Tess fallback. Profile-specific housing/media panels are not mounted during this wait. No character facts, portraits, call records or server calling behavior change. Verified profile loading→Maya, live loading→Maya, and error/retry with component tests; no microphone/provider request starts while loading. A merged GitHub change must still be synced and built in Lovable before it is visible in the published app.
