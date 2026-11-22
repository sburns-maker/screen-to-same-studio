## Private strategy and international power — 2026-11-22
- Player's ambition to conquer or control the wider world is a **private intention**, not common knowledge. Taylor, Sabrina, the press, government officials and ordinary NPCs must NOT know or imply they know unless told by the player or an actual public event makes it known.
- World Order's private strategy defaults to `private`, including migrated existing worlds. A deliberate public declaration is required to reveal it; any actual private disclosure to an NPC belongs only in that character's knowledge, not a global news feed.
- Six alternate-history political leaders have been introduced as NPCs: presidents/prime ministers representing the United States, United Kingdom, Canada, Brazil, France and Mexico. These are explicitly invented officials, not depictions of current real leaders or real conversations.
- The World screen now supports diplomatic openings, summits, trade negotiations, provisional treaties, strategic defense readiness and training, military alert postures, high-level intervention decisions and de-escalation. Reputation, resources, trust and institutional costs govern consequences. **A military decision does not automatically conquer a country**; operational military tactics and real-target details are out of scope.
- Diplomatic trust and national readiness are persistent per-save state, including old-world migration. The expansion is an initial international power simulation, not yet full playable world conquest, negotiations, wars and territorial administration.
- Development is isolated in `feature/world-order-private-ambition-global-power-20261122` based on the already-merged `main`, not the earlier PR #247/#248.

# World Order — persistent design memory

Updated 2026-11-21 (interactive rescue and UI overhaul). This file describes World Order only. Do not modify Tess or AI Town canon.

## Vision
- Modern Earth recognizable geography, institutions and celebrities; fictional alternate history, with clear fiction disclosure for made-up incidents, statements, encounters and political events.
- Opening: the player is physically present at a fictionalized Sabrina Carpenter concert when danger begins, acts through three scene beats (notice threat, protect people, handle aftermath), and the rescue becomes canon only after the player actually completes the scene. A freeform AI narrator supplements deterministic actions; consequences and reputation vary. Later, a televised interview alongside Sabrina involves the fictional president and choices that influence public reaction.
- Cuban constitutional/economic crisis follows; gaining power is never guaranteed. Branch into local democratic reform, investment, diplomacy or other later paths. Political legitimacy must involve local people and institutions.
- One world encompasses fame, career, businesses, family, romance, media, politics, national leadership and global affairs. No tedious national accounting.
- Posts and activities each advance one fictional day. DMs do not. Optional time skips can be added.
- No artificial gem or energy systems; cost control through server-side usage budgets. Never expose API keys to the browser.
- Real public figures are fictionalized and have their own agency; avoid unsupported assertions about their actual private lives.

## Cast architecture
- The world has many characters: famous musicians/actors, world leaders, elected officials, media, businesses, organizers, citizens, rivals and acquaintances.
- See `src/lib/world-order-cast.ts` for initial cast + leader-office placeholders. This is a registry only; the UI currently exposes Sabrina, Maya and Elena.
- Each active NPC should own a stable identity, preferences, goals, relationships, timeline, known facts, private memories, and independent schedule.
- Characters learn facts by witnessing events, being told, public reporting, or uncertain rumors, not omniscience. Public media can distort true events.
- Real-world officeholder names must be date-verified when starting a session rather than hardcoded.
- Limit each game world to **200 named NPCs** total (celebrities, leaders, reporters, randos, etc. share the same limit), while keeping roughly **16 active**, maximum **20 active**, at once. Dormant NPCs preserve their memories and relationships without automatic model calls. Country records, institutions, and anonymous background populations do not consume NPC slots.
- `WORLD_ORDER_CAST_RULES` enforces these targets in code; persistent DB insertion guards must be added with the future world-scoped schema. These are design/runtime limits, not a claim that full cast creation is already available.

## Ultimate campaign objective: world domination
- The player may eventually pursue control or dominance over the entire simulated world; Cuba is a possible first power base, not the final act. Completing an early Cuba arc must not end the campaign.
- Allow diplomatic unification and coercive/military conquest as distinct campaign strategies, as well as mixed routes that change over time.
- Diplomatic strategy includes negotiations, treaties, federations, economic partnerships, electoral or constitutional power transitions, influence, alliances and voluntary integration.
- Military strategy exists as high-level fictional grand strategy: mobilization, defense, invasions, occupation, sanctions, casualties, resistance, legitimacy and international reaction. Outcomes are modeled abstractly, not as real-world tactical instructions.
- Conquering territory and winning durable control are separate objectives. Populations and institutions can resist occupation; rebellion, humanitarian consequences, instability, and foreign counteralliances must be represented.
- Powers and regions use a state machine (independent, allied, dependent, occupied, annexed, federation member) with changes recorded in an auditable event ledger. Map colors, leaders and relations must derive from canonical state—not AI narration alone.
- No guaranteed success or scripted easy victories. The world can form coalitions, negotiate peace, retaliate, fracture or accommodate the player's rising power.
- Make national management accessible: summary dashboards for influence, stability, resources, military strength and diplomatic relationships, without granular national budgets.
- There can be several possible end states: a united voluntary world federation, coercive global hegemony, fragmented sphere-of-influence system, failed conquest, or ongoing open-world play.
- A late-game multi-country turn should remain affordable through deterministic strategic simulation plus focused AI narration for key characters and events.

