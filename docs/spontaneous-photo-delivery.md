# Spontaneous photos: queue repair and increased opportunities

The reported timeline showed an optional photo opportunity followed by text and a later `a reply is still pending` block. Neither event proved an image was requested. This repair separates prepared-message delivery from image generation and clarifies the existing character decision.

## Causes and changes

1. Prepared replies use their future delivery time as `created_at`. The worker calculated a negative gap from the newest queued text, which suppressed spontaneous photos until delivery. It now distinguishes a pending text queue from a pending image. An eligible spontaneous photo may be prepared while texts wait, with its delivery scheduled after those replies. Existing texts are preserved and supplied as clearly labelled own-character queued context to avoid repetition. Ordinary autonomous text initiation still keeps its existing gap rules.
2. A selected photo opportunity reached a generic “write the next text; photo usually null” task. The existing shared character call now receives a photo-first task for this mode. Sharing remains optional; null, silence and text-only choices remain valid. No extra inference, forced photo, invented consent or retry loop is added.
3. Returned text-only outcomes now explicitly record `photoSent=false`, `imageRequested=false` and a text-only explanation. Prepared images are labelled **Photo scheduled for delivery** until their delivery timestamp passes. Initiation summaries no longer display an entire internal photo instruction as if it proved a photo was sent.

Pending photos, an in-flight durable generation, a full prepared-message queue, sleep, quiet hours, muting, character boundaries, willingness, identity validation and budgets remain protected. No paid/uncertain action is reset or retried. Historical timeline entries remain intact.

## Requested frequency increase

Base selection per eligible hourly opportunity changed as follows:

| Character | Before | After |
| --- | ---: | ---: |
| Tess | 38% | 50% |
| Maya | 60% | 75% |
| Claire | 35% | 45% |
| Jordan | 16% | 22% |
| Ben | 25% | 34% |
| Riley | 34% | 44% |

Rare/Normal/Frequent still scale the chances, visual context can add weight, and the existing 85% selection ceiling remains. Polling does not reroll an hourly draw. These are **opportunity rates, not measured or guaranteed photo-delivery rates**. Character choice and existing pacing/eligibility still apply. More accepted opportunities can use more image credits; existing spending/attempt caps are unchanged.

## Verification / release

SQL-backed worker regression tests cover an actual generated image queued after a future text, preserving the existing reply, private image metadata, generated-image ledger and idempotent subsequent ticks. Other regressions protect already-pending photos, text-only decisions, quiet hours and the existing pipeline. Prompt tests verify the shared Tess/Maya call receives the photo-specific task while preserving choice. Sampling tests preserve character/frequency differences.

No schema migration, provider/model change, production reset or deployment is required by the code change. This branch is separate from the Api18 foundation work and based on the latest fetched main (`ff0be18`); main itself was not modified.

After normal review and deployment, inspect **new** timeline decisions in an eligible daytime window. A real photo should show generation requested plus its actual attachment or queued delivery; a text-only choice must not be mistaken for a delivered image. Existing developer world-tick tools can exercise scheduling, but mocked tests do not verify production cron or paid provider quality. No live photo generation was performed here.

Final local validation: full suite **1,012 passed, 55 opt-in skipped**; TypeScript and production build passed. The focused SQL-backed queue/photo tests passed, as did new-module lint and legacy-file logic lint with the existing formatting rule disabled. All paid providers were mocked; production cron, live model choices and live image delivery were not tested. No migration or deployment was performed.
