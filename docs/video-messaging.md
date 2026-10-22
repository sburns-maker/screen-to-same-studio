# User video messaging and optional generated-video investigation

Review branch: `codex/video-messaging`, based on living-world expansion **724dab4**. This work adds user uploads first. It does **not** enable or call any video-generation provider, change the configured text/image models, apply a live migration, deploy, or modify existing character histories/photos.

## Implemented: user uploads

Established-character chats now have a **Send a video** control beside the existing photo control. Choose an MP4 or WebM; current composer text becomes its caption. Native inline playback has controls, `playsInline`, metadata-only preload and no autoplay. Browser-supported MP4 with H.264/AAC is the most practical initial mobile format. MOV/HEVC needs conversion outside this app; the feature does not promise every codec inside an MP4/WebM container is playable.

Limits: **25 MB per file, a browser preflight of up to 60 seconds, and ten reservations per user per UTC day**. The server enforces the declared duration range, byte count and container signature. It does not independently decode/prove actual duration, codecs or the entire file. These are upload safeguards, not a media safety scanner. Browser metadata validation can time out or reject some otherwise valid files. Original bytes/metadata are preserved; no transcoding, thumbnail service or third-party video-analysis call was introduced.

The caption and a truthful “video/audio not analyzed” notice enter the existing character text pipeline. **The model cannot watch or hear these videos in this release.** It should acknowledge the caption or ask what the user wants to share, without pretending to observe content. One normal character reply can incur the existing Luna charge; uploading/playback itself adds storage/bandwidth, not video-generation fees. Existing photo generation/analysis rules remain unchanged.

New discoverable NPC threads from Phase 2 are still text-only. Existing main-character photos and galleries remain exactly on their current image path. No video gallery, audio transcription, offline video queue, resumable chunked upload or background transcoding is claimed.

## Storage and delivery

Review additive **0013_user_video_uploads.sql** after the existing migration chain:

- A new **private** `user-videos` bucket allows MP4/WebM with a 25,000,000-byte object limit. Existing image buckets/objects/policies are not edited.
- `user_video_uploads` records a stable action ID, verified owner/conversation, immutable caption/path/type/size/declared duration and pending/sent state.
- `reserve_user_video` serializes per-user reservations and caps them at ten/day, including abandoned attempts. Reusing an ID with changed data fails.
- Authentication occurs before a server-issued, path-scoped upload token is returned. It is an upload capability, not a service-role/OpenAI credential. The browser uploads directly to storage; large files do not pass through a server-function JSON body.
- Finalization loads only the verified owner's receipt, checks the private object's actual byte count and MP4/WebM header, then calls service-only `deliver_user_video`.
- The RPC commits the ordinary `messages` row and receipt status together. Concurrent/replayed confirmation produces one message, reports whether it was newly delivered, and never reuploads or regenerates anything.
- Playback uses owner-authorized, short-lived signed read URLs. Missing/expired/unsupported playback fails visibly and has a manual link refresh.

**Send a video → Confirm pending upload** recovers uploaded-but-unconfirmed media after reload. Confirmation does not upload the file again. A new receipt is not silently created to retry delivery. If the object never finished uploading, confirmation fails honestly; select the file again only after checking the existing pending attempt. Upload capabilities expire according to Supabase's signed-upload behavior; application reservations expire for finalization after 24 hours. There is no automatic media deletion in this change. Abandoned private objects can remain and consume storage; a later reviewed retention job should remove only expired, undelivered objects via the Storage API. Do not delete live attachments or manipulate storage SQL rows as a substitute for deleting object bytes.

A missing migration shows a setup error only when using video controls; existing text/photos continue working. A public or incorrectly size-configured video bucket is refused. No storage URL, video bytes or upload token is put in character prompts or usage logs. Captions remain ordinary private conversation data.

## Provider investigation: evidence and limits

Public documentation/pricing requests for OpenAI, Runway, Google, Luma and fal were blocked by this workspace's network proxy (CONNECT 403). Current official SDK repositories were readable and inspected without installing them in this application:

