# Phase 3 — architecture audit and implementation

Audit baseline: `origin/main` e37b134. Existing private owner-scoped `world_places`, `social_plans`, RSVP/presence/exchange records, shared-world worker, `town_presence` virtual travel, six stable discoverable NPCs, contact consent, character-only knowledge/memories and the common image/video pipelines are reusable.

Operational: virtual travel uses destination plus arrival timestamp; NPC scenes require arrival and availability; conversations and media persist; the existing leased backend tick advances legacy shared gatherings. Missing: ordinary chat invitation ingestion, partially specified plan fields, a user RSVP lifecycle, travel-linked participation and durable venue actions. Plans currently exposes only manually arranged gatherings. Place data is a small fictional registry; no verified real business addresses are present. World scheduling configuration must still be verified separately in each deployment.

Design: extend the canonical `social_plans` records with a conversation-origin lifecycle and source evidence, keeping legacy gatherings on their existing worker path. Reuse private owner-scoped world places and virtual travel. Add durable visit sessions/actions and explicit participation; never infer user attendance or completed meetings from elapsed time. Keep historical data intact. New features require one reviewed additive migration; no production migration/deployment is performed.

## Implemented slice

This branch integrates latest `main` **edaab95** (including group-photo composition and identity-screen fixes). Existing media providers/models, canonical references, retries, budgets and storage are retained. No image/video provider changes are included.

- **One authoritative calendar:** migration `0019_interactive_calendar.sql` extends `social_plans` instead of introducing a second event store. Unknown date/time/place remain nullable for conversation-origin plans; legacy gatherings retain their required details and existing worker. Common invitation/acceptance/detail/reschedule/cancel phrases are recognized from visible, owned conversation messages. Eastern dates use the message timestamp. No precise time is invented from “afternoon” or “later”; invalid and ambiguous DST times stay unresolved. Explicit Plans buttons enter ordinary user messages and use the normal character reply pipeline.
- **Evidence and consent:** original invitation and most recent relevant message IDs, per-message receipts, both parties' responses, missing fields, conflicts and transitions persist. A repeated source cannot create another event. Changes to an accepted time/place require the other party's renewed consent. Work/sleep, fictional opening hours, accepted commitments and conservative geographic travel buffers prevent automatic confirmation of conflicts. Existing commitments are not canceled to make room.
- **Places:** the owner-scoped registry now has eleven places, including four new fictional destinations: Lantern Reading Room, Valley Table, Borough Market and Rail Garden. Metadata includes fictional/unverified designation, illustrative coordinates, public access, hours, activities, areas, event categories and stable local artwork/icon styling. Two supporting fictional readers, Orla June and Elliot Reed, reuse persistent NPC conversations, memory, introduction and mutual contact consent. Co-location alone does not create an acquaintance. They cannot generate selfies without approved identity anchors.
- **Arrival and participation:** destination pages unlock persistent visit sessions only after the existing virtual travel arrival timestamp. Venue-specific actions record virtual orders, seating and activity. A small deterministic freeform interpreter supports actions such as “Order coffee for two”; unsupported or social outcomes are directed to conversation instead of being invented. A current accepted event shows its confirmed companion. Explicit in-venue speech inserts a user message in the existing primary conversation and calls the existing turn/delivery service. Departure starts the existing virtual journey home.
- **Grounded outcomes:** joining/discussing/talking records participation; passing time never fabricates it. Departure after recorded participation completes that event once and records a restrained shared memory and participant-only knowledge. Unattended events become missed; arrived events without an explicit outcome remain unresolved. No relationship points are awarded for travel, button taps or elapsed time.
- **UI:** Plans adds an Eastern calendar/day filter, invitations, missing details, responses, conflict explanations, event history, conversation and destination links. Chat shows its own pending-plan chips. Destination scenes offer activities, companion dialogue and the existing NPC encounter links. The private Simulation Debug screen adds visit, presence, calendar-transition, missing-detail and action diagnostics.

## Durability, isolation and costs

The existing leased backend `/api/public/jobs/world-tick` invokes the same calendar synchronization and progression service. Parsing/progression is structured and does not call an AI model, even with `AUTONOMOUS_AI_DAILY_LIMIT=0`. Browser polling merely refreshes views and catches visible messages promptly; it is not required for offline progression. Each pass reads at most 120 pending source messages. Downtime catches up to current state without inventing user actions or replaying paid dialogue.

Per-owner transactional advisory locks, source-message receipts, stable action IDs, row-level security and service-only mutation functions protect concurrency and tenancy. Client retries keep the same pending action ID while the component remains mounted; a different payload cannot reuse a completed ID. A page reload cannot safely infer whether an uncertain action completed: inspect the visible state/history before submitting it anew. Normal character generation retains its existing durable outbox protections. Calendar errors leave source messages available for retry and do not block ordinary chat or the legacy worker.

There are no new API credentials, paid providers or continuously running model loops. Calendar recognition and routine actions add no paid inference calls. The public registry/own-plan context adds tokens to an existing dialogue request. Explicit primary/NPC conversation still incurs normal text-model usage, and photos remain subject to existing opt-in/provider/budget rules. No billable requests were made for implementation tests.

## Migration and deployment review — no production changes performed

