# Living Blair County — Phase 4

## Audit before implementation

Baseline: `origin/main` **aef3083**, including merged Phase 3 PR #22, same-day outfit work PR #23, Lovable changes and readable simulation diagnostics PR #24. Dedicated branch: `codex/living-blair-county-phase4`.

| Feature | State at audit | Reuse / gap |
| --- | --- | --- |
| Primary messaging, history, memory, relationships | Implemented and usable | Preserve existing turn/outbox/push services and character-only knowledge |
| Image generation, canonical anchors, same-day outfits, gallery/viewer | Implemented; live quality remains provider-dependent | Preserve provider, model, budgets, screening and retry rules |
| Virtual map, travel, arrival | Implemented and usable | Existing `town_presence`, travel calculation and CountyMap; no GPS |
| Eleven places and eight supporting NPCs | Implemented | Existing stable registry and consent-based NPC discovery; all map placements illustrative |
| Destination actions and visit sessions | Partially implemented | Orders, seating, dialogue, departure persist; no actual trivia rounds or book-club discussion progression |
| Calendar invitations and ordinary chat acceptance | Implemented with bounded recognition | Canonical `social_plans`, receipts, both-party consent, missing details, conflicts, lifecycle and worker |
| Shared memories | Implemented for recorded participation/departure | Existing memory insertion and participant-only knowledge; enrich only from explicit activity choices |
| Explore | Partially implemented | Map and search wired; missing activity/type filters, favorites, travel ordering, event overlays |
| Home / People | Implemented but shallow | Existing contacts/portraits and directory; missing upcoming-plan integration and useful discovery tabs |
| Independent routines / social events | Implemented backend, deployment-dependent | Reuse leased tick, social circles, Thursday trivia and structured knowledge; no browser required when scheduler configured |
| Primary character presence | Partially implemented | Shared-event presence respects reservations/current availability; no generalized detailed route simulation |
| Real public venue addresses | Missing verification | Never label approximate fictional pins as verified real addresses |
| In-person group dialogue | Partial | Existing shared gatherings and NPC turns; no unrestricted multi-agent group-chat engine |
| Phone UI | Existing navigation, sparse cards | Improve shared layouts and contextual controls; retain discreet Messages |
| Diagnostics | Implemented and recently cleaned up | Add human-readable activity state inside existing collapsible developer sections |
| Fictional social network | Missing by design | Design document only in this phase |

## Implementation approach

Reuse the authoritative registry, `social_plans`, `town_presence`, `venue_sessions`, `venue_actions`, existing NPC consent flow and primary turn service. Add bounded deterministic activity progression to existing visit state, not a second world or calendar. Favor stable local venue artwork and structured actions over paid generation. UI filters expose only public places and owner-known accepted events, never private character tracking.

Production database contents, migration installation and scheduler execution cannot be inferred from source. No production migrations, deployment or merge are authorized by this task.

## Implemented on the existing foundations

### Destinations and activities

A stable original vector illustration gives place details and discovery cards a recognizable visual without claiming to be a real photograph or spending image credits. Existing virtual travel and arrival continue to determine when a scene becomes interactive. A visit now has clearer activity controls and a history of recent visits at that place, using the existing persisted sessions rather than browser state.

Book-club discussions have three bounded contributions (reading angle, contribution, closing thought). Trivia has team entry, three scored rounds, submitted-answer history and results. Choices are recorded as player actions, never invented dialogue from another attendee. The system does not assert which book the group read or fabricate other people's opinions. Normal companion **Talk** remains the same primary messaging/character service, with the current shared activity added to that character's scoped context. NPC encounters and contact consent retain their existing path.

`venue_progress` takes the same town/calendar transactional locks as existing venue actions, verifies actual arrival, opening hours, template compatibility and confirmed companion presence, and writes into `venue_sessions.state` plus `venue_actions`. Expected-step checks serialize competing answers. Stable action IDs replay the recorded result; a changed payload cannot reuse an ID. Restarting a completed activity resumes the recorded result instead of rerolling a score. The UI shows a shared activity only when the user's accepted plan and the companion's presence match; otherwise it explicitly describes a solo activity.

A finished shared activity records only the player's actual choices in a deduplicated memory and participant-only knowledge. It does not grant relationship points or turn a friendship into romance. The plan stays in progress until recorded departure; the existing normal departure workflow completes it. Elapsed time, passive co-location and developer inspection never fabricate user attendance.

