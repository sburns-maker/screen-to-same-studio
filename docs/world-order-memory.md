# World Order — persistent design memory

Updated 2026-11-21. This file describes World Order only. Do not modify Tess or AI Town canon.

## Vision
- Modern Earth recognizable geography, institutions and celebrities; fictional alternate history, with clear fiction disclosure for made-up incidents, statements, encounters and political events.
- Opening: player saves fictionalized Sabrina Carpenter from an assassination attempt at a public concert; during a televised interview alongside her, player publicly embarrasses the sitting US president. These two beats are guaranteed, consequences and relationships vary.
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
- Maintain bounded active AI cast to limit cost; a much larger dormant NPC directory can exist cheaply as structured data.

## Memory invariants
- Persist a world-scoped canonical event ledger including day, actor, subjects, public/private scope, provenance, and idempotency key.
- Important anchors (marriage, pregnancy, childbirth, election results, ownership, office appointments) are durable structured state, never inferred solely from AI text or overwritten silently.
- Distinguish confirmed facts, claims, rumors, proposed future events and subjective beliefs. Contradictions require adjudication rather than replacing canon.
- Per-character private knowledge must never leak to other NPC prompts. Relevance-based retrieval may summarize old conversations but must always include critical anchors.
- Relationship memory distinguishes direct encounters from hearsay; build up trust and attachment over time without forcing affection.
- Real-world time vs game-day progression must be explicit. Key milestones are measured in fictional days and tracked deterministically.
- Maintain user-controlled export, rewind/checkpoint and correction tools, with private data isolation by authenticated user and world.

## Existing code / interim prototype
- `src/routes/world-order.tsx`: prototype story, posts, DMs, choices, day clock, browser-local save and memories; accessible from AI Town home on the branch.
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
