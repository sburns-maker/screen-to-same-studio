# Independent photo sharing and controlled testing

## Source synchronization

Fetched all configured remotes on October 22, 2026. The sole advertised source branch was `origin/main`, at `b79e898b5bfa05fd05df66dd9c330e24710e75cb` (`Saved clinic memory to DB`). Local branch `work` retained the earlier Codex direct-OpenAI commit `ef2002d`; merge commit `091b91a` preserves both histories. No published history was rewritten. The checkout was clean before synchronization. This verifies source history, not which revision Lovable has published.

Lovable added deterministic voice/history cleanup for every character, topic-loop guards, stronger memories for in-person events and gifts, calibrated relationship math, canonical event tags, character/weather refinements, user-uploaded photos with cached vision descriptions, and an initial photo prompt nudge. The text-provider merge keeps the previously requested direct `gpt-6-luna` engine instead of restoring the upstream Astra fallback. Lovable's direct-image and vision support is retained.

The merged baseline passed 195 tests, TypeScript checking, and the production build before this feature work.

## Why photos were not appearing

Source inspection found a working generation/storage/rendering pipeline, but several stacked gates:

- Photos were considered only after a reply or normal text-initiation decision. There was no separate opportunity that could motivate initiating a photo.
- Prompts strongly preferred `photo=null`, then a second random generation roll discarded some willing model choices. The new upstream nudge helped, but did not remove those independent gates.
- All characters used the same photo cadence. Cooldowns mostly counted a short recent-message window, not elapsed time.
- `createGeneratedPhoto` demanded `LOVABLE_API_KEY` even when the upstream image provider selected `OPENAI_API_KEY`.
- Image generation and relationship writes preceded the real-time sleep decision. Provider/storage failures were largely invisible, and a caption could survive without its intended image.
- Message insertion was not a durable delivery operation. Notification sending and marking were ordered differently between initiation and the sweep, permitting duplicates on interrupted attempts.

These are source-level findings. Production secrets, reference objects, image quality, cron execution, and browser notification permissions were not validated through a paid/live test.

## Behavior and safety

`photo-opportunities.ts` considers personality, current activity, interest, photo boundaries, eligible categories, elapsed time, recent initiations, and message cooldowns. Maya shares more readily; Tess shares dry everyday moments; Claire favors garden/outdoor details; Jordan is substantially more selective. Ordinary object photos remain possible below selfie thresholds. Neither attraction nor flirting triggers sharing. Opportunities are deterministic within each character's time window; repeated polling never rerolls them.

Default autonomous minimum intervals are Tess 8 hours, Maya 6, Claire 12, Jordan 24, and Ben 12, plus minimum intervening own messages (4/3/5/8/5). Frequency preferences adjust opportunity time/message limits. These are ceilings, not promises to send. The model can decline or choose text only. Active/user-requested photos retain the existing message cooldown and additionally have a one-hour minimum interval. All photos are blocked during sleep, busy/incompatible activity, or relevant boundaries. Spontaneous generation has no second random veto after the character chooses a valid photo.

All autonomous and active paths use the existing `runTurn` prompts, state math, memory recall, photo-policy enforcement, canonical references, private storage, attachment metadata, mobile rendering and notifications. Proposed compositions and exact scenes are checked against recent generated images; repeats are suppressed rather than charged again or forced into a contextually wrong pose. Reference identity instructions and patient/bystander privacy instructions remain mandatory. The renderer still uses private signed URLs; no image is put in a push payload.

With the service credential configured, stable turn IDs reserve an action in the existing service-only `job_runs` ledger. This also covers text-only initiations and replies, preventing background retries from duplicating their messages. Image calls have a 90-second timeout and no automatic retry. Uploaded images use the action ID as their storage filename. A prepared delivery contains the fixed message IDs, image metadata, state and memory plan. `deliver_photo_turn` commits them in one transaction; retries reuse the plan, and an obsolete plan cannot overwrite newer state or answer an older user message. Generated pending attachments are preserved when later text arrives. Pure text calls without the service binding retain the previous non-transactional fallback; this does not enable paid photos.

The world tick resumes prepared deliveries before making new AI calls. A crash between a provider accepting a request and the prepared plan being durably saved is inherently ambiguous: the same action is never automatically regenerated. A five-minute stale reservation releases the conversation but retains its unique action ID. A provider may charge for a lost/failed result; inspect the ledger/provider usage rather than deleting the record and rerunning it. Orphaned storage objects may need later manual cleanup. The implementation does not promise exactly-once image-provider billing under network failure.

Notifications use one primary bubble per turn and a shared atomic claim. Push attempts happen only after visibility and honor mute/read status and quiet hours. They are **at most once**: a failed network delivery can be missed rather than duplicated. Scheduled initiation attempts wait briefly for the first bubble, then use the ordinary push sender. Other delayed/developer deliveries use the existing world-tick sweep, so notification latency depends on the configured cron frequency. No fake phone notification is created.

## Required configuration before a live test

Do this in a private development/staging environment after review; these changes have not been deployed and no production migration was run.

