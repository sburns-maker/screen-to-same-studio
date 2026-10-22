# Living-world expansion: review and bounded implementation

Baseline: `origin/main` **2ad6ff0**, which merged `codex/shared-world-proof` **14deb62**. Reviewed `ai-town-architecture.md`, `shared-world-cost-analysis.md`, migration 0011, shared-plan SQL, worker, social/NPC canon, identity-conditioned media, authentication and chat routes. Work is on **codex/living-world-expansion**. No production credentials, deployment, migration, paid generation or real push was used.

## Architecture assessment

The proof already supplies service-only transactional shared meetings, invitations, separate participant knowledge, one canonical exchange, personal memories, reservations, follow-up intentions and backend progression. The existing character engine provides five personalities, conversation state, memories, agency, delayed delivery, media and notifications. It should remain authoritative. Existing structured NPC circles already contain **26** supporting identities; deleting these to reach a proposed 10–15 population would damage continuity. This change adds only three discoverable adults and does not promote the existing background population into paid agents.

Missing before this change: a unified public navigation shell, geography for exploration, user virtual presence/travel, encounters with new people, consent-gated contact exchange, an ordinary Plans view and a public proposal path beyond the developer Ben/Claire proof. Existing places were broad registry keys, not a map. Existing chat treated unknown character keys as Tess, so inserting arbitrary NPCs into that engine would risk wrong personalities and identity references.

The implementation keeps one authenticated application and tenant database. Existing main-character chats and media stay in their current tables and engine. A bounded supporting-NPC dialogue adapter uses the **same direct Luna structured-output service**, auth, database and public places, but its own durable action/thread records. It deliberately does not pass unknown NPC keys through `characterFor` or give them a main character's portrait/state. This adapter is a starting tier, not feature parity with the primary relationship engine.

## Implemented interfaces

| Interface | Working behavior | Scope boundary |
| --- | --- | --- |
| Navigation | Home / Messages / Explore / People / Plans; thread screens hide the bar. Existing launch still opens Messages. | Existing discreet chat styling retained. |
| Home | Own recent established-contact conversations, unread count, known proposals, virtual travel/home state and exploration entry. | No synthetic social news or claims of a public feed. Existing photo galleries remain in chats. |
| Messages | Existing five conversations untouched; exchanged new contacts appear with their private thread previews and unread counts. | New NPC threads use the encounter adapter; no group texting, photos, push or delayed reply queue for them yet. |
| Explore | Zoomable geographic OSM tile map, Altoona/Hollidaysburg/Tyrone community selectors, four clickable fictional venues, search/category/community labels and opening hours. | City-center coordinates are approximate reference points. Venue placements are fictional, not verified addresses. No GPS API. No private primary-character location markers. Map has discrete zoom/center controls rather than free dragging. |
| Places | Persistent place registry, description, Eastern opening hours, virtual travel time, arrival state and schedule-eligible encounter links. | Text-first scenes. No invented event attendance, 3D interiors or automatic character narration. |
| People | Existing profile links plus people actually spoken to; distinguishes encountered from exchanged contacts. | Friendship/romance is not inferred from exchange. No automatic conversion of new contacts into the primary score engine. |
| Plans | User-arranged one-hour gatherings at coffee/park, organizer agency, explicit relayed invitation, live RSVP/state list. All five established characters eligible. | Legacy plans only in memory prose are not imported. This view does not reveal private plans, assume user attendance or offer a complete calendar. Normal rescheduling/cancellation UI is future work; existing developer controls remain. |
| Virtual home | Persistent private symbolic home and return travel. | No real address, hosting, possessions or household simulation yet. |
| Director | Allowlisted exploration migration status, persisted profile keys, destination, recent action status and limit; links to existing character initiation/photo diagnostics. | Observations are never injected as character knowledge. Existing jobs/timeline/knowledge inspection retained. |

OSM tiles use the public standard HTTPS endpoint with visible attribution and community/zoom-driven requests. No map key, paid subscription or geolocation permission is needed. OSM receives ordinary browser requests/IP/referrer, not a GPS position. The region list still works if tiles fail. Respect [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) before increasing traffic; there is no offline tile download/prefetch. A configurable/self-hosted tile service can be reviewed later for scale/privacy. No third-party map library or new runtime dependency was added.

## Persistence and migration plan

Review additive **0012_town_exploration.sql** after 0011. It adds optional `world_places.metadata`, plus:

