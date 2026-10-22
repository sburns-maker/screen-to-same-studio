# Living-world audit and implementation boundary

Audited `origin/main` at `03bf4cf` on October 22, 2026, before larger changes. Existing histories and prior Codex commits are retained.

| System | Existing behavior | Gap |
| --- | --- | --- |
| Scheduling | Authenticated POST `/api/public/jobs/world-tick` and a database lease | No scheduler is checked into the repository; live invocation is not observable from this workspace |
| Social world | Seeded NPCs, stable weekly events, isolated knowledge and multi-step storylines persist inside world ticks | Some social schema exists in generated types but has no reproducible repository migration; planning slices can favor early characters |
| Daily activity | Code-defined schedules, clinic breaks, seeded disruptions | Mostly calculated on demand, not a persisted checkpoint |
| Initiative | Personality/state scoring, last-initiation timestamps, event context; foreground polling also calls initiation | Promises have no due/completed lifecycle; AI budget can stop later world checks; no durable aggregate AI/image budgets |
| Photos | Real image generation, identity-conditioned edits, private storage, stable action IDs, transactional delivery and recovery | Daily/monthly image-attempt limits and durable promise follow-through are missing |
| Notifications | VAPID, subscriptions, delayed sweep, atomic at-most-once claims | Quiet-hour messages are claimed before suppression; no heartbeat proves closed-app processing |
| Memory/canon | Per-character recall, distinct relationship dimensions, immutable code profiles and canonical NPCs | All extracted summaries look alike; improvised claims and explicit commitments are not distinguished |
| Dialogue | Direct OpenAI Luna, strict schemas, deterministic voice cleanup and topic motifs | Reported food/date/challenge loops are not fully represented; closure/emotional acknowledgment guidance is thin |
| Time modes | Real-Time respects delay/sleep; Practice shortens reply delay | Neither is a backend clock; no safe future-world preview exists |

The changes extend these systems rather than replacing them: additive owner-isolated world checkpoints and continuity records; evidence-validated promises/facts; atomic image budget reservations; the existing transactional delivery function extended to persist continuity alongside messages; a browser-independent scheduled invocation workflow; and debug health/preview tools. Important claims remain tentative unless evidenced, and code canon wins over generated biography changes. World progression never grants relationship points.

No production migration, scheduler activation, deployment or paid generation is authorized by this implementation. Live scheduler activation and provider access remain deployment checks, even when local tests pass.

Relationship audit: `deriveStage` already requires romantic attraction plus trust/intimacy and explicit romantic-intent thresholds for Early dating/Dating/Established relationship. High comfort with low attraction has a separate Platonic friendship stage. Per-turn delta clamping and the separate pressure/respect/physical-attraction dimensions remain unchanged. No migration updates existing score rows.