1. Review and apply **only the new additive function migration**, `drizzle/migrations/0008_atomic_photo_delivery.sql`, through the established migration workflow. It adds no tables/columns and resets no data. Keep the existing applied-migration history; do not replay the initial migrations against an existing live database. The function is executable only by `service_role`. The code probes its availability before a paid image request.
2. Configure server secrets `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_URL`; retain existing public Supabase settings. Store secrets in Lovable Cloud → Secrets or an ignored local server configuration, never frontend `VITE_*` variables or the tracked `.env`. Allow HTTPS access to `api.openai.com` and the configured Supabase project. Direct text uses `gpt-6-luna`; inherited direct image generation/editing uses `gpt-image-1-mini`; user-photo vision uses `gpt-4.1-mini`. Account permissions/billing must cover the relevant APIs. `node scripts/verify-openai.mjs` checks the direct text model/structured-output path without touching the database.
3. Confirm the private `tess-reference` bucket contains `canonical.jpg` for Tess, and `maya.jpg`, `claire.jpg`, `jordan.jpg`, and `ben.jpg` for those characters' selfies. `mabel.jpg` remains optional. Selfies fail closed if their canonical reference is missing. Confirm `tess-photos` is private and its existing owner-based storage policies are present. Ordinary object/environment photos do not require a person reference.
4. For developer controls, set `ENABLE_DEV_PHOTO_ACTIONS=true` and `DEVELOPER_PHOTO_USER_IDS` to a comma-separated allowlist of your authenticated test-user UUIDs. Both are checked server-side; other users cannot invoke the action. Disable the flag after testing. No photo control or manual world-tick action is shown to users outside this allowlist. Raw server job history/control is restricted to the allowlist; photo delivery plans are never returned by the timeline endpoint.
5. For closed-app behavior, retain the managed authenticated `/api/public/jobs/world-tick` schedule and its cron secret. Push additionally needs the existing `VAPID_PRIVATE_KEY`, a valid subscription, browser/OS notification permission, and compatible installed/mobile-browser support. Do not rotate an existing VAPID key merely for this test.

## Controlled Tess clinic test

Open Tess's existing conversation debug screen at `/debug/<conversation-id>` in the development/staging app. Under **Controlled photo opportunity**, enter current context grounded in that conversation's actual established memories. For the October 22 scenario, a suitable one-off input is:

> Tess is taking a brief break at her clinic desk. Earlier this morning he brought black coffee without sugar and the little fidget “magic scheduling reshuffle button”; she put it in her clinic survival-kit drawer. The staff scheduling situation is still frustrating. If she independently feels like it, an ordinary amused/tired desk selfie with the coffee and button would fit. Keep tomorrow's established Friday, October 23, 5:30 PM dinner at Fanelli's Italian Villa unchanged. No patients, records or other people in frame.

This input is developer test context, not a stored script, forced caption or permanent behavior. Only use those facts if they belong to the selected conversation; the normal engine's memories remain authoritative.

Click **Preview eligibility**. It performs no text/image generation, metadata caching, storage upload or database writes; it reports schedule, eligibility and configuration readiness. **Ask character to share** becomes available after an eligible preview with the required bindings/migration. For this controlled action the stock-image list is omitted so it cannot substitute an old work selfie. It asks the normal character engine to decide, generates with the canonical reference if she chooses a new selfie, uploads, atomically delivers the message(s), and leaves notification handling to the normal pipeline. No relationship score or memory is reset. The same request ID is retained on retries. She can decline, and real schedule/boundary/cooldown checks are never overridden. If her real schedule is busy or asleep, the live action remains unavailable.

For an immediate, free controlled test without waiting for a real clinic break, run:

```sh
npx vitest run src/test/photo-turn.test.ts src/test/photo-opportunities.test.ts src/test/photo-delivery-sql.test.ts
```

These tests use a clinic schedule fixture, a mocked image endpoint, and a disposable embedded PostgreSQL instance. They exercise the real prompt builder/upload/attachment preparation and transaction logic without contacting production or incurring image charges. They do not prove visual likeness of a real paid sample. Compare one reviewed generated sample with the private reference before publishing.

## Time modes and remaining scope

Real-Time mode keeps normal availability and reply timing. Practice keeps the existing short reply delay and the same relationship math; opportunity windows/cooldowns remain tied to real time, so accelerating testing does not accelerate relationship development or image spending. Background tick work remains bounded. The world-job lease was increased from 3 to 15 minutes to cover the existing four-call budget plus bounded image calls; no second overlapping world tick should reclaim a still-working image job.

A Hybrid label could expose fast replies with the real-world schedule, but Practice already preserves that world clock. No third mode/schema change was added; it would not resolve photo initiation and would complicate this review.

All changes are local pending review. No source was pushed, no application was published, no migration was applied to a remote database, and no live image/notification was generated.

## Validation completed

Final checks: 230 tests across 25 files passed; `npx tsc --noEmit` passed; `npm run build` passed. Coverage includes the real SDK structured text serialization, personality eligibility, time modes, direct image requests and multiple reference encoding, reference/storage failures, durable retry handling, atomic PostgreSQL rollback/replay, memory preservation, and concurrent notification claiming. Frozen dependency setup was repeated successfully. The development landing page returned HTTP 200 with the expected content. No paid provider call, production migration, or real device push was performed.