## Social network and immersion
- The player should see multiple independent, contrasting social-media reactions after major events, not only WorldWire bulletins. Fan accounts, eyewitnesses, journalists, political skeptics, local organizers and businesspeople post distinct takes, with handles, simulated engagement, comment threads, likes, and replies.
- The first release uses deterministic scripted reaction waves for rescue, televised interview and Cuba. Player-written posts generate limited context-sensitive feedback; deeper AI-generated character reactions remain future work.
- The full three-beat rescue transcript lives in world history and character memory. The public feed uses concise breaking reports, social reactions, and comment threads, rather than a wall of AI narration.
- Keep a single clear alternate-history disclosure in the game's UI chrome and in underlying AI prompts, **not** repetitive "fictional" qualifiers inside every news headline, scene description or dialogue. Real-world facts and fictional incidents must still be distinguishable to players by context.
- Migrate existing browser saves in place: preserve story progress, DMs and learned canon, replace overly long rescue news posts with short headlines, and append missing reactions idempotently.

## World Director — Balanced (default)
- The default mode is Balanced: at most one deterministic, contextual background event every **2 fictional days**. Realistic = every 5 days; Chaotic = daily.
- Director reacts to rescue/interview/Cuba chapter and the player's chosen Cuba strategy, with plausible press, business, citizen and political developments.
- Events are idempotent per game day and recorded in the saved event ledger and feed. They never create undocumented marriages, pregnancy, elections or conquests.
- The initial Director does not make paid AI calls; character dialogue still uses the existing authenticated server AI endpoint.
- These are initial prototype mechanics, not yet the eventual large-scale AI autonomous world simulation.

## Campaign scene progression — no recycled intro events
- The first version mistakenly used `campaign.stage % 4`, replaying Rafael's first town hall and the same press/assembly prompts every four game actions. Merely adding "new critics" to old dialog was not acceptable.
- `src/lib/world-order-campaign-episodes.ts` now contains 36 authored, distinct encounters (12 each for reform, investment and diplomacy) with choices and durable effects. The three initial encounters are used only once per world.
- The existing stage counter maps directly to a new authored encounter; stage 12 in the reform route now presents a coastal storm-response mission rather than Rafael's opening town hall. No save reset or loss of established political position is necessary.
- After route-specific encounters, subsequent missions cross into economic, civic and diplomatic issues from other branches; later dynamic pressures are generated from campaign support, stability and recent decisions, with distinct IDs per stage.
- Public-mandate milestones are interleaved, with different questions for outsiders, delegates, candidates and presidents. An elected president faces distinct governance crises rather than the same nomination scene.
- A 55-decision regression walk on each route asserts no repeated mission IDs and migration tests confirm preservation of saved candidate standing and relationships.
- The authored encounters and post-authored pressure engine are interim gameplay, not a claim that the future AI World Director autonomously generates wholly new events.

## Active Cuba campaign gameplay (post-opening)
- Selecting the reform, investment, or diplomacy route must begin a playable scene immediately. The game must never dead-end at a static summary and an "advance one day" button.
- `src/lib/world-order-campaign.ts` provides three distinct initial interactive encounters per route plus recurring public-mandate milestones, with character dialogue, choices, concrete support/stability/influence/trust changes, recorded decisions and subsequent rounds.
- Active characters include Elena Valdés, Sofía Reyes, Rafael Morales, Lucía Herrera, Daniel Mercer and Nora Wells, alongside Sabrina and Maya. These people should remain independently motivated and may disagree with the player.
- `src/lib/world-order.functions.ts` supports freeform campaign dialogue: the AI narrates the player's own words, classifies the approach into permitted consequences, and never directly grants territory, treaties, elections or political office.
- The current campaign UI surfaces the next mission in both Feed and Story, offers a direct link to DM key figures, and displays relationships on the World dashboard. Major political choices advance one day and appear in world history; ordinary DMs do not.
- Existing browser saves at Days 4–7 and later must migrate seamlessly into the first available campaign mission, without erasing the rescue, DMs or political route.
- Do not generate repetitive WorldWire filler for each day skip. Relevant character posts and missions drive story.
- **Scope:** this is a stronger scripted/deterministic playable campaign loop with freeform AI narration, not yet a full autonomous long-term government/conquest simulator. Basic public-mandate milestones, candidate standing and an earned presidential outcome are now deterministic game states. Full election mechanics, military conquest, detailed government control, a truly autonomous world director, durable DB persistence and cross-world history remain engineering work.