- `town_people`: immutable-on-seed per-user profiles for exactly Rowan Ellis, Leah Moss and Nolan Reed. Generated claims never rewrite these profiles.
- `town_presence`: one destination and arrival timestamp per user. Home is symbolic; no physical device location is recorded.
- `town_connections`: first encounter, present contact willingness, mutual exchange and read position.
- `town_actions`: stable request ID, input/mode, reserved/completed/failed state and daily spending receipts.
- `town_messages`: paired user/NPC bubbles linked to an action and connection, with uniqueness per action/role.
- `town_known_plans`: plans the user explicitly arranged; objective private plans do not become dashboard content automatically.

Owner-scoped SELECT/RLS, service-only mutation RPCs, per-user transaction locks and private thread predicates isolate users. A start reserves at most one live NPC call per user; a finish commits both bubbles and contact willingness atomically. Concurrent/replayed IDs never invoke the model again. An uncertain/failed request becomes terminal and is not automatically regenerated. A stale reservation can be superseded after two minutes; its late completion cannot write messages. Failed attempts still count against spending limits. No raw provider errors/headers/prompts/keys enter diagnostics.

The migration journal includes 0012. Disposable PostgreSQL tests install all predecessors; the old 0008/0009 duplication is retained and not rerun against production. 0011's obsolete per-user-only conversation constraint repair remains unchanged. No rows, memories, relationship scores, canonical portraits, generated images or storage objects are removed. Existing place labels/metadata are preserved; blank metadata receives geography. Public display initially uses the reviewed geography catalog. Bespoke preexisting labels need explicit reconciliation before treating those labels as an exact map identity.

## Discoverable people and agency

All are explicitly fictional adults, with stable IDs and canonical profiles stored per user:

- **Rowan Ellis**, 33: bicycle mechanic, rail-history photographs, crosswords. Switchyard Coffee Mon–Sat, 9–3 Eastern.
- **Leah Moss**, 36: freelance illustrator, plants, used books. Paper & Fern Tue–Sun, 11–5 Eastern.
- **Nolan Reed**, 38: volunteer repair host, cooking, radios. Little Juniata Workshop Wed/Fri/Sat/Sun, 11–4 Eastern.

These are encounter windows, not claims that someone spends their entire life there. Outside them the person is unavailable to this initial adapter. A location visit does not itself send a user message or establish friendship. After some conversation, the model may be willing to exchange contact access; the user must explicitly accept. Declining remains valid. No relationship points are awarded for elapsed time, travel, contact exchange or a seeded availability decision.

The three contacts keep a durable conversation history; inference reads only their own last 30 bubbles and stored profile. This is **not yet full long-term memory extraction, a complete NPC reflection system or independent NPC social planning**. The existing primary-character intentions/reflections continue unchanged. New NPCs have initials, not fabricated approved portraits: photo generation is unavailable until canonical portraits are reviewed. Existing Sam, Becca, Mrs. Abernathy and the trivia teammate Dev are not renamed/replaced by these new profiles.

## Shared-world integration

The public proposal service uses the existing schedule/travel rules and a stable organizer decision keyed by user/organizer/hour/place, so refreshing an unchanged proposal does not reroll the organizer. Four successfully arranged proposals per UTC day is the ceiling. Both contacts must have owned Real-Time conversations. A proposal is not an order: organizer willingness can decline, the invitee independently responds on the next backend tick, overlapping reservations still fail and venue opening hours are checked. Creation, invitation and user-awareness receipt share a transaction. Private conversation text is never copied.

Existing `runSharedWorldTick` advances accepted plans, writes separate participant memories and acquaintances, clears presence on completion, and queues optional normal follow-ups. The offline tests exercise two main-character messages and deduplicated mock push delivery without a user message. Additional tests demonstrate Tess/Maya rather than only Ben/Claire. A cordial meeting is not friendship/romance. Natural language in ordinary chat still does **not** automatically create these plan actions. Supporting NPCs cannot yet join these primary-character plan RPCs.

## Automation and silence findings

The durable backend remains POST **`/api/public/jobs/world-tick`**, authenticated with `LOVABLE_CRON_SECRET`. `.github/workflows/living-world.yml` runs every five minutes **only if** repository variable `LIVING_WORLD_ENABLED=true`; it needs `WORLD_TICK_URL` and the matching GitHub secret. Backend leases/cursors, per-conversation 30-minute checks, bounded catch-up and quota protections remain. Browser polling observes; it is not required for progression. New exploration/RSVP/travel rules add no continuous AI loop.

