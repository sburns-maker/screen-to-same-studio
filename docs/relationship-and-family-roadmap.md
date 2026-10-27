# Living World: Relationships, households, marriage & family
_Status: phased design and initial implementation branch; not a production commitment._

## Principles
- Characters are independent people in a fictional persistent world. No automatic romance, marriage, moving in or pregnancy based on scores alone.
- Emotional state, expressed desire, mutual decisions and recorded real-world changes in the simulation are distinct.
- All intimate participants must be established adults; character boundaries and consent remain authoritative.
- The existing housing subsystem (migration 0045, housing actions, members, proposals, calendar and household history) is the single source for residence, cohabitation and access; never build a parallel home system.
- Existing dates, chats, memories, proposal responses and event IDs must survive all migrations; idempotency and rollback are mandatory.
- Keep the everyday phone interface simple; relationship and household details belong under contextual profile/home screens, not a romance-themed main navigation.

## Phase 1 — Romance quality and household clarity (initial branch)
1. Update shared conversation prompts to distinguish pressure or unwanted advances from welcomed, non-graphic adult romance. Character choice and declining remain valid.
2. Preserve earlier affectionate milestones in interactive-scene context; measure repeated gesture/dialogue patterns across multiple turns rather than mandate escalation.
3. Use current housing snapshot to provide a responsive, attractive household summary; no new housing mutations in the overview.
4. Regression suite: consensual affection is not penalized for intensity alone; rejection or reluctance is honored; multiple established characters exhibit distinct choices; outing finish/automatic safety controls remain unchanged.
5. UI accessibility and responsive review at small and large viewports. Avoid exposing undisclosed private home details.

## Phase 2 — Durable relationship events
- Introduce a mutually confirmed commitment-event journal keyed by (user, people, event ID), with explicit initiator, respondent, timestamp, source evidence and reversible status.
- Distinguish exclusive dating, committed partnership, engagement, marriage, separation and divorce from scalar relationship stages.
- Derive the current commitment from actual events, not attraction thresholds or model prose.
- Surface relationship status and milestone timeline in contact details; keep sensitive values private to each player's world.
- Test stale proposals, duplicate generations, nonconsent, and cross-user isolation.

## Phase 3 — Shared life via existing housing
- Bind mutually accepted partner/cohabitation events to the existing housing proposal and household member records; housing consent stays separate from relationship consent.
- Home routines, pets, temporary stays, personal work schedules and plans reflect real household membership.
- Moving out and relationship transitions never trigger eviction or delete historical plans.
- Design a Homes detail view with residents, pets, upcoming plans, invitations and history; no fabricated addresses or permissions.

## Phase 4 — Engagement and marriage
- Characters have independent preferences and compatible or conflicting life goals.
- Proposals, responses, ceremony planning and legal-in-world statuses require explicit fictional events, not automatic time/score thresholds.
- Display a milestone timeline, ceremony plan and household effects without replacing the calendar.
- Tests for declines, changing minds, canceled weddings, and consistency across phone calls, chats and outings.

## Phase 5 — Family building
- Adult partners can discuss children and choose consensual family paths including pregnancy, adoption, fostering or no children.
- Record plans and outcomes separately; never assume pregnancy or parenthood from affection or marriage.
- Family graph uses distinct entities for parents, dependents, caregiving and home membership.
- Children appear only in age-appropriate family/social activities, never adult romance or erotic simulation.
- Stable age/birthday calendar and time progression prevents accidental aging or duplicate births.

## Phase 6 — Long-term world continuity
- Household schedules, children's development, life milestones, friendships, conflicts and reconciliations update through scheduled deterministic world events.
- Always-available canonical facts: relationship commitments, household members, parentage, dependents, addresses/permissions, prior milestone dates.
- Ordinary episodic memories remain in topic-based recall. The story can evolve without editing past truth.

## Release gates for each phase
1. Inspect current main and Codex work before making new changes.
2. Implement only on a dedicated branch; no direct production data edits.
3. Run unit, schema/migration, integration and UI tests; verify Android branch remains unchanged.
4. Verify staging with representative date/conversation, housing consent and memory persistence scenarios.
5. Merge/release only after reviewed checks and explicit owner choice.