## Living social life and usable world assets — PR #248
- At 4 million followers the player must receive a small but noticeable stream of spontaneous incoming DMs, not only AI replies to player-initiated messages. Initial simulation generates up to three bounded messages per new game day with no background AI calls, then uses the authenticated AI server when the player replies.
- The cast includes **10 modeled celebrities** in an explicitly alternate-history setting (Sabrina Carpenter, Taylor Swift, Zendaya, Rihanna, Dua Lipa, Selena Gomez, Pedro Pascal, Ryan Reynolds, Beyoncé, Billie Eilish), plus a tour coordinator, reporters, organizers, investors, and local citizens. All famous-person statements and interactions are game fiction, not actual communications.
- A celebrity must not endlessly say they are "too busy". For a meeting request, an AI character should respond specifically and propose a time/place or a definite alternative. The player can use the **Invite to meet** action to make an in-game appointment, travel to that city, and attend it once the game day arrives. Successful meetings create durable trust, story history and personal memories, without guaranteed romance or endorsement.
- The new searchable DM inbox includes previews and unread markers. Direct chats do not advance time; incoming messages are scheduled on existing player-driven day transitions, not a Tess-style automatic 15/30-minute tick.
- `src/lib/world-order-social-life.ts`: social roster, bounded incoming mail, per-contact read state and meetup engine. `src/lib/world-order-open-world.ts`: travel, real assets/ownership, upgrades, management income, hosting social events, and direct negotiations.
- The Life screen contains an agenda for upcoming meetups, seven cities, six purchasable enterprises, and political/social event controls. Existing worlds migrate in place through `readSave` without wiping history; sandbox state is still browser-local.
- Characters retain distinct private memory namespaces. Never reuse Tess's messages, character history, or worker for this game.
- These are concrete playable systems with deterministic reactions and character AI-on-demand, **not** a claim of a fully autonomous 200-person AI world yet.
- Development lives on `feature/world-order-open-world-actions-20261122`, draft PR #248 targeting `main`. Do not merge without CI and interactive smoke tests.

## Memory invariants
- Persist a world-scoped canonical event ledger including day, actor, subjects, public/private scope, provenance, and idempotency key.
- Important anchors (marriage, pregnancy, childbirth, election results, ownership, office appointments) are durable structured state, never inferred solely from AI text or overwritten silently.
- Distinguish confirmed facts, claims, rumors, proposed future events and subjective beliefs. Contradictions require adjudication rather than replacing canon.
- Per-character private knowledge must never leak to other NPC prompts. Relevance-based retrieval may summarize old conversations but must always include critical anchors.
- Relationship memory distinguishes direct encounters from hearsay; build up trust and attachment over time without forcing affection.
- Real-world time vs game-day progression must be explicit. Key milestones are measured in fictional days and tracked deterministically.
- Maintain user-controlled export, rewind/checkpoint and correction tools, with private data isolation by authenticated user and world.

## Existing code / interim prototype
- `src/routes/world-order.tsx`: cinematic dark/mobile interface, interactive three-beat concert rescue with predefined or freeform AI actions, subsequent story, feed, DMs, day clock, browser-local save and memories; accessible from AI Town home on the branch.
- `src/lib/world-order-rescue.ts`: pure scene state machine; rescue is not presumed before player action, and game day advances only on completion of the three beats.
- `src/lib/world-order.functions.ts`: also hosts authenticated AI narration for freeform rescue actions; AI narrates but cannot silently override canonical state.
- `src/lib/world-order.functions.ts`: authenticated server function using existing `runStructured` OpenAI provider with `OPENAI_API_KEY` in server environment only. The app does not contain or reveal that key.
- `src/lib/world-order-cast.ts`: initial NPC catalog and future office role slots.
- Current prototype memories are stored in browser localStorage, not production DB, and are not cross-device. AI-generated memory summaries are provisional, limited, and cannot rewrite known anchors.
- No production database migration, archive, deployment or Tess-data change has been made. Actual AI replies must be tested against configured server and costs before production.

## Next engineering tasks
1. Implement authenticated, user/world-scoped database tables with RLS for world saves, events, characters, relations, knowledge and conversations; migration and backup rehearsal before applying.
2. Transactional or version-checked server actions for updates; migrate browser saves without losing history.
3. Expand AI character reply selection to the full cast, based on active scene and knowledge visibility; provide character-specific recall.
4. Add simulation scheduling for reactions to public posts, economic and political events, news rumors, and guided activity scene turns.
5. Add tests: consistent game clock; per-character privacy; idempotent events; remembered anchor consistency; multi-world isolation; AI API errors and rate limits.
6. Run typecheck/build and smoke-test the branch, then merge and publish only after readiness verification.