| Candidate | Verified source/API shape | Identity-reference implication | Price/latency status |
| --- | --- | --- | --- |
| **Runway** | Official Node SDK **ca0284d** (2026-10-13). `imageToVideo.create` includes `gen4.5` (2–10 seconds), `gen4_turbo`, `veo3.1`/`veo3.1_fast` (4/6/8 seconds), plus other catalog entries. HTTPS/upload/data-URI `promptImage` input is documented; SDK says data URI up to 5 MB for Gen4.5. | Actual canonical image bytes can be supplied as an input frame rather than an unread URL in prose. This anchors an initial appearance; it does not prove the same face persists during movement. Multiple prompt images are not automatically independent-person identity references. | Current dollar/credit rates **unverified**. Creation returns estimated credits; terminal tasks report final credits. Polling defaults around six seconds with jitter; helper timeout defaults ten minutes. These are polling/wait settings, **not measured render times**. |
| **Google Veo** | Official `js-genai` SDK **41aaecb**. Sample uses `veo-3.1-generate-preview`; types include input image bytes, asset/style `referenceImages`, duration/resolution, optional audio, last frame and async operations. | Promising candidate for explicit asset references. Support varies by model/API/region; the shared SDK type is not proof that every Veo version accepts every reference field. First-image and reference-image modes can be mutually exclusive. Requires model-specific human/reference policy and account checks. | Current rate/resolution/audio pricing **unverified**. Official sample polls every ten seconds until done. No account benchmark, completion percentile or generation-time SLA was established. |
| **Luma** | Official `lumaai-node` SDK **be2c3c4**. Video schema includes `ray-2`/`ray-flash-2`, image keyframes, 5s/9s duration symbols, resolution, callbacks and async generation states. | Video keyframes accept actual image references via URLs. Do not confuse the SDK's **image-generation** `character_ref` with a verified video character-identity control; these are different schemas. A private canonical asset would need a narrow, short-lived provider-readable delivery mechanism. | Current price, model lifecycle/account access and generation time **unverified**. Callbacks/status polling are appropriate; no paid latency test was run. |
| **OpenAI Sora** | Official `openai-node` SDK **e17e0d4** (2026-10-22), `src/resources/videos.ts`, marks the Sora API deprecated: **“scheduled to permanently shut down on September 24, 2026.”** Legacy schema still lists Sora 2/Pro, input references and 4/8/12-second clips. | The continued presence of SDK symbols does not establish a usable service, accepted fictional face inputs or current identity capabilities. A video-derived character resource is not an approved replacement for the canonical profile portrait. | The announced shutdown date is already past relative to this task. **Exclude Sora from a new integration pending explicit official replacement/lifecycle verification.** Do not reuse old Sora price tables as current quotes. |
| **fal / Kling and other aggregators** | Public candidate page could not be retrieved. No account call or official model contract was independently inspected here. | Potential model-specific image-to-video/multi-reference routes need evidence, explicit data-handling review and exact model pinning. | No verified current price/capability/latency recommendation; not configured. |

Verified API schema capability is different from current account availability, quality, supported human-reference policy and current billing. No video was generated in this investigation. There is no demonstrated “best identity model” and no guarantee of matching Tess/Maya/Claire/Jordan from these schemas alone.

Source links:

