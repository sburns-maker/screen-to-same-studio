# Reference Library and Api18 Hera integration — PR #97

## Implemented scope

Settings → Reference Library supports Tess, Maya, Claire, Riley, Jordan and Ben using the existing authenticated TanStack Start/Supabase application. It inventories existing photos; it never regenerates them to populate the library.

The three independent slots are canonical identity, half-body and alternate angle. Candidates have lazy private previews and a focused review with explicit user confirmation of a clear face, correct identity and suitable framing. Approve/replace, clear, reject, latest-review undo, pagination, reload persistence and partial readiness are supported. Roles are user-reviewed framing choices, not automatic crop/angle approvals.

Approving the canonical library slot selects the **existing approved canonical identity** for provider use. It does not alter a displayed avatar or promote generated output into `visual_identity_registry`. Intentional identity changes continue through existing profile approval/cropping. `currentCanonical` resolves both bundled JPEG/PNG originals and approved private replacements. Existing Riley profile-replacement limitations outside this library are unchanged.

This implementation preserves `mature_romantic` as **non-nude** and does not connect the branch's earlier `mature_nude` type scaffolding to generation. Ben retains his platonic boundary. Existing age, willingness, relationship readiness, refusal/boundary, scene, image-budget and visual-screen controls remain authoritative. No relationship score automatically authorizes a photo. The developer lab keeps its existing explicit test authorization and test-only isolation; configured non-nude romantic tests can use the same Api18 route.

## Official contract and source provenance

Implemented against these official references and the detailed excerpts supplied by the user:

- https://api18.dev/llms-full.txt
- https://api18.dev/docs/models/hera-1.0-image-edit
- https://api18.dev/docs/guides/polling
- https://api18.dev/docs/reference

Direct retrieval from this workspace remained unavailable: initial proxy HTTP 403, later proxy connection failure and a direct DNS failure. Therefore the HTTP implementation is validated against supplied documentation and mocked responses, **not a live provider/account test**.

The adapter uses bearer authentication on `POST https://api18.dev/v1/generate?wait=true`, model `hera-1.0-image-edit`, `prompt`, `images` and `enable_prompt_expansion:false`. It accepts 1–3 references, 10 MB maximum each, JPEG/PNG/WEBP/BMP, and rejects prompts longer than 2,500 characters rather than truncating identity or scene instructions. The existing image pipeline builds a compact non-nude identity/scene/style/continuity prompt specifically for this limit. Unsupported group/Mabel/text-overlay combinations fail before spending; their existing OpenAI workflows remain unchanged.

HTTP 200/202 job objects are parsed strictly. Processing jobs poll `GET /v1/jobs/{id}` approximately every three seconds with bounded backoff for rate limits/transient server errors. Polling timeout never resubmits a paid generation. Known jobs can be checked again by an explicit owner-authorized **Refresh status — no generation** action in Settings. That action does not invent image delivery, revive failed chat actions or resubmit generation.

Completed outputs are downloaded immediately from `job.data[0].url`. The `/v1/files/{id}` redirect is followed manually: the API key is sent only to the fixed Api18 files endpoint; CDN hops must be HTTPS and exact-host allowlisted, and never receive the key. Private/IP/local destinations, unexpected paths, unsafe redirects, excessive hops, non-image MIME, mismatched magic bytes and outputs over 20 MB are rejected. Successful bytes pass existing visual QC and persist in the existing private photo bucket through the existing delivery flow. Temporary provider URLs are not exposed as chat attachments.

## Inventory, immutable references and privacy

Queries use the actual schema: owned `conversations`/`characters`, visible and read character-sender `messages`, matching `generated_images`, and message `generated_path`, `generated_image_id` when present, `photo_type`, `photo_identity.canonicalSha256`, passed identity screening and `photo_visual.character`.

Unknown/incorrect identity metadata, unread/future images, object photos, invalid paths and other characters/users are excluded. Older legitimate images without QC metadata are not automatically trusted. No historical metadata is invented. Message pages have 25 rows; ledger/rejection lookups are bounded to that page. The mutation RPC revalidates the source, owner, current canonical hash and private storage object.

