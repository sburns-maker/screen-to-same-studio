import { CharacterAIError, characterAIDiagnostic } from "./character-ai-error";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, Output } from "ai";
import { z } from "zod";

// Recognized by @ai-sdk/openai's Responses model catalog. No gateway fallback.
export const TEXT_MODEL = "gpt-6-luna";
const MAX_OUTPUT_TOKENS = 4096;
const MAX_INPUT_CHARACTERS = 100_000;
// Conservative process-local circuit breaker, not a substitute for project billing limits.
const HOURLY_RESERVED_TOKENS = 250_000;
let windowStart = Date.now();
let reservedTokens = 0;
let inFlight = 0;

export async function runStructured<T>(
  schema: z.ZodType<T>,
  instructions: string,
  input: string,
  operation: "reply" | "autonomous" | "debrief" | "unspecified" = "unspecified",
  context?: { operationId: string },
): Promise<T> {
  const operationId = context?.operationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.operationId) ? context.operationId : undefined;
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("Character AI is not configured");
  if (process.env["CHARACTER_AI_DISABLED"] === "true") throw new Error("Character AI is paused");
  const characters = instructions.length + input.length;
  if (characters > MAX_INPUT_CHARACTERS) throw new Error("Character AI context limit reached");
  if (Date.now() - windowStart >= 3_600_000) {
    windowStart = Date.now();
    reservedTokens = 0;
  }
  // One token per character is deliberately conservative for these English prompts.
  const reservation = characters + MAX_OUTPUT_TOKENS;
  if (inFlight >= 4 || reservedTokens + reservation > HOURLY_RESERVED_TOKENS) {
    console.warn("[character-ai]", {
      provider: "openai", model: TEXT_MODEL, status: "blocked", operation, operationId,
      failureKind: inFlight >= 4 ? "concurrency_limit" : "capacity_limit",
      reservedTokens, requestedReservation: reservation,
    });
    throw new Error("Character AI capacity limit reached; try later");
  }
  reservedTokens += reservation; // Keep reservations on failures: failed calls can still cost money.
  inFlight++;
  const started = Date.now();
  const reservationWindow = windowStart;
  try {
    const provider = createOpenAI({ apiKey, baseURL: "https://api.openai.com/v1" });
    const result = await generateText({
      model: provider.responses(TEXT_MODEL),
      instructions,
      messages: [{ role: "user", content: input }],
      output: Output.object({ schema }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
      providerOptions: { openai: { store: false, strictJsonSchema: true, reasoningEffort: "low" } },
    });
    // Reconcile only known usage in the same window. Unknown/failed requests keep
    // their conservative reservation; never erase other concurrent reservations.
    const actualTokens = result.totalUsage.totalTokens;
    if (windowStart === reservationWindow && actualTokens !== undefined &&
        Number.isFinite(actualTokens) && actualTokens >= 0) {
      reservedTokens = Math.max(0, reservedTokens + actualTokens - reservation);
    }
    // Validate before callers persist messages, memories, or state.
    if (result.finishReason !== "stop") throw new CharacterAIError("Incomplete character response", characterAIDiagnostic(TEXT_MODEL, null, null, null, result.finishReason === "length" ? "output_limit" : "invalid_response"));
    const output = schema.parse(result.output);
    console.info("[character-ai]", {
      provider: "openai",
      model: TEXT_MODEL,
      status: "ok",
      operation,
      operationId,
      instructionCharacters: instructions.length,
      contextCharacters: input.length,
      cachedInputTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens ?? null,
      durationMs: Date.now() - started,
      inputTokens: result.totalUsage.inputTokens,
      outputTokens: result.totalUsage.outputTokens,
      totalTokens: result.totalUsage.totalTokens,
    });
    return output;
  } catch (error) {
    const apiError = APICallError.isInstance(error) ? error : null;
    const diagnostic = error instanceof CharacterAIError ? error.diagnostic : characterAIDiagnostic(
      TEXT_MODEL, apiError?.statusCode ?? null, apiError?.data,
      apiError?.responseHeaders?.["x-request-id"],
      apiError ? undefined : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "invalid_response",
      apiError?.responseBody,
    );
    // No raw SDK errors: those can contain keys, request bodies or private dialogue.
    console.warn("[character-ai]", {
      provider: "openai", model: TEXT_MODEL, status: "failed", operation, operationId,
      durationMs: Date.now() - started,
      statusCode: diagnostic.statusCode,
      failureKind: apiError ? "provider_http" : diagnostic.code === "timeout" ? "timeout" : "invalid_or_incomplete_response",
      code: diagnostic.code, providerCode: diagnostic.providerCode, param: diagnostic.param,
      requestId: diagnostic.requestId, retryable: diagnostic.retryable,
    });
    // Preserve the existing messages used by world-worker access/cost circuit breakers.
    const message = [402, 403].includes(diagnostic.statusCode ?? 0)
      ? `Character AI access unavailable (${diagnostic.statusCode})`
      : "Character AI is temporarily unavailable; please try again later";
    throw new CharacterAIError(message, diagnostic);
  } finally {
    inFlight--;
  }
}