- [OpenAI official SDK and shutdown annotation](https://github.com/openai/openai-node/blob/e17e0d4/src/resources/videos.ts#L134), [video guide](https://developers.openai.com/api/docs/guides/video-generation), [pricing](https://developers.openai.com/api/docs/pricing).
- [Runway official image-to-video schema](https://github.com/runwayml/sdk-node/blob/ca0284d/src/resources/image-to-video.ts), [tasks/cost schema](https://github.com/runwayml/sdk-node/blob/ca0284d/src/resources/tasks.ts), [polling timeout](https://github.com/runwayml/sdk-node/blob/ca0284d/src/lib/polling.ts), [pricing](https://docs.dev.runwayml.com/guides/pricing/).
- [Google official generation types](https://github.com/googleapis/js-genai/blob/41aaecb/src/types.ts), [async video sample](https://github.com/googleapis/js-genai/blob/41aaecb/sdk-samples/generate_videos.ts), [pricing](https://ai.google.dev/gemini-api/docs/pricing).
- [Luma official generation schema](https://github.com/lumalabs/lumaai-node/blob/be2c3c4/src/resources/generations/generations.ts), [generation documentation](https://docs.lumalabs.ai/docs/video-generation).

## Pricing and generation times

**Verified current per-provider dollar rates are unavailable from this environment.** No guessed tariff is embedded in code, and no provider is selected on an unverified price. Before any paid proof, obtain current rates for the exact model, duration, resolution, audio, reference inputs, platform markup, failed/moderated job billing and applicable minimum clip length. Runway's estimate is returned when creating a task, which can already initiate paid work; it is not a safe pre-approval quote by itself. Its SDK also describes saved router price ceilings/model allowlists, but a router must not silently change the approved model/provider or identity capability.

Planning sensitivity **only** (these rates are assumptions, not quotes assigned to any provider):

| Hypothetical output rate | One 6-second clip | 5 clips/month | 20 clips/month | 50 clips/month |
| --- | --- | --- | --- | --- |
| $0.05/second | $0.30 | $1.50 | $6 | $15 |
| $0.10/second | $0.60 | $3 | $12 | $30 |
| $0.40/second | $2.40 | $12 | $48 | $120 |

Add any identity-conditioned source-image generation, reference inputs, video frame checks, optional audio, rejected attempts, provider markup, storage/egress and normal character captions. Videos can dominate the earlier text/image budget quickly. Existing OpenAI prepaid credit or a project spending setting does not automatically cover/cap Runway, Google or Luma bills.

Treat generation as asynchronous: queued → running → succeeded/failed/unknown. Design for waits of minutes and provider backlog rather than a synchronous texting response; **this is an engineering assumption, not a measured provider latency claim**. Clip duration is not processing time. A local HTTP timeout or aborted poll does not prove provider cancellation/refund—Google's SDK explicitly warns that client abort can leave billable service work running. Never submit another paid job just because the first timed out. Measure queue, render, download and validation times separately in an approved small trial.

## Canonical identity for a future optional feature

Recommendation: evaluate a pinned Runway image-to-video route and a model-specific Veo asset-reference route with a tiny approved trial, after current rates/policy/account access are verified. Luma is a useful keyframe comparison candidate; it is not a demonstrated identity solution. Do not change the existing image provider to perform this evaluation.

1. Keep the exact existing character profile JPEG and SHA-256 as the permanent authority (`canonical-profile.server.ts`). Never adopt a video frame, last generated selfie, provider character asset or AI face description as a new identity.
2. Prefer directly supplying canonical bytes as an asset reference where supported. For input-frame-only models, a scene still may first be produced through the existing canonical-conditioned image service and reviewed; retain its canonical provenance and separately compare the output video to the **original portrait**. The provider must actually receive pixels, not a URL mentioned in text.
3. Use only narrow authorized reference delivery: provider-supported bytes/data URI or a short-lived, single-asset HTTPS URL. No public bucket, service credential, long-lived private gallery URL or user-uploaded video as a character identity source. Provider ingestion/queue timing must fit URL expiry.
4. First tests should use a single person, modest motion and short duration. Maintain ordinary clothing/setting variation without redefining facial features. Group video is blocked until every depicted established person can receive a supported independent reference and scene co-attendance is validated.
5. Screen sampled first/middle/end frames and scene changes against the original portrait for obvious fictional-design drift, scene contradiction and text artifacts. A passed initial frame does not validate later frames. A visual model screen is probabilistic; this is not a biometric identity score or proof. Require manual multi-frame visual acceptance before delivery is enabled. Uncertain/mismatched results are withheld.
6. Preserve Phase 4B text avoidance: avoid prominent incidental writing and do not promise perfect text across moving frames. A future correction/edit/render pass has separate costs and cannot silently retry.
7. Portraits do not define a voice. Native generated audio, lip sync, voice cloning and new recurring voice services remain separately reviewed features. Start silent, or with explicitly approved ambient audio, rather than assigning an invented canonical voice.

## Proposed spending and job design — not enabled

Keep generated video as a separate, explicitly opted-in capability. Proposed initial policy: **disabled by default**, no automatic initiation/cron generation, one user-approved job at a time, one clip/day, four clips/month, and a conservative **$1 maximum reserved cost/clip and $4/month/user**. These are suggested ceilings, not provider prices or activated settings. A quote exceeding either ceiling must be rejected, not silently upgraded or charged. A 6-second example at $0.40/s would fail that proposed ceiling. Require a separately approved global account/month ceiling and confirmed current rate table before launch. Missing/unknown pricing or budget means fail closed.

Use the existing action/outbox principles: persist user consent, canonical asset hash, approved provider/model, duration/settings, maximum cost reservation and stable action ID **before** paid submission. Save the provider job ID immediately. One bounded submission; no automatic generation retry on timeout/unknown state, no background exploration triggering paid videos. Durable poll/webhook workers reconcile the same job without resubmitting, deduplicate completion, validate privately stored bytes/frames, then commit attachment/caption and notification atomically through the normal character delivery flow. Polling can be retried with backoff; generation cannot be presumed safe to repeat. A provider idempotency guarantee must be verified rather than assumed.

Track reserved and actual money separately; never release an uncertain reservation merely because a local timeout fired. Provider URLs should be copied to private application storage before expiration. Do not mark an invitation/intention fulfilled until the video message is actually delivered. Existing photo/text budgets must remain separate, with an optional higher-level combined account safeguard. This design is a proposal; no fake provider adapter or success button was added.

## Validation and activation without SSH

Validation: **358 tests passed across 36 files; TypeScript, production build and focused lint passed.**

Automated tests use disposable PostgreSQL, fake storage bytes/capabilities and mocked paid models. They cover supported/unsupported formats, bounded size/duration declarations, container mismatches, owner/conversation isolation, immutable reservation IDs, daily limits, private-bucket refusal, atomic rollback, concurrent/replayed confirmations, existing memory preservation and unchanged image paths. The normal character-turn integration verifies that captions receive an “unanalysed video” notice without calling image analysis/generation for the video.

No actual provider video, mobile upload/playback, production storage or live migration has been tested here. Local API/model mocks establish plumbing, not browser codec compatibility, real provider fidelity or live bucket policy configuration.

After review:

1. Merge in order after the Phase 2 branch, if not already merged. In Lovable request a preview database review and transactional application of **only `drizzle/migrations/0013_user_video_uploads.sql`**, after confirming prior migrations exist. Preserve all current tables, image storage, memories and scores. Do not rerun old migrations or make the bucket public.
2. Retain existing Supabase server/service bindings and normal OpenAI text key. **No video-provider key or new paid service is needed.** The production backend must support a bounded private download of up to 25 MB for finalization; verify memory/request-time limits in preview. Browser upload goes directly to storage.
3. Open an existing character chat in the preview app. Type a short caption, choose **Send a video → Choose video**, and select a small playable MP4 first. Verify one bubble, private native playback, caption preserved and truthful character response. Existing photo upload/generation and old history must still work.
4. Reload before confirming a prepared upload; open the video menu and use **Confirm pending upload**. Verify one message only, including after repeated confirmation. Try invalid, oversized, long and unsupported files. Check a second signed-in account cannot read/sign another user's clip or finalize their receipt.
5. Test actual iOS/Android playback, portrait/landscape clips, expired-link refresh and interruption during upload. Browser format limits may require conversion; no automatic paid conversion is available. Pending failed objects need reviewed retention/cleanup if they accumulate.
6. Run `npm test`, `npx tsc --noEmit`, and `npm run build` in Codex/local CI. No production service-role credential or paid video generation is required for tests.
7. Publish only after user review/preview validation. AI-generated video requires a **separate** provider/rate/identity/budget decision and controlled paid acceptance trial; this upload release does not activate it.