Reviewed byte hashes bind approval to the actual preview and prevent subsequent content changes from silently becoming references. The database prevents duplicate assets and identical bytes across slots. Canonical changes invalidate old slots; undo cannot restore incompatible sources. Missing/deleted/changed files fail closed.

Preview APIs return authenticated image bytes, not provider signed URLs. Provider preparation rechecks approved sources and ordering: canonical, half-body, alternate angle. One or two references are supported if the canonical slot is approved. When needed, original canonical bytes are copied under `user/reference-library/character/hash.ext` in the private `tess-photos` bucket without changing the source. The copy is hash-checked and not overwritten. Provider URLs are signed server-side for 30 minutes and preflighted for external fetchability before a paid submit. The library does not make storage public.

No production photo bytes or production database were accessed during development. Test bytes and databases are local fixtures.

## Durable jobs and spending controls

`0048` adds an owner-readable, service-written Api18 job ledger. A valid existing image action and existing image-attempt reservation are required before any provider reservation. User-level advisory locks, stable action/request hashes, unique active jobs per character and idempotent receipts ensure concurrent/retried actions cannot create multiple paid submissions.

The ledger stores job ID, status, reservation, reported cost and sanitized failure code; **never prompts, reference URLs, API keys or raw provider errors**. Known jobs are polled, not resubmitted. A submit whose outcome is unknown remains reserved and blocks another Api18 job for that character. It requires provider-dashboard investigation if no job ID was returned; the system deliberately cannot guess an ID or claim an automatic recovery. Users can disable the Api18 preference and keep ordinary providers. Ledger costs survive conversation resets so resetting a character cannot reset spending limits.

Per-job estimates and per-user UTC-day/rolling-30-day caps must be configured explicitly. Actual `cost_usd` is reconciled when reported. Unknown costs/refund-pending charges stay conservative; failed provider jobs are marked refund-expected, without inventing confirmation of returned account credit. Explicit rejecting HTTP 4xx responses are recorded as uncharged failures; ambiguous server/connection failures remain reserved. If actual price exceeds the per-job estimate, further reservations require reviewing/increasing that estimate while remaining within the day/month caps. These controls are not a guarantee against an upstream provider price change; use provider-side account spending controls too.

Api18-specific identity QC failures do not automatically buy a second image. The existing OpenAI identity retry behavior is unchanged. Reviewing references and refreshing job status do not invoke generation.

## Configuration in Lovable — no SSH or production SQL

After reviewing draft PR #97, authorize merging/deployment separately; none is automatic here.

1. Sync the reviewed code into Lovable. Apply additive **0047 then 0048** through the existing migration runner after 0046. Do not alter historical migrations, reset data, or insert ledger rows. Installation performs no provider calls or reference approvals. Let Lovable regenerate Supabase types; the source includes new table/RPC shapes derived from the migrations for pre-install compilation.
2. In preview, open Settings → Reference Library, select an existing contact conversation, read the candidate photos in Messages, and review/approve the canonical slot plus optional half-body/alternate-angle references. Test reject/undo, refresh persistence and account isolation. Keep storage private.
3. In **Lovable Cloud → Secrets**, configure server-only values:
   - `API18_KEY` — never put it in browser settings or Git.
   - `API18_ENABLED=false` initially.
   - `API18_JOB_RESERVATION_CENTS`, `API18_DAILY_BUDGET_CENTS`, `API18_MONTHLY_BUDGET_CENTS`: positive integer cents; job ≤ daily ≤ monthly. Set the job estimate from verified Hera pricing, not a guessed value. Maximum configuration bounds are 10,000 / 100,000 / 1,000,000 cents respectively.
   - `API18_OUTPUT_HOSTS`: comma-separated **exact verified CDN hostnames** from Api18 documentation/account support. No wildcard or arbitrary client hostname. The first Api18 files endpoint is handled separately.
