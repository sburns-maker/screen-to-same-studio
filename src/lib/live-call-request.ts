import { CALL_OPENING_PROMPT, INCOMING_CALL_OPENING_PROMPT } from "./live-calls";
/** Keep the existing Voice Studio session shape; omit unverified turn-detection overrides. */
export function liveCallRequest(
  sdp: string,
  voiceId: string,
  instructions: string,
  incoming: boolean,
) {
  return {
    transport: { type: "webrtc", sdp },
    session: {
      model: "gpt-live-1",
      delegation: { type: "client" },
      instructions,
      input: [
        {
          type: "message",
          role: "developer",
          content: [
            {
              type: "input_text",
              text: incoming ? INCOMING_CALL_OPENING_PROMPT : CALL_OPENING_PROMPT,
            },
          ],
        },
      ],
      audio: { output: { voice: { id: voiceId } } },
    },
  };
}
const codes = new Set([
  "invalid_request_error",
  "invalid_value",
  "unknown_parameter",
  "unsupported_parameter",
  "model_not_found",
  "invalid_model",
  "model_not_supported",
  "invalid_voice",
  "voice_not_found",
  "insufficient_quota",
  "rate_limit_exceeded",
  "authentication_error",
  "permission_denied",
  "invalid_api_key",
]);
const fields = new Set([
  "session",
  "transport",
  "audio",
  "input",
  "output",
  "turn_detection",
  "create_response",
  "interrupt_response",
  "type",
  "eagerness",
  "voice",
  "id",
  "model",
  "delegation",
  "instructions",
  "sdp",
  "content",
  "role",
  "text",
]);
/** Never forward or log raw provider messages, SDP, headers or instructions. */
export function liveCallFailure(status: number, body: string, requestId: string | null) {
  let error: { code?: unknown; type?: unknown; param?: unknown } = {};
  try {
    error = (JSON.parse(body.slice(0, 32000)) as { error?: typeof error }).error ?? {};
  } catch {
    /* unstructured provider error */
  }
  const code =
    typeof error.code === "string" && codes.has(error.code)
      ? error.code
      : typeof error.type === "string" && codes.has(error.type)
        ? error.type
        : "unclassified";
  const rawParam = error.param;
  const param =
    typeof rawParam === "string" &&
    rawParam.length <= 140 &&
    /^[a-z_.0-9]+$/.test(rawParam.replace(/\[(\d+)\]/g, ".$1")) &&
    rawParam
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean)
      .every((p) => /^\d+$/.test(p) || fields.has(p))
      ? rawParam
      : null;
  const request = requestId && /^req_[A-Za-z0-9_-]{1,100}$/.test(requestId) ? requestId : null;
  const message =
    status === 429
      ? "Calling is busy or over quota right now. Try later."
      : status === 403
        ? "The voice service denied this call."
        : `The call failed (code ${status}${param ? `; parameter ${param}` : ""}${code !== "unclassified" ? `; ${code}` : ""}). No automatic retry was made.`;
  return { status, code, param, requestId: request, message };
}
