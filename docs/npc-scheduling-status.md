# NPC schedules and Riley profile handoff

## NPC routines
- `src/lib/npc-schedules.ts` supplies a reproducible Eastern-time daily activity snapshot for each of the 80 fictional NPCs.
- Work shifts vary with roles; nighttime, early, evening and daytime windows exist.
- Off-days, sleep, commutes, errands, outdoor activity and social time have stable day seeds. Repeated calls do not reroll activities.
- `neighborhoodSnapshot` provides a small resident selection, included as *background setting* in the canonical AI prompts.
- Neither private friendships nor witnessed encounters should be fabricated from these schedule snapshots. The next milestone for a truly autonomous city is persistent event records and an NPC-to-NPC relationship graph.
- Place references are not actual business-hours confirmations.

## Riley image
- Approved full-resolution portrait is in the current ChatGPT conversation: `riley-hart-canonical.png`.
- The GitHub branch now contains an optimized 72×90 JPG thumbnail derived from the approved original at `src/assets/avatars/riley-canon.jpg`. It is imported into Riley’s app profile.
- The original full-resolution image has NOT been imported into the app’s image-generation reference storage; it is available as `riley-hart-canonical.png` in the ChatGPT conversation. Preserve it for future image continuity.
- Store the full-resolution original for canonical image generation and use a separately optimized thumbnail for chat/avatar performance.

Run `npm test -- src/test/npc-schedules.test.ts` and `npm run build` before merging. The SQL migration for Riley must also be applied.