Local tests prove backend mechanics; this workspace cannot confirm the published URL, Cloud secrets, Actions activation, recent production job timestamps or provider access. GitHub schedules may lag. Inspect those independently after an approved deployment. World-tick work is still bounded to 20 conversation rows per run and four AI calls globally; it is not an SLA for hundreds of active users.

Silence has several distinct causes:

- Existing delayed primary replies remain hidden until `visible_at`; push sweep handles eligible delivered messages.
- An unreplied primary user message older than 90 seconds has a bounded orphan-reply recovery path in Real-Time. It is different from unsolicited initiation.
- Conversation closure/no plausible reason, personality probability or minimum gap can correctly select no message.
- Mute, quiet hours, busy/asleep schedule, provider pause, global AI budget and per-user daily limit can suppress a selected opportunity.
- Practice primary conversations never receive real-clock autonomous replies/photos; existing copied-state preview is not a persistent accelerated town.
- Failed/uncertain image attempts are terminal; prepared delivery can resume without a second generation.

**Fixed diagnostic:** `last_initiation.initiated` previously reflected rule selection before delivery. It now starts false and is true only after messages are actually queued. Selection and quiet/mute/availability/budget/provider blockers are distinct. A PostgreSQL regression checks quiet-hours explanation and unchanged notification claims. This is observability, not an increase in initiation frequency. New NPC dialogue is Real-Time/on-demand only; it has no autonomous worker/push path in this slice.

## Photography and identity

No media provider/model/rules were changed. Main-character requested/contextual/autonomous/developer photos still route through the existing canonical-image service, exact original portrait bytes, limited reference edits, text/scene screening, private storage and atomic delivery. Group photos remain blocked pending a multi-reference implementation. The existing offline clinic-photo test proves normal opportunity → generation boundary → attachment → delivery with fake paid providers, and preserves memories. It does not prove a real generated face is recognizable.

The existing developer photo preview/ask controls remain the controlled live test. Ordinary schedules, consent, eligibility, image limits and errors still apply; the character may decline. No permanent fidget-button/puppy story, staged success image or database-injected incoming photo was added. New NPC portraits/photos remain unavailable. Real Tess/Maya/Claire/Jordan visual acceptance is still required before claiming identity fidelity.

## Costs and model settings

Models remain **gpt-6-luna** (character/NPC text), **gpt-4.1-mini** (existing vision), **gpt-image-1-mini** (existing direct images). Supplied rates/deprecation reports and replacement candidates are documented in `shared-world-cost-analysis.md`; official current replacement capability/pricing was not independently reachable here. No provider/model was silently switched.

Using the user's supplied Luna rates and the prior illustrative 4,500-input/350-output example, one turn is ~$0.000625. Actual history length varies. New NPC interactions use one structured call each, no separate memory call. `TOWN_DAILY_AI_LIMIT` can lower the durable per-user ceiling from 40 to zero; values are clamped 0–40. Forty/day would be **~$0.75/month** under that example, or **~$2.04/month** at the prior dense-context 12k-input/1k-output example. Failed/reserved attempts count. Limits cap attempts, not exact dollar spending; retain OpenAI project billing controls and the shared process circuit breaker.

Existing primary autonomous ceiling 12/user/day: ~$0.225/month example or ~$0.612 dense. Existing medium portrait image+visual screen+25% lettering estimate: ~$0.01724/image, or ~$1.035 for 60/month **plus reference inputs**. Manual primary chats, debriefs, user-image descriptions, hosting/storage and retries started explicitly are additional. At 40 NPC turns/day + 12 primary autonomous turns/day + 60 medium images/month, illustrative total is **~$2.01/month plus reference inputs/hosting/manual primary use** (dense text ~$3.69). These are assumptions, not measured invoices or guaranteed model availability.

The prior event-driven projections still apply for 10/25/50/100 supporting NPCs: moderate optional summary workloads ~$0.206/$0.234/$0.281/$0.375 per month uncapped, or max ~$0.225 under the current autonomous quota. **Those optional supporting-NPC summary loops are not enabled.** Routine schedules, movement eligibility, invitations, meetings and profile persistence use zero paid inference at all four population sizes. Only three new contacts are discoverable. Raising population does not require giving every NPC a periodic model call.

## Safe testing without SSH

