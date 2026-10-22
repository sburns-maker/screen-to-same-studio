# OpenAI usage, caching and shared-world cost investigation

## Evidence and pricing provenance

User-reported dashboard snapshot on October 22, 2026: 2,017,511 tokens, 433 Responses/Chat Completions, 4% caching hit rate, $0.85 spent, $9.15 prepaid remaining and a $100 configured monthly budget. Arithmetic gives **4,659.4 total tokens/request** and $0.001963/request if the denominators cover the same traffic. Neither is a per-feature measurement. Image endpoint charges, model mix, date filters and the cache-rate denominator are unknown. Do not extrapolate $0.85 to full automation or treat a budget setting as additional prepaid credit or a guaranteed hard stop.

Official pricing/model pages returned proxy 403 here. The user supplied and states they verified these standard API rates against [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [GPT-4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), and [GPT-Image-1 Mini](https://developers.openai.com/api/docs/models/gpt-image-1-mini). These are **user-verified inputs**, not independently fetched/account-verified rates. No configured model changed.

| Model | Input / million | Cached input / million | Output / million |
| --- | --- | --- | --- |
| GPT-6 Luna | $0.10 | $0.01 | $0.50 |
| GPT-4.1 Mini | $0.40 | $0.10 | $1.60 |

| GPT-Image-1 Mini size | Low | Medium | High |
| --- | --- | --- | --- |
| 1024×1024 | $0.005 | $0.011 | $0.036 |
| 1024×1536 (current app) | $0.006 | $0.015 | $0.052 |

Reference-image inputs add charges not included in the supplied output-image rates. Hosting, DB, storage, egress, GitHub Actions and optional project services are separate.

## Actual code paths and call counts

| Operation | Configured model | Calls and attribution |
| --- | --- | --- |
| Dialogue / autonomous user-facing text | direct `gpt-6-luna` Responses, strict JSON | Normally one main generation per successful turn; no automatic retry. Concurrent/replayed actions can be skipped. Process limits may reject before inference. |
| Memory extraction / relationship deltas / continuity extraction | same Luna response | Included in dialogue JSON, **not another memory model call**. Recall, clamping, stage derivation and evidence validation use no model. |
| Debrief | direct `gpt-6-luna` | One separate generation when requested. Not inherently one per user message. |
| User-photo description | `gpt-4.1-mini` Chat Completions | Cached in message metadata; up to two previously undescribed user images per turn. Existing gateway fallback uses `google/gemini-3.8-flash` only without direct key. |
| Generated photo | direct `gpt-image-1-mini`, portrait medium | One image attempt, reference edits for characters. Existing gateway configuration names `openai/gpt-image-2.5-sunburst`, but new character photos reject unverified conditioning and require direct visual screening. |
| Visual design / object-scene screen | direct `gpt-4.1-mini` | One bounded vision call per new generated photo; portrait plus result for humans, result only for objects. |
| Lettering screen | direct `gpt-4.1-mini` | Up to one additional vision call for text-prone/required-text images when configured. |
| World schedules, weekly social events, storylines, new plans/RSVPs/exchanges | none | Deterministic rules, transactional writes and existing quotas. New social proof adds **zero paid AI calls** until an optional normal follow-up is selected. |
| Push, idempotency, media storage | none | Web Push/storage/network operations, not LLM requests. |

A text-only reply normally uses one call. A generated photo reply typically uses one Luna + one image + one visual screen, optionally one lettering screen; previously undescribed user photos may add up to two descriptions. A separate debrief adds another Luna request. Discarded/error calls can still be billed. This explains why “one message” does not always equal one dashboard request.

## Measurement and prompt-cache investigation

Historical per-operation input/output averages cannot be recovered from this checkout: it has no production logs, usage API credentials or account analytics connector. Existing logs report model and input/output totals. This change adds safe operation tags (`reply`, `autonomous`, `debrief`), cached-input tokens and instruction/context character counts to future logs; it logs no prompt, memory, transcript or key. These are observations for later aggregation, not historical averages. Character counts are not token counts.

Reasons to investigate for the 4% figure: varying photo hints/boundaries in instructions; dynamic state/time/weather early in context; different characters/models; short stable prefixes; low repeated traffic within provider cache retention; and whether “4%” measures requests or cached tokens. Cache misses are **not diagnosed conclusively** from the dashboard aggregate.

Tess's large static bible currently sits in the input context after instructions that can vary with a photo opportunity. Cache matching is prefix-based: the bible cannot repair an earlier differing prefix. Other characters place more stable canon in instructions, but dynamic policies still intervene. Proposed optimization: stable shared rules + character canon first, then dynamic availability/eligibility, memories and transcript; keep schemas stable; use model-supported caching options only after checking compatibility. Do not cache or share private histories across characters/users. No guaranteed cache hit rate, persistent cache capability or cost discount is assumed. No semantic prompt reorder was made in this proof; measure before A/B changing behavior.

Recall is already selective (18 memories), but fetching up to 2,000 rows per turn can become DB-heavy. Consider per-type recent/high-importance candidate indexes and relevance ranking before adding embeddings. Token-budget important canon/commitments first and recent dialogue second. Do not shrink context blindly and lose dates, gifts or boundaries. Reflection is useful only for meaningful accumulated experiences, not every tick.

## Forecast assumptions and formulas

These are **planning scenarios**, not measured workloads or guarantees. All structured simulation costs $0 in model inference regardless of NPC count. Supporting NPCs need no paid calls by default. The paid NPC rates below model a future optional feature, **not something enabled in this branch**.

Example text/summarized exchange: 4,500 input + 350 output tokens, no cache discount → **$0.000625/call** at the supplied Luna rates. This is near the dashboard's blended token scale but is not an inferred split. Dense-context sensitivity: 12,000 input + 1,000 output → **$0.0017/call** (2.72× the base). Apply that multiplier to text columns for denser histories. General cost = `(uncached_input*input_rate + cached_input*cached_rate + output*output_rate)/1,000,000`.

Five primary characters: low = 1 optional paid call/character/day; moderate = 2; active = 6. Supporting NPC optional **shared-exchange summary calls**: 0.02 / 0.1 / 0.5 calls per NPC/day respectively. Each summarized interaction is billed once, not once per participant; rates already express summary calls. Routine attendance, schedules, NPC identity, relationship projections and mundane exchanges remain structured.

30-day text-only forecast (excludes manual user chats and images):

| Supporting NPCs | Activity | Calls/day, uncapped | USD/day | USD/month | Month with existing 12-call/day user quota |
| --- | --- | --- | --- | --- | --- |
| 10 | low | 5.2 | $0.0032 | $0.098 | $0.098 |
| 10 | moderate | 11 | $0.0069 | $0.206 | $0.206 |
| 10 | active | 35 | $0.0219 | $0.656 | $0.225 |
| 25 | low | 5.5 | $0.0034 | $0.103 | $0.103 |
| 25 | moderate | 12.5 | $0.0078 | $0.234 | $0.225 |
| 25 | active | 42.5 | $0.0266 | $0.797 | $0.225 |
| 50 | low | 6 | $0.0037 | $0.113 | $0.113 |
| 50 | moderate | 15 | $0.0094 | $0.281 | $0.225 |
| 50 | active | 55 | $0.0344 | $1.031 | $0.225 |
| 100 | low | 7 | $0.0044 | $0.131 | $0.131 |
| 100 | moderate | 20 | $0.0125 | $0.375 | $0.225 |
| 100 | active | 80 | $0.0500 | $1.500 | $0.225 |

The current autonomous quota is shared per user, not 12 per character. Scenarios exceeding it require changed policy and do **not** run at the uncapped rate today. Future NPC summaries must consume a deliberate budget if added. With no optional AI summaries, increasing NPCs from 10 to 100 adds database/rules work, not model charges. New proof interactions themselves remain AI-free.

At a hypothetical 60% cached-input-token fraction, base text cost would be $0.000382/call versus $0.000625 uncached. This is sensitivity analysis, not a promise of 60% caching. The reported 4% dashboard figure is not automatically equivalent to 4% of input tokens.

## Images, checks and combined budgets

Illustrative human visual screen: 4,500 effective billed input tokens + 100 output → $0.00196. Lettering screen: 2,500 input + 80 output → $0.001128. Real vision tokenization depends on dimensions/detail/model scaling; these are assumptions, not literal pixel-to-token measurements. Assume 25% of images need a lettering check. No auto regeneration.

| Images/month | Medium output-image cost only | Medium + visual + 25% lettering | High + same checks |
| --- | --- | --- | --- |
| 0 | $0.000 | $0.000 | $0.000 |
| 15 | $0.225 | $0.259 | $0.814 |
| 30 | $0.450 | $0.517 | $1.627 |
| 60 | $0.900 | $1.035 | $3.255 |

**Add reference-input charges to every applicable row.** Exact reference-input prices/usage were not supplied. Current defaults cap image attempts at two/day and 20/month per conversation plus a shared six/day and 60/month per user. Failed/withheld attempts still count. Five characters averaging one image/day would request 150/month, which exceeds the existing shared limit and is not enabled by this forecast.

Example active user, 50 text turns/day, capped 12 autonomous calls/day, and 60 medium image attempts/month: about **$2.20/month + reference inputs + hosting**, or **$4.20/month + reference inputs + hosting** at the dense-text sensitivity. At 100 text turns/day the analogous figures are about $3.13 / $6.75 plus those exclusions. Debriefs, user-photo descriptions, retries outside existing policy, other applications and account-wide usage are extra. This is why remaining $9.15 credit is not a guaranteed number of days.

Use the reproducible calculator `node scripts/shared-world-costs.mjs` and committed `shared-world-cost-estimates.json`; update rates and token assumptions when actual telemetry is available. Global four-generations/tick, per-user quotas, process token reservations, image-attempt quotas, timeout/no-retry rules and AI kill switches already exist. There is no new dollar-denominated organization-wide hard stop. Keep OpenAI project billing controls/alerts and monitor total multi-user usage; a per-user budget is not a global dollar cap.

## Deprecated model investigation and replacement candidates

The user reports GPT-4.1 Mini and GPT-Image-1 Mini as deprecated. No sunset date or direct account access could be independently checked here. Treat migration planning as necessary; SDK support alone does not prove a model is current, available or not deprecated.

Installed `@ai-sdk/openai` catalog contains current-family **candidate identifiers** `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-image-1.5`, `gpt-image-2`, `gpt-image-2.5-flare`, and `gpt-image-2.5-sunburst`. These are investigation candidates, not verified drop-in replacements. No model selector or paid provider was changed.

| Task | Candidate evaluation | Required proof / cost implication |
| --- | --- | --- |
| Vision descriptions and QA | Compare `gpt-5.4-mini`; evaluate `gpt-5.4-nano` only if image inputs + strict JSON are documented/account-enabled. | Current 4.1-mini baseline is $0.00196 for the assumed visual check. A replacement costs `(4500*new_input_rate + 100*new_output_rate)/1M`; cached rates apply only when actually billed. Check false passes/refusals, short output settings, endpoint support, timeouts and image tokenization. Smaller names do not establish lower effective cost. |
| Reference-conditioned images | Compare a documented high-fidelity edit-capable candidate, e.g. `gpt-image-1.5` or an available 2/2.5 model. | Current medium portrait output baseline $0.015 plus reference inputs/checks. Verify portrait size, multiple image refs, edit/mask semantics, quality tiers, privacy and actual 5-character visual fidelity. Gateway names with a provider prefix are not direct API IDs. |
| Cheap event classification | No model for current proof; optional Luna structured generation later. | Luna's supplied input rate is already below 4.1 Mini, but vision capability must not be inferred from that. Do not move image QA to a text-only model on price alone. |

Replacement prices, feature guarantees and availability could not be verified from blocked official pages; **inventing a numeric price comparison would be misleading**. Keep current models pending a separately reviewed migration. Before a switch: fetch current official price/model/deprecation pages, confirm account access, run mocked API compatibility tests, then a small approved real image/vision acceptance set. Report costs and failure rates before deployment. No new paid services or fallback to an unverified model is enabled here.
