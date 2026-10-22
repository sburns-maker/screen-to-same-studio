# Mobile media viewer and deliberate identity management

Built from `origin/main` **f828bac**, which already merged the contextual photo/encounter expansion (PR #10). Work is isolated on `codex/mobile-media-and-identity`. No deployment, live migration, paid generation, provider/model change, cooldown change or production-data edit was performed.

## Reused architecture

The original photo modal, private `tess-photos` attachments, curated asset library, reviewed avatar registry, owner-authenticated server functions, TanStack queries and existing user-video pipeline are extended. Conversations, memories, relationship math, schedules, autonomous jobs, image budgets, atomic photo delivery and video-upload receipts are preserved. There is no active AI-video generator in this baseline; optional paid generation remains unimplemented/disabled. This change does not enable one.

## Implemented behavior

- Sent/received curated images, generated images, user-uploaded images and supported video attachments open in a shared full-screen viewer. It resolves the stored original object, never requests a thumbnail transformation. Pinch/double-tap zoom, bounded panning, unzoomed horizontal photo swipes, previous/next buttons, keyboard navigation, close/Escape, focus restoration and a temporary browser-history entry support mobile navigation and Android Back. Videos use native playback controls. Existing historical metadata remains valid.
- Save and Share are separate actions. The original bytes become a correctly named JPEG/PNG/WebP/GIF/AVIF/MP4/WebM `File`. Save uses a file picker where available with a live gesture, otherwise an ordinary Blob download. The feedback says **download started**, not falsely “saved to Gallery.” Native file sharing uses the Android/browser share sheet where available; its installed targets are controlled by the operating system. Unsupported native sharing falls back to downloading the actual file. If preparation outlasts share gesture permission, a second explicit Share tap uses the prepared file. User cancellation is silent.
- Radix long-press/right-click actions offer View, Save, Share, supported PNG clipboard copying, details and Set as profile photo for received character photos. Protected signed URLs are never copied or handed to other apps. Unsupported copy formats fail visibly and suggest Save/Share. No unrestricted storage links are introduced.
- The existing Shared photos route is now **Shared media**, including sent photos and private videos. It pages 60 message metadata records at a time, sorts loaded media chronologically, deduplicates by message ID, lazily prepares nearby tiles and keeps the conversation boundary. Load older media continues through pages containing only text. Chat swipe navigation covers currently loaded conversation messages; the gallery can page farther back than the chat's existing 1,000-message window.
- Profile-picture options include View, Change and shared-gallery selection. Received photos can be selected from the gallery or long-press menu, including older curated photos. Device uploads accept JPEG/PNG/WebP. The editor previews a circular crop, zoom and horizontal/vertical positioning, persists a 512px JPEG display avatar and immediately invalidates the shared avatar query used by inbox/chat/People/profile. The existing screened-candidate selector/reset remains compatible.

## Display avatar versus canonical identity

An avatar edit alone **does not** change generation identity. The editor has a separate opt-in canonical checkbox, reference/candidate comparison and a second explicit same-person approval. The warning explains that low-quality/obscured faces, groups, pets, illustrations and different people are unsuitable. No automated face-match success is claimed.

When explicitly approved, the uncropped source is normalized to JPEG (maximum dimension 1600px); it is separate from the circular display crop. Server checks enforce JPEG structure, 256px minimum side, 8192px maximum dimension and 4MB maximum bytes. Original conversation photos and video objects are not modified or downscaled. Original bundled portraits are preserved permanently. New profile files use immutable UUID paths under `<owner>/profile/<character>/` in the existing **private** `tess-photos` bucket. Save refuses a missing/public bucket.

`currentCanonical` resolves the owner's approved character row. Defaults use the original embedded portrait. Explicit replacements are downloaded server-side, checked against their stored SHA-256 and supplied as actual reference pixels to the same image provider and visual screen. Missing, unapproved, altered or cross-character references fail closed. Foreground, autonomous, contextual and developer photo generation all pass through the same resolver; preview/setup/debug diagnostics use it too. Ordinary generated output never writes the identity registry. Avatar edits are user UI preferences and do not fabricate a fictional character action or memory.

The database prevents exact approved-reference hash reuse across characters in one tenant. Received-photo selection verifies the owned conversation, character, sender and visibility both server-side and transactionally in SQL. This does not prove two differently encoded photographs depict different or identical faces; visual approval and the existing fallible output screen remain necessary. Reference-conditioning/provider fidelity is not guaranteed. Group photo restrictions and NPC approved-anchor requirements remain intact. Future video generation must call this resolver and independently validate reference support; no video fidelity claim is made here.

## Reviewed migration and security

New migration: **`drizzle/migrations/0016_media_profiles.sql`**, after 0015; journal entry included. It adds `active_storage_path` to the existing registry, an owner-readable/service-writable `profile_identity_changes` audit table and service-only transactional profile functions. It wraps the old screened selection so it clears a custom display crop when explicitly selected/reset, preserving the approved anchor. No historical rows or media are deleted/replaced. No new provider key, paid service or feature activation is required.

Apply through the existing migration runner, once, in a transaction. Do not run the SQL repeatedly by hand: it renames the earlier screened function. An already-migrated deployment must use the migration journal. Missing 0016 produces an explicit profile-save setup error; existing viewing, sharing, messaging and old reviewed choices remain usable. Database rollback alone cannot undo a deliberately changed identity; retain private objects/audit records and review any reference reversal explicitly.

Mutations authenticate the user and check their conversation before upload. Clients cannot call the service-only SQL functions or write the identity registry. Owner RLS still controls private photo/video reads. Opening, saving and sharing re-sign private originals; known signed profile URLs from this backend are refreshed too. No service-role key, unrestricted URL or provider secret reaches the viewer. Uncertain upload/commit failures do not delete possibly live objects. Abandoned immutable uploads may require a later reviewed cleanup job; no automatic retention/deletion is introduced.

## Validation

Automated tests use disposable PostgreSQL, mocked Storage and mocked paid providers, without production credentials or external generations. Coverage includes original-media selection and MIME filenames, private URL renewal/errors, native file sharing payloads, ordinary browser downloads, viewer navigation/video controls/Back/zoom/pinch, explicit canonical approval, persistent avatar/reference separation, tenant/source isolation, source integrity, service-only SQL privileges, exact-reference collision prevention and provider receipt of replacement reference pixels. Existing memory, relationship, world, image and video tests remain in the full suite.

**Final automated results:** 405 tests across 44 files passed; TypeScript `tsc --noEmit`, production `vite build` and focused ESLint checks passed. Existing build alias/PWA warnings remain. DOM tests simulate gestures; they do not prove native Android rendering or OS behavior.

## Preview setup and manual acceptance — no SSH required

Ask Lovable:

> Load the `codex/mobile-media-and-identity` review branch into preview. Confirm migrations through 0015. Review and apply only `0016_media_profiles.sql` through the migration runner in a transaction to the intended preview database. Preserve existing conversations, identities, media, memories and relationships. Confirm `tess-photos` and `user-videos` remain private. Do not publish, enable AI video generation or run paid generation. Report the migration/check results.

A preview can share a production database: verify the database target before migration or approval tests. If there is no isolated database, review the SQL first and arrange its application explicitly; no migration was applied by Codex.

1. In Android Chrome, open an old curated photo, a received generated selfie and a sent photo. Check full-screen resolution, pinch, double-tap, pan bounds, left/right navigation and close/Back returning to the same scroll position.
2. Save a photo and existing MP4/WebM. Check Downloads and the actual file resolution/format; gallery indexing is OS-dependent. Share each to an installed app and confirm the attachment is the media file, not a signed URL. Check cancellation and unsupported sharing. Large files may need the second Share tap.
3. Long-press a photo/video without accidental activation while scrolling. Try supported PNG Copy, details and full-screen actions. Videos should play/pause/seek in the full-screen native player; codec support is browser-dependent.
4. Select a received Tess photo as display avatar only, crop/reposition and save. Verify inbox/chat/People/profile immediately, refresh, sign out/in and reopen the installed PWA. Confirm another character's avatar is unchanged and the canonical reference/hash is unchanged.
5. Upload a suitable same-person JPEG/PNG/WebP, compare the actual current identity reference, explicitly approve canonical replacement and confirm its new hash in developer diagnostics. A real generation is a separate paid/manual acceptance step: do not run it automatically. Inspect varied outputs against the approved reference; a screen pass alone is not identity proof.
6. Test Claire/Maya/Jordan/Ben separately, expired links after inactivity, missing media and denied downloads. Repeat the viewer/download/share/Back tests in the installed PWA. Verify no current histories, plans, scores, media or memories were reset.

## Limits and costs

No new AI calls are added by viewing, editing, sharing or approval. Private Storage bytes/egress increase; immutable profile history is retained. Existing image generation and screening costs remain when separately requested. User uploads/videos preserve the current limits; unsupported codecs report errors. New NPC selfie approval/generation and AI video generation are not enabled.

Android Chrome generally downloads to Downloads; websites cannot guarantee a file appears in Photos/Gallery or choose a gallery album. System file pickers, file sharing and clipboard support vary by browser/permissions and require HTTPS. Share targets are OS-selected. Native Android/PWA acceptance, actual provider likeness after an approved replacement and refresh/re-login on a live preview remain **manual and unverified** in this workspace.

## Principal files

- `src/components/PhotoViewer.tsx`, `ConversationMedia.tsx`, `VideoAttachment.tsx`: viewer, contextual actions and shared album navigation.
- `src/components/ProfileImageEditor.tsx`, `ProfilePhotoPanel.tsx`: crop/upload/explicit identity approval and current avatar/reference display.
- `src/lib/media.ts`, `media-url.ts`, `media-context.ts`: original-file actions, authenticated link renewal and conversation media selection.
- `src/lib/profile-media.server.ts`, `profile-media.functions.ts`, `visual-profiles.*`: authenticated persistence and approved identity resolution.
- `src/lib/tess-image.server.ts`, `tess.functions.ts`, `photo-setup.server.ts`: actual reference conditioning and current-reference diagnostics; no model/settings changes.
- Chat/profile/shared-media routes: entry points, lazy paged gallery and live avatar updates.
- Migration 0016, journal, Supabase supplemental types and new/updated media/profile/identity/setup tests.