4. Verify the Api18 account has usable API credit (introductory playground credit may not suffice). Record the current ISO timestamp in `API18_ACCOUNT_CREDITS_VERIFIED_AT`. This is an operator-confirmed dashboard check, not an invented balance API call. It expires after 24 hours; refresh it only after actually rechecking the account.
5. Retain existing OpenAI/Lovable visual-screen and image configuration. Once configuration/credit/CDN hosts are checked, explicitly set `API18_ENABLED=true` for staging and enable the per-character Api18 non-nude preference in Settings. Enabling requires an approved current canonical slot and explicit adult attestation. Attestation is not a claim of third-party age/identity verification.
6. Explicitly authorize one non-nude staging test through the existing developer photo lab or eligible normal conversation. Verify actual charge, private persistence, identity screening and delivery. CI never performs it. Only publish after manual acceptance and separate authorization.

Normal categories keep the working provider. Mature non-nude images also retain it until the server flag **and** separate per-contact Api18 preference are enabled. An explicitly selected but misconfigured Api18 route fails closed rather than silently sending private references elsewhere.

## Migration / RLS contract

`0047_photo_reference_library.sql`: `photo_reference_state`, `photo_reference_slots`, `photo_reference_rejections`, `photo_reference_actions`; role/content uniqueness, provenance checks, revision fences and latest-action undo.

`0048_api18_generation_jobs.sql`: durable provider jobs, owner-read RLS, service-only reservations/updates and conservative budget reconciliation. Cost records are independent of the original action row and conversation deletion; conversation association becomes null when deleted.

All new tables explicitly revoke inherited anonymous/authenticated writes, including permissive default ACL environments. Runtime RPCs verify the service role. Authenticated server functions bind the user from middleware. Existing messages, identities, relationships, memories and histories are preserved. No production migration was executed.

## Validation and remaining acceptance

Automated tests cover RLS/ownership, stale canonical and byte hashes, unread/future/source/path rejection, duplicate content, reject/undo, idempotency, concurrency, reference count/order/expiry, preflight failure, HTTP 402/429/5xx, polling/recovery, redirect credential isolation, output validation, budgets and the mobile review interface. External APIs are mocked. The real migration runner is tested against disposable PostgreSQL 17.

Remaining manual checks: real Api18 credit/pricing/CDN details, production inventory and generated types, Android Chrome/PWA review UI, live image quality and actual billing/refund behavior. A status-refresh success alone is not proof that a photo was delivered. Raw audio/video, canonical promotion, existing messaging and housing behavior are not redesigned by this feature.

### Final local results

- Full default suite: **988 passed, 55 opt-in tests skipped** (121 files passed, 3 skipped).
- Real Drizzle/PostgreSQL 17 compatibility suite: **39 passed**, including clean full-journal installation and history preservation through 0047/0048. This uses a disposable local database.
- Focused reference/provider/UI/identity suite: **62 passed** with all external requests mocked.
- TypeScript: passed. Production build: passed. `git diff --check`: passed.
- New/rewritten module and test ESLint checks: passed. Changed legacy files were also checked with only their existing Prettier rule disabled; repository-wide historical formatting debt is not represented as fixed.
- Remote GitHub CI and live Api18 billing/quality were not verified from this workspace. A reviewed GitHub Actions workflow is included.


## Editable mature-romantic wardrobe lab (three options)

Open an authorized character's **Simulation Debug → Developer photo category tests → Mature romantic wardrobe test options**. There are three blank text areas: Wardrobe option 1, 2 and 3. Type clothing descriptions, select a radio option, and press **Generate Mature romantic (non-explicit) test**. Blank options retain the default scene. These settings are stored locally on that device for that conversation only, and not in shared character state.

Only the selected description (max 400 characters) is sent into the isolated developer-test scene. The normal Api18 switch and per-character settings still control provider routing; testing may incur provider charges. The server validates the text with existing non-explicit scene safeguards and applies it only to `mature_romantic` developer tests. It does not change automatic image prompts, chat preferences, character boundaries, or reference approvals. No explicit nude generation is enabled.

To edit the default scene in source, update `PHOTO_LAB_PRESETS.mature_romantic.scene` in `src/lib/developer-photo-lab.ts`. The user-entered choice is appended by `generatePhotoLabTest` in `src/lib/developer-photo-lab.server.ts`; the three user-editable fields are in `src/components/DeveloperPhotoLab.tsx`.