## Implementation batch: player-side commitment decisions (October 26)
- Migration 0046 now includes a service-role-only serialized relationship_player_command RPC.
- Propose, accept, decline and cancel are owner-scoped; a player response never fabricates a character's acceptance.
- Authenticated endpoint validates eligible established adult fictional contacts.
- Pending proposals render in the contact home/relationship timeline with accessible explicit decision buttons.
- The UI does NOT yet expose player proposal creation because no conversational character-response pipeline is wired. A unilateral proposal would otherwise remain pending indefinitely.
- Future batch: extract character-initiated proposals and responses from committed, visible dialogue; queue them idempotently; cross-check quoted utterances; feed canonical commitment status into text, phone and outing contexts.
- Migration remains unapplied and feature is not verified in a running Lovable environment. Existing housing approvals remain completely separate.

## Tess-first autonomous commitment pilot (current branch; untested)
- The shared strict structured reply now includes a nullable commitment_action. All non-Tess characters return an inactive action.
- Tess may explicitly propose exclusivity or a committed partnership in her own visible text. The action must quote the exact current message; the model must never invent the player's acceptance.
- Primary Tess message delivery stores proposal metadata on the saved first bubble only when the quote matches it; hidden future messages cannot be acted on.
- A service-role-only relationship_sync_tess function ingests saved, already-visible Tess proposals on commitment history read; it is not a background worker and does not process phone-only or outing-only dialogue.
- A proposed decision remains pending until the player explicitly agrees or declines. No cohabitation or marriage is inferred.
- Existing player decision buttons render pending proposals, backed by relationship_player_command and authenticated server function.
- Remaining before release: schema/build tests, database migration replay, end-to-end Lovable staging with a real provider response; integrate independent character responses to player-initiated proposals, canonical commitment facts into every generation channel, call/outing proposals, and safe resolution of repeated stale unprocessed source messages.

## Tess-first two-way proposals: implementation status
- The player can explicitly initiate exclusive/partnership discussion from Tess's contact relationship view. The character response remains independent.
- Tess generation gets canonical accepted/pending commitment context; the reply schema supports a quoted accept/decline of an existing player proposal ID. Committed visible text is the source for synchronization.
- Visible-message reconciliation applies Tess's response to the exact pending, player-initiated proposal. Other characters remain out of this pilot.
- These are code changes only: migration 0046 is not applied, and neither static tests nor a live integration run has been completed.
- Cross-character policy: commitment event records are character-scoped. Riley's high attraction or dates do not change Tess's score, and vice versa. An exclusive commitment may have real narrative meaning, but no automatic breakup, stat reset, or background penalty is implemented. A future world-level relationship agreement policy must explicitly define exclusivity and potential conflicts, with clear player decisions.
- Release blockers: idempotent source acknowledgments for all channels, stage/state consistency, tests for visible delivery and repeated sync, production-safe migration replay, and full Lovable build/staging validation.

## Unified interaction continuity batch
- Text-generation input now labels recorded voice turns explicitly and separately exposes up to eight recent spoken character/user turns from this conversation, encouraging natural callbacks in subsequent texts.
- Outing generation now receives Tess's accepted/pending canonical commitment status; it never gains other characters' private relationships.
- Live voice and text already share the canonical message table; this batch leverages it and does not invent a parallel transcript.
- Do not infer call content from call status or fabricate an unheard conversation.
- Required release proof: voice call -> topic disclosure -> subsequent text callback; text -> voice callback; date -> follow-up text; canceled/failed call must not supply a topic; independent Riley/Tess isolation; replayed provider call cannot duplicate milestones.
- Full marriage/family schema, world scheduler, UI integration, PostgreSQL migration replay, static build, and browser tests remain pending. Never mark the branch as merge-ready until these pass.

## Interactive housing batch
- Added an interactive Home Moments selector to the existing housing panel with contextual coffee, cooking, movie, Mabel and photo-request ideas. It reuses existing known homes and never creates another residence or alters household consent.
- Requests are explicit, copyable conversation starters; they do not send messages or silently cause photos/events. The character's existing photo engine retains willingness, identity, budget and eligibility rules.
- No external stock imagery or fabricated household photographs are presented as game canon.
- UI and consent regression tests are written; not executed yet.
- Future: existing generated photo records + server-side authenticated home-scoped photo gallery; photo location validation and lasting event-linked memory; photo-creation action with permission and cost checks. No live generation/storage is claimed by this batch.

