/**
 * Maps OpenAI voice-creation failures to safe, user-facing messages.
 * Never includes keys, headers or raw request bodies; provider text is
 * truncated and scrubbed of anything token-like.
 */
export type VoiceCreationErrorKind =
  | "rate_limited"
  | "billing"
  | "access"
  | "validation"
  | "provider"
  | "timeout"
  | "network"
  | "unknown";

function scrub(s: string): string {
  return s
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function classifyVoiceCreationFailure(
  status: number | null,
  body?: { error?: { message?: string; code?: string | null; type?: string } } | null,
  thrown?: { name?: string } | null,
): { kind: VoiceCreationErrorKind; message: string } {
  if (status === null) {
    if (thrown?.name === "TimeoutError" || thrown?.name === "AbortError")
      return {
        kind: "timeout",
        message:
          "OpenAI didn't respond within 30 seconds. The voice may still have been created — check your saved candidates before trying again.",
      };
    return {
      kind: "network",
      message: "Couldn't reach OpenAI (network error). Nothing was retried.",
    };
  }
  const code = body?.error?.code ?? "";
  const detail = body?.error?.message ? ` OpenAI said: "${scrub(body.error.message)}"` : "";
  if (status === 429 && code === "insufficient_quota")
    return { kind: "billing", message: `OpenAI quota or billing limit reached (HTTP 429).${detail}` };
  if (status === 429)
    return {
      kind: "rate_limited",
      message: `OpenAI rate limit reached (HTTP 429). Wait a minute or two before creating another candidate.${detail}`,
    };
  if (status === 402)
    return { kind: "billing", message: `OpenAI billing limit or insufficient credits (HTTP 402).${detail}` };
  if (status === 401 || status === 403)
    return {
      kind: "access",
      message: `OpenAI denied custom voice access for this API key's project (HTTP ${status}).${detail}`,
    };
  if (status === 400 || status === 409 || status === 422)
    return { kind: "validation", message: `OpenAI rejected the voice request (HTTP ${status}).${detail}` };
  if (status >= 500)
    return {
      kind: "provider",
      message: `OpenAI's voice service failed (HTTP ${status}). Try again later.${detail}`,
    };
  return { kind: "unknown", message: `Custom voice creation failed (HTTP ${status}).${detail}` };
}
