# Direct OpenAI character text

All Tess, Maya, Claire, Jordan and Ben replies, independent initiations, orphan replies from world ticks, and conversation debriefs use `text-ai.server.ts`. Personality/canon prompts, schemas, state math, memory selection, social knowledge, storylines, delays and notifications are unchanged. There are no database migrations. Photo generation still uses Lovable AI Gateway and `LOVABLE_API_KEY`.

## Deployment gate

The configured direct model ID is `gpt-6-luna` (without `openai/`). The installed `@ai-sdk/openai` 4.0.96 explicitly lists it as a Responses model and supports its `low` reasoning effort. SDK request/response tests verify strict structured output serialization. This does not prove a particular OpenAI project's access. Onboarding had no `OPENAI_API_KEY` and documentation/API egress was restricted; a real authenticated check remains required before deployment.

1. Create a dedicated OpenAI API project and server key with Responses API and `gpt-6-luna` access. Configure project usage alerts, suitable rate limits and any available enforced spending limits. Budget alerts alone are not hard spending caps.
2. In the Lovable project's **Cloud → Secrets**, add `OPENAI_API_KEY` as a server secret. Never use a `VITE_` prefix, commit a value, or place it in frontend settings. Keep `LOVABLE_API_KEY` for photos. Ensure server HTTPS egress to `api.openai.com`. No new database settings are required.
3. Before syncing this commit to the Lovable-connected branch, securely inject the same project key into a private development/staging shell. From the repository root on Node 24 run `node scripts/verify-openai.mjs`. It first checks `/v1/models/gpt-6-luna`, then makes a small billed strict-JSON Responses request with the actual provider helper. It logs no credentials or generated text. Require exit status 0. Run `npm test`, `npx tsc --noEmit`, and `npm run build`.
4. Only after those checks pass and the Cloud secret exists, push the prepared commit to the Lovable-connected branch. Changes on that branch sync to Lovable; do not push early. Use Lovable's publish/update action to activate the validated version. Neither a local commit nor this document changes the published app.
5. Smoke-test authenticated replies for each character, a debrief, and a managed background world tick. Confirm `[character-ai]` logs show provider `openai`, model `gpt-6-luna`, and token counts. Check the OpenAI project's usage dashboard. Verify existing photo behavior separately; photos continue consuming Lovable AI credits.

## Failure and cost controls

Requests have a 60-second timeout, no automatic retries or gateway fallback, 4,096 maximum output tokens, and a 100,000-character context ceiling. Oversized contexts fail rather than silently dropping memories. An instance allows at most four concurrent requests and conservatively reserves at most 250,000 tokens per hour (one token per input character plus maximum output). Reservations remain charged to the local limiter after failures. Logs contain only provider/model, timing, outcome, and token counts; provider errors and payloads are never forwarded.

`CHARACTER_AI_DISABLED=true` in server environment settings is an emergency text-only pause. It does not disable photo generation. The circuit breaker and in-flight turn coalescing are process-local and reset on restart; they are not global billing limits or cross-instance idempotency. Existing world-job database leases remain unchanged. OpenAI billing/access failures with HTTP 402/403 retain only the status code for the existing world-initiation pause logic. Other failures return a generic error and can be attempted again by existing background scheduling.

Only validated, completed structured output reaches turn persistence. Provider failures preserve pending replies and do not update relationship state, messages or memories. Overlapping turn attempts within an instance share one promise. Existing multi-step database persistence is not made transactional by this change; database failures or concurrent servers retain the repository's existing limitations. No provider retry replays persistence.

To roll back, pause text generation, revert the provider commit, and republish the last validated version. Existing data and schemas require no rollback.