Existing dinner, coffee, walk, casual meetup and community activities continue to use their existing venue orders/seating/walking/joining/dialogue actions. This phase adds distinct progression mechanics for book club and trivia; it does not pretend every venue has a full restaurant or adventure game.

### Discovery, navigation and community UI

- Explore retains CountyMap and travel, and adds activity filters, community filters, open/saved/accepted-event views, empty states and virtual-origin travel ordering. Unknown/in-transit origin does not become a fabricated GPS distance. Only the user's own accepted events appear as event hints.
- Saved places persist in the existing owner-scoped `user_profile` preference store. A service-only transaction serializes add/remove operations; no location or character identity changes when saving a place.
- Home adds real pending invitations and accepted events, with fictional public activity suggestions rather than invented private life updates. It continues to show Messages and actual virtual presence.
- People adds search and contact/acquaintance filters, preserves existing profile/media links, and counts completed shared plans in the owner's history. Unintroduced NPCs do not appear as already-known contacts.
- Plans keeps its calendar and canonical events, adding Upcoming / Needs attention / History filters and readable conflict/transition explanations.
- Shared layout adds an offline status banner and touch-friendly controls. Offline views never claim to commit new world actions.
- Existing readable Simulation Debug remains behind its existing developer authorization. Its interactive-world section adds structured-activity availability, progress and recent-visit counts. Raw technical records remain inside expandable developer panels.

### Registry additions

The existing eleven IDs remain. New fictional destinations are **Foundry Table** (Altoona trivia/hangout), **Willow Bend Green** (Duncansville walk/bench) and **Orchard Studio** (Duncansville arts/community). All coordinates are illustrative placements; hours and activities are fictional. Robin Hale and Dana Soler are stable fictional adults using the existing NPC routines, memories and mutual contact-exchange consent. Their selfie generation remains disabled without approved identity anchors. No automatic friendship, romance or inbound messaging is granted.

Official venue sites were again blocked from this workspace (CONNECT 403). No real public addresses were guessed or inserted. H.O.P.E. retains its existing explicitly unverified-name fictional scene; the app does not claim to know its real opening hours, visitors, staff or records. Real address/coordinate verification remains a review task.

### Schedule correction

A temporary availability modifier could soften Tess's availability during an underlying obligation such as Thursday trivia. Calendar scheduling/progression now also checks the underlying Tess schedule so this cannot silently justify simultaneous commitments. The existing messaging/photo availability and personality rules are unchanged. Independent Thursday trivia, recurring teammates and social knowledge continue through the existing deterministic social worker; Foundry Table is **not** silently assigned as Tess's canonical usual bar.

## Social network proposal

[AI Town Social proposal](ai-town-social-proposal.md) describes an owner-scoped event-backed post/audience/comment/read-receipt model, explicit knowledge propagation, moderation, retention and bounded autonomous jobs. It is a design document only. No social network, external account integration or paid autonomous posting was enabled.

## Migration, compatibility and operating costs

Review **0021_venue_experiences.sql** after the existing 0019 and 0020 migrations. It adds service-only activity/status/favorite functions; it adds no tables, rewrites no histories and does not change existing media infrastructure. It stores new interactions in the existing visit/action records and favorites in existing preferences. The new gameplay and saved-place actions are gated by the 0021 capability check. Existing place exploration and ordinary messaging remain available without it.

The existing backend world-tick endpoint, lease and scheduler configuration remain the source of offline progression. This phase does not create or activate a scheduler. Verify the live heartbeat separately; see [living-world activation](living-world-activation.md). Existing server credentials and model settings are retained. No new credentials, paid services or model changes are required.

Opening a page, saving a favorite, taking a game turn, checking a score or computing a route uses **zero new paid AI calls**. Dialogue through Talk/normal messaging and optional photos retain their existing costs and safeguards. Current shared-action context adds a small amount of input to an existing dialogue call. No model output, image generation or production credential was used for ordinary automated tests.

## Safe testing without SSH

