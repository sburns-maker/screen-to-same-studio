# Final web pass before Android packaging

The app continues to use the same authenticated TanStack Start backend and
private Supabase media. No new migration, key or provider switch is needed for
this pass. Existing conversation focus, call-history memory and housing rules
remain authoritative; the interface does not invent read states, calls or plans.

## Included

- Contact-specific chat accents, consistent cards, larger touch targets, readable
  composer text, safe-area spacing and reduced-motion support.
- Conversation state resets when navigating between contacts. Pending loading
  stays neutral; no other character's name, portrait or draft appears.
- Android visual-viewport sizing keeps the composer above the keyboard while
  preserving pinch zoom. Reading earlier messages no longer forces a scroll to
  the bottom; Latest messages returns to the end.
- Sent means stored. Read requires a saved character reply whose in_reply_to
  matches that user message and the read-receipt preference is enabled. Starting
  a network request, an autonomous text or an unrelated old reply is not a read.
- Missed incoming calls appear in their own conversation with history and a
  call-screen link. Opening a history card never starts a paid session.
- Plan cards distinguish confirmation from missing details, show location/time,
  prioritize an active outing, and link to its existing continuation screen.
- Pending/failed photo cards keep the composer usable. Reloading an unavailable
  existing photo renews its private URL; it does not regenerate an image.
- Offline text replay preserves message IDs and verifies an exact owned match
  after a duplicate acknowledgment. Failed writes stay on the device for retry.
- Shared-home context distinguishes the player's location from the character's;
  sharing a residence alone never proves both are physically present.

## On-device acceptance after review and publication

Use a staging account with existing references and agreed plans. Start with
ordinary messages; paid photo and call tests require separate authorization.

1. Open each of the six contacts; navigate back and forth while data loads.
   Check correct portraits, accents, empty/loading/error states, and text size.
2. At 320px and normal phone widths, open the keyboard, type several lines,
   rotate the phone, and verify the send control stays reachable. Verify IME
   composition doesn't send early. Test light/dark mode and reduced motion.
3. Read older history while a reply arrives; check position and Latest messages.
   Long-press for reactions; quick taps and scrolling must not open the picker.
4. View an existing photo, pinch zoom and swipe, then Android Back. The viewer
   should close to the same conversation. Saving/sharing must use the file,
   never its signed URL.
5. Disconnect, queue a text, reconnect, and refresh during confirmation. Confirm
   one stored user message. Verify failed writes remain retryable and never get
   a fake reply or a false Delivered label.
6. Review an existing missed call and return to chat. Verify saved call dialogue
   remains distinct from an unanswered call. Check microphone permissions,
   saved character voices and ringtone settings with the existing readiness UI.
7. Review an agreed plan, continue an existing outing, and reopen the app.
   Verify its location, completion and shared memories without duplicate events.
8. After a recorded date or call, check a normal follow-up conversation. It
   should retain what happened without repeatedly re-announcing it or claiming
   co-presence from household membership alone.

## APK boundary

Choose packaging after the web build is published and verified. A hosted PWA
wrapper and a bundled WebView have different authentication and API routing
requirements. The TanStack server functions, model credentials and database
service role stay on the server; they must never be bundled into an APK.

For a hosted wrapper, validate the owned domain and Android app links. For a
bundled client, explicitly configure the remote server origin, secure session
handling, CORS and OAuth redirects; relative server-function URLs cannot simply
point at a local file bundle. Preserve HTTPS and private media ownership checks.

Android Back, file sharing/downloads, microphone permissions, foreground audio,
background push and native ringing require testing in the chosen wrapper.
Packaging alone does not add native background ringing. Browser fixture renders
and mocked tests cannot certify those device behaviors. Do not clear app data or
reset conversations to test an update.