1. Review this branch and migration **0019** against the deployment's actual schema and applied migration history. It follows **0018**; do not assume merging source applies SQL. Test on a disposable/staging database first. Review/apply the migration using the deployment's migration facility in a transaction; do not reset tables or recreate the database.
2. The migration adds columns/tables/indexes, permits missing details only for conversation-origin plans, and wraps the existing shared-world command while preserving legacy behavior. It does not alter existing messages, memories, scores, photographs or travel records. The installation timestamp intentionally prevents replaying old chat into the calendar. Existing historical dates should be reviewed manually rather than automatically reinterpreted.
3. In a reviewed Lovable preview, verify old conversations/media and existing gatherings, then check the new Plans and destination screens. Without migration 0019, the UI reports the missing capability and existing messaging/legacy places continue working.
4. Retain existing server secrets and worker settings. Offline automation still requires a configured authenticated scheduler: see [living-world-activation.md](living-world-activation.md). The existing GitHub workflow uses `WORLD_TICK_URL`, shared server/Actions secret `LOVABLE_CRON_SECRET`, and repository variable `LIVING_WORLD_ENABLED=true`. Do not enable or change production scheduling merely to test this branch. Developer visibility retains `ENABLE_DEV_PHOTO_ACTIONS` and `DEVELOPER_PHOTO_USER_IDS` authorization.
5. Validate the preview and migration before any separately authorized publish. No production deployment, migration, automation activation, real GPS access or user data changes were performed here. Reverting application code does not require deleting the additive tables; avoid destructive rollback SQL.

## Safe acceptance checks without SSH

Use a reviewed preview/staging instance and a future time outside Claire's work/sleep hours (e.g. 7 PM Eastern, allowing travel). In Claire's normal conversation, establish a book-club invitation, accept it, and agree on **Lantern Reading Room** and a precise AM/PM time. Character decisions remain independent; there is no guaranteed scripted acceptance. Plans should show one invitation updating through missing details to accepted once both agree. The character can offer its fictional map point; no verified street address is available.

Open the destination from Plans, start normal virtual travel and wait for arrival. Before arrival there must be no venue actions. Arriving early offers waiting; a companion is only present during the accepted event and when available. Join the activity, talk using the companion control, optionally introduce yourself to an available fictional reader through the existing encounter flow, and leave. Verify the event outcome, shared memory and debug transition/action history. Do not request a paid photo to prove calendar correctness.

For automated controlled acceptance (no production credentials or paid providers):

```sh
npx vitest run src/test/calendar-logic.test.ts src/test/interactive-world.integration.test.ts src/test/world-offline.integration.test.ts
```

The disposable PostgreSQL tests exercise the actual migration and services: invitation → acceptance → details → travel → waiting → Claire/NPC presence → participation → departure → one scoped memory. They also exercise worker-only progression with AI budget zero, no invented attendance, both invitation directions, schedule/overlap conflicts, rescheduling consent, cancellation, repeated source/actions, changed-payload rejection, normal primary-turn routing and service-only ownership checks. External model results are mocked; this proves application plumbing, not live character willingness, visual quality, production cron health or phone gestures.

## Limits and next work

- **Real-address verification is incomplete.** Official library websites could not be fetched from this workspace (CONNECT 403). All new destinations and map points are deliberately fictional/illustrative; real named H.O.P.E. is an unverified-name fictional scene. No street addresses, real staff/client records, bookings or host confirmations are fabricated. Add genuinely verified public venues through reviewed registry data later.
- The recognizer supports a bounded set of common English invitations and clarification phrases. Ambiguous multi-plan replies and unrecognized venues stay unresolved. It is not a full natural-language planning agent. Duration currently uses a clearly labeled one-hour planning estimate; arbitrary conversational duration extraction is not implemented.
- New conversational plans involve the user and one primary character. Existing multi-character gatherings remain available through their established path. NPC conversational invitations, richer group-scene outcomes and generalized invitation organizers are future work.
- Character arrival is a structured reservation on the existing social-presence store, with schedule checks and planning travel buffers. This does not implement new detailed character route/travel trajectories. It does not expose unrelated characters' private whereabouts. Current schedule blocking prevents forcing a busy/asleep companion into a scene.
- Venue actions persist meaningful state but do not provide a full generated menu, payment system or interactive branching story for every possible freeform action. Place visuals are stable local icon/art styling, not new generated location photographs.
- Follow-through records explain missing venue/time or unavailable host tools and are supplied to that character's dialogue. Existing bounded intention/autonomous initiation mechanisms are retained; an unavailable host/address tool cannot complete a real-world confirmation. This does not guarantee an unsolicited address follow-up on a timer.
- Practice uses the existing mode behavior; no accelerated shared-world clock was added. Production scheduler execution, Android/PWA interactions and a live model conversation still need preview/manual verification.

An explicit conversation reset remains compatible: its conversation link detaches rather than cascading through shared-world history. Detached plans are hidden from the new calendar and cannot create new character arrivals or scheduling conflicts. This migration does not initiate any reset itself.

## Validation on the combined branch

- `npm test`: **458 passed across 47 files**, including the new real PostgreSQL calendar/venue acceptance and worker-only invitation progression tests. Paid providers were mocked.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed (client, server and PWA artifacts generated locally; no deployment).
- Focused ESLint on all new components/services/types and calendar/venue tests: passed.
- `git diff --check`: passed.

Live Lovable migration/cron verification, real-model invitation willingness and Android/PWA manual acceptance remain unverified. The complete real-address acceptance criterion remains open; the tested venue uses a fictional map meeting point.

The build reports a PWA precache glob warning (no matching assets in `dist`); no PWA configuration was changed in this branch. Verify installed-PWA caching separately in preview.