1. Review the feature branch. In a separate staging/Lovable preview, review the applied migration history and apply 0021 through the platform's migration facility only after 0019/0020. Do not reset the database. Merging source does not apply SQL or prove the published backend uses it.
2. Open Explore on a phone-sized view. Search by name/community, filter Books or Trivia, save a place, refresh, then use Saved places. Confirm that your virtual location—not GPS—controls route ordering. Check a no-results search and offline/error states.
3. For Claire's acceptance scenario, choose a future 7 PM Eastern book club outside existing conflicts. The invitation/acceptance must occur in normal Messages, use Lantern Reading Room, and update one Plans record. Character willingness remains independent; a live model is not forced to invite or accept.
4. Travel normally. Before arrival, no venue actions should succeed. After arrival, check in with the reading activity. If Claire's accepted event is active and she is available, the activity says **With Claire**; otherwise it is explicitly solo. Make contributions, use Talk, meet an available fictional NPC through the existing encounter flow, and leave when ready. Check Plans → History, later dialogue and the private diagnostics.
5. Visit Foundry Table during its fictional open hours. Join the team, submit one answer per round and inspect the results. Retry an uncertain action through the same visible control rather than submitting changed answers or restarting. Return later and verify that previous visit state remains available.
6. Verify old chats, images/videos, canonical profile controls and existing plans. Do not request a paid photo just to prove game persistence. Test Android/iOS touch layout, scrolling, PWA reopen and real network failure manually before recommending publication.

Automated controlled acceptance (disposable PostgreSQL; only external providers mocked):

```sh
npx vitest run src/test/world-offline.integration.test.ts src/test/venue-experiences.integration.test.ts src/test/phase4-discovery.test.ts src/test/phase4-ui.test.tsx
```

The Claire test calls the actual primary `runTurn`, durable delivery, calendar synchronization, virtual travel, venue progression, departure and memory retrieval. The later primary-turn request must receive the recorded contribution as memory. UI tests supplement this service proof; they are not its substitute. Provider dialogue fixtures prove routing and persistence, not a guarantee about live-model choices or style.

## Remaining limits / prioritized follow-up

1. Review preview UX on actual Android/iOS and installed PWA. DOM tests exercise accessible controls/filters, but do not establish pixel-perfect phone rendering or device gesture behavior. The existing build's PWA precache warning needs separate configuration investigation; this branch does not alter its cache setup.
2. Real public venue verification is still blocked. Add reviewed official-source data and provenance before claiming verified addresses or real programs. Existing approximate pins remain explicitly fictional.
3. Trivia is an intentionally small three-question prototype, and book club uses a small reusable choice set. Add versioned activity templates/content rotation before expanding gameplay depth. No real prizes, payments or bookings exist.
4. Generalized in-person group dialogue, joint departure/travel, advanced NPC-to-NPC scene decisions and automatic NPC-thread invitations are not implemented here. Existing shared gatherings/social circles and consent-based NPC conversations remain operational. Primary invitation recognition is bounded English parsing, with ambiguous inputs left unresolved.
5. Character route trajectories are still the existing schedule/reservation model, not a new continuous town movement simulator. Private routines do not become publicly visible. Practice retains its existing behavior; no accelerated shared-world clock was added.
6. No new default photo/video generation, social-network posts or unlimited autonomous conversations are enabled. Current generated-photo identities/outfits/budgets and user-uploaded videos are preserved. AI-generated video remains optional future work.
7. No production scheduler execution or production schema state can be verified from this workspace. Migration and publish require separate review. **No merge, deployment or production migration was performed.**

### Departure recovery

Traveling to another venue or using Home's return-home control also closes a participated encounter; it no longer requires finding the venue's specific Leave button. The existing travel command commits first. A service-only reconciler uses the recorded travel/presence change to close the prior visit, complete only explicitly participated plans, and write deduplicated outcomes. A failed reconciliation never reports that already-started travel failed; the same bounded recovery is invoked by calendar/world synchronization. It never fabricates arrival at the next destination.

## Validation

- Full suite: **477 tests passed across 50 files**.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: passed, including client/server output. The PWA precache glob warning remains; no deployment was run.
- Focused ESLint across new and modified components, world/registry services and new tests: passed.
- `git diff --check`: passed.
- Tests use disposable PostgreSQL, the actual primary turn/outbox/calendar/travel/venue/memory services, and mocked external text/image responses. No production credentials or paid generations were required.

The test-only PostgREST adapter now serializes database timestamps to JSON strings, matching the actual API, rather than leaking PGlite Date objects into production service code during tests. Existing media/personality provider code was not changed to accommodate the test harness.