1. Review this branch and 0012. Use an isolated preview database with migrations through 0011, back up according to the host's normal procedure, then have Lovable apply **only 0012** transactionally. Do not reset tables, rerun old migrations or apply to production automatically.
2. Existing server bindings remain: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, service-role/secret binding; normal VAPID and `LOVABLE_CRON_SECRET` for primary background delivery. Optional new `TOWN_DAILY_AI_LIMIT=10` gives a modest manual-testing cap; `0` disables paid encounter turns. No map secret or new provider is required.
3. Open Messages: existing five threads, memories/photos and profile images must remain unchanged. The bottom bar reaches Home, Explore, People and Plans even if migration is missing; missing setup shows a clear error and Messages link.
4. Explore Altoona. Open the coffee venue during Rowan's Eastern window, choose **Visit virtually**, observe persisted arrival after reload, and allow the estimated travel time. GPS permission should never appear. Enter the encounter, talk naturally, and if willingness is offered explicitly exchange contacts. Confirm the contact appears in Messages and People; decline/no offer must not create access. A visit to Tyrone/Hollidaysburg requires travel too. Each actual turn can incur the normal small text charge.
5. For a fast, free mechanical proof, run `npx vitest run src/test/town.integration.test.ts src/test/shared-world.integration.test.ts src/test/world-offline.integration.test.ts` in Codex/local CI. These use disposable PostgreSQL, controlled arrival timestamps and mocked paid providers/push; production credentials are unnecessary. They test real persistence and transactions, not a fake production success button.
6. Plans: with Real-Time primary threads, suggest a one-hour public gathering at least 30 minutes ahead and within 14 days, during venue hours and outside work/sleep. Both parties may decline. Inspect RSVP changes after a legitimate backend tick; attendance/follow-up only after actual elapsed event time. Existing old dates in chat must be checked manually; do not override them to force a test.
7. Developer access still requires `ENABLE_DEV_PHOTO_ACTIONS=true` and your ID in `DEVELOPER_PHOTO_USER_IDS`. Settings → living-world timeline shows the exploration director, existing job health, shared proof and character diagnostics. Photo preview is free; **Ask character to share** and **Run world tick now** can incur normal charges. Do not rerun uncertain image failures blindly.
8. After review/approved deployment only, configure the existing opt-in scheduler variables/secrets, dispatch the workflow, close the app, and check later job timestamps/real messages. Confirm VAPID subscription/push separately. No code test here certifies live scheduler or push delivery.

## Validation and limitations

Full automated suite: **346 tests / 34 files** at this implementation stage; TypeScript and production build pass. New tests cover travel/arrival, absence/closed scenes, profile/place preservation, independent NPC histories, consent/decline, remote-contact gating, safe failures, quotas, duplicate IDs, transaction rollback, known-plan privacy, universal primary meetings and existing follow-ups. Existing photo identity/text, budgets, memory/state, offline operation, Practice isolation and push tests continue. All external paid providers are mocked. Browser visual/real authenticated UI acceptance and real provider image quality have not been performed from this workspace. Existing build warnings about deprecated TanStack validator aliases and PWA precache remain.

Not implemented: universal autonomous encounter *selection*, independent discovery-NPC messaging/social plans, rich NPC relationship progression/reflections/long-term extraction, group chat, a persistent multi-day Practice town, user-attendance/event-scene play, private-home visits/hosting, possession management, public social feed, calls/voice, group-identity generation, arbitrary new-character portraits or automatic chat-to-calendar extraction. Existing character routines are still broad schedules plus bounded storylines, not street-by-street movement for every resident. These are explicitly future work rather than inert placeholder tabs.

## Prioritized next steps

1. Preview migration and authenticated mobile/browser acceptance; validate actual scheduler and safe one-shot identity-conditioned media against canonical portraits.
2. Share the supporting adapter's explicit action receipts with existing intentions/notification outbox; add long-term NPC memory and earned relationship state before autonomous NPC messages.
3. Evidence-backed chat-to-plan actions, invitation/reschedule UI, reported user attendance and actual group-event scenes. Reconcile legacy commitments before making stronger availability guarantees.
4. Event-driven primary/NPC encounter selection at authorized public places, explicit information-transmission receipts and meaningful social outcomes; keep bounded loops and shared budgets.
5. A copied-state persistent Practice sandbox using the same commands and isolated IDs, with seeded multi-day scenarios rather than changing production clocks.
6. Approved canonical portraits for new people, multi-reference group identity validation and explicit visual acceptance before enabling their media.
7. Public feed only from intentionally public world events, with per-character participation/visibility rules. Voice/calls require a separately reviewed OpenAI audio/Realtime design and current rates; no recurring voice service has been added.