## Direct home-to-chat composer batch
- Home Moments now opens Tess's existing chat with an editable draft for the selected activity, using the authenticated conversation lookup; this doesn't create a second messaging system.
- The draft is stored only in same-tab session state under the specific conversation ID, consumed once on opening, and never sent automatically. Existing composer text is not overwritten.
- The original chat send/offline queue/reply generation remain responsible for message delivery. Calendar and housing decisions still require mutual agreement.
- Your home and Tess's permitted home both support this flow; Tess-only commitment privacy remains in place.
- Validate in Lovable: new user with no seeded Tess thread, your home, Tess home, back navigation, existing unsent message, offline mode and request-a-photo voluntary refusal.

## Three-item stabilization pass
1. Verified home gallery now rejects absolute storage paths, traversal, and query strings before URL signing.
2. Sent home-activity draft text stores a scoped home_moment_prompt metadata hint only when unchanged; neither sending nor opening a draft creates an outing or awards relationship progress. Edited messages are treated as regular chat.
3. Regression tests cover unsafe photo storage references. Remaining: run all tests and a Lovable build, verify draft navigation/offline paths, and review current main's two commits before any later merge.

## Fictional workplace visits
- Every existing contact (Tess, Maya, Claire, Jordan, Ben, Riley) has a unique fictional employer name, map key and approximate illustrative coordinate. Pins are fictional and not real employer locations.
- Added workplaces to existing TOWN_PLACES and public-safe venue interactions. Restricted school/hospital access cannot be inferred from an interactive pin.
- Contact message generation receives the character's own job and usual-hours/access guidance; real presence and availability are never assumed just because the work schedule suggests a shift.
- Follow-up integration required: gate live venue experiences and visit requests on access policy and NPC presence; do not initiate or mark a visit as completed from map navigation alone. Review overnight shift schedules for cross-midnight accuracy; verify world place seeding, TypeScript compilation and map rendering in staging.

## Workplace public-area encounter flow (follow-up)
- Venue screen now offers ask permission, ask while waiting (only after virtual arrival), and leave a note (only after arrival), all routed to the character's existing chat with a one-use editable draft. No scene is recorded as a mutual meeting until the character chooses to respond; there is no synthetic staff access.
- Generic VenueScene and random town encounters are suppressed on workplace pages; restricted medical spaces stay inaccessible. Hospital contact is an invitation to meet in a permitted public area, not an invitation inside the lab. Claire's real-world setting is a public library, not a school; any future school workplace must require controlled access and prior authorization.
- Fixed the overnight-shift helper's timezone/day rollover and added unit coverage.
- The completed conversational visit, workplace-specific dialogue scenes, confirmed meetup persistence, revised coordinates and production map integration must be checked in staging. Current workplace coordinates are approximate illustrative anchors, not verified building entrance locations. Never claim live interactive encounters are production-ready from these commits alone.

## Workplace/schedule consolidation
- Riley's canonical shift is now Sunday–Thursday 22:00–06:00 Eastern, with cross-midnight workday attribution consistent between workplace hints and character messaging; daytime 09:00–16:00 is reserved for sleep.
- All six schedules have off-shift windows. Off-shift means potential personal time, NOT guaranteed availability: disruptions, activities, calendar plans and independent choice still apply.
- Place seeding now upserts updated business names and positions for existing users, instead of retaining superseded workplace labels. Generic worker NPC encounters are not assumed.
- Safety: UPMC Altoona is a real hospital setting but the lab is never a playable patient-care area; workplace text messages remain fictional and must never assert real employment or private medical records.
- Existing map arrival, visitor choices and one-time in-chat drafts are implemented. A *fully automatic in-person AI scene with confirmed mutual presence, persistent accepted meetups and subsequent call/text callbacks remains unimplemented*. This cannot be treated as done without a distinct encounter state machine and staging E2E proof.
- Tests added to cover weekly work/off-hours and night-shift behavior, not executed yet. No merge/deployment.
