/** Safe error facts only. Never retain provider bodies, messages, headers, prompts or keys. */
export type CharacterAIDiagnostic = {
  hint?:
    | "schema_rejected"
    | "unsupported_parameter"
    | "model_access"
    | "context_size"
    | "output_limit"
    | "authentication";
  model: string;
  statusCode: number | null;
  code:
    | "request_invalid"
    | "authentication"
    | "access_denied"
    | "billing"
    | "model_not_found"
    | "rate_limited"
    | "context_limit"
    | "timeout"
    | "invalid_response"
    | "output_limit"
    | "provider_unavailable";
  providerCode: string | null;
  param: string | null;
  requestId: string | null;
  retryable: boolean;
};
const providerCodes = new Set([
  "invalid_request_error",
  "invalid_json_schema",
  "invalid_value",
  "unsupported_value",
  "unsupported_parameter",
  "unknown_parameter",
  "context_length_exceeded",
  "model_not_found",
  "invalid_api_key",
  "authentication_error",
  "permission_denied",
  "insufficient_quota",
  "billing_hard_limit_reached",
  "rate_limit_exceeded",
  "server_error",
]);
const params = [
  "text.format.schema",
  "text.format.strict",
  "text.format.type",
  "text.format",
  "reasoning.effort",
  "max_output_tokens",
  "model",
  "input",
  "instructions",
  "temperature",
  "top_p",
  "store",
];
export function characterAIDiagnostic(
  model: string,
  statusCode: number | null,
  data: unknown,
  requestId: unknown,
  local?: "timeout" | "invalid_response" | "output_limit",
  responseBody?: unknown,
): CharacterAIDiagnostic {
  const unpack = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const container = value as Record<string, unknown>;
    return container["error"] &&
      typeof container["error"] === "object" &&
      !Array.isArray(container["error"])
      ? (container["error"] as Record<string, unknown>)
      : container;
  };
  let body: unknown;
  if (typeof responseBody === "string" && responseBody.length <= 32000) {
    try {
      body = JSON.parse(responseBody);
    } catch {
      /* Never display unstructured error text. */
    }
  }
  const candidates = [unpack(data), unpack(body)];
  const providerCode =
    candidates
      .flatMap((e) => [e["code"], e["type"]])
      .find((value): value is string => typeof value === "string" && providerCodes.has(value)) ??
    null;
  const message =
    candidates
      .map((e) => e["message"])
      .find((value): value is string => typeof value === "string") ?? "";
  const hint: CharacterAIDiagnostic["hint"] =
    /invalid schema|schema.*not supported|unsupported.*schema|additionalProperties|schema.*required/i.test(
      message,
    )
      ? "schema_rejected"
      : /unsupported parameter|unknown parameter|unsupported value/i.test(message)
        ? "unsupported_parameter"
        : /model.*(?:does not exist|not found|not supported|do not have access|no access)|do not have access.*model/i.test(
              message,
            )
          ? "model_access"
          : /context length|maximum context|too many tokens|input.*too long|input.*exceeds/i.test(
                message,
              )
            ? "context_size"
            : /max_output_tokens|maximum output|output.*limit/i.test(message)
              ? "output_limit"
              : /incorrect api key|invalid api key|authentication/i.test(message)
                ? "authentication"
                : undefined;
  const quotedParam = /(?:parameter|param|argument|field)\s*[:=]?\s*['"]([^'"]+)['"]/i.exec(
    message,
  )?.[1];
  const param =
    [...candidates.map((e) => e["param"]), quotedParam]
      .flatMap((value) =>
        typeof value === "string"
          ? params.filter(
              (p) => value === p || value.startsWith(p + ".") || value.startsWith(p + "["),
            )
          : [],
      )
      .at(0) ?? null;
  const code: CharacterAIDiagnostic["code"] =
    local ??
    (providerCode === "context_length_exceeded"
      ? "context_limit"
      : providerCode === "insufficient_quota" ||
          providerCode === "billing_hard_limit_reached" ||
          statusCode === 402
        ? "billing"
        : statusCode === 401
          ? "authentication"
          : statusCode === 403
            ? "access_denied"
            : statusCode === 404 || providerCode === "model_not_found"
              ? "model_not_found"
              : statusCode === 400 || statusCode === 422
                ? "request_invalid"
                : statusCode === 429
                  ? "rate_limited"
                  : "provider_unavailable");
  return {
    ...(hint ? { hint } : {}),
    model,
    statusCode,
    code,
    providerCode,
    param,
    requestId:
      typeof requestId === "string" && /^req_[A-Za-z0-9_-]{1,100}$/.test(requestId)
        ? requestId
        : null,
    retryable: ["timeout", "rate_limited", "provider_unavailable"].includes(code),
  };
}
export class CharacterAIError extends Error {
  constructor(
    message: string,
    readonly diagnostic: CharacterAIDiagnostic,
  ) {
    super(message);
    this.name = "CharacterAIError";
  }
}

/** Revalidate persisted diagnostics before displaying them; old records remain supported. */
export function readCharacterAIDiagnostic(value: unknown): CharacterAIDiagnostic | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const codes: CharacterAIDiagnostic["code"][] = [
    "request_invalid",
    "authentication",
    "access_denied",
    "billing",
    "model_not_found",
    "rate_limited",
    "context_limit",
    "timeout",
    "invalid_response",
    "output_limit",
    "provider_unavailable",
  ];
  if (
    typeof v["model"] !== "string" ||
    !/^gpt-[a-z0-9.-]{1,64}$/.test(v["model"]) ||
    !codes.includes(v["code"] as CharacterAIDiagnostic["code"]) ||
    !(
      v["statusCode"] === null ||
      (Number.isInteger(v["statusCode"]) &&
        Number(v["statusCode"]) >= 100 &&
        Number(v["statusCode"]) <= 599)
    )
  )
    return null;
  const code = v["code"] as CharacterAIDiagnostic["code"];
  const local =
    v["statusCode"] === null && ["timeout", "invalid_response", "output_limit"].includes(code)
      ? (code as "timeout" | "invalid_response" | "output_limit")
      : undefined;
  const safe = characterAIDiagnostic(
    v["model"],
    v["statusCode"] as number | null,
    { error: { code: v["providerCode"], param: v["param"] } },
    v["requestId"],
    local,
  );
  // Never let a persisted retryable flag or inconsistent category override a permanent HTTP error.
  const hint = v["hint"];
  if (
    typeof hint === "string" &&
    [
      "schema_rejected",
      "unsupported_parameter",
      "model_access",
      "context_size",
      "output_limit",
      "authentication",
    ].includes(hint)
  )
    safe.hint = hint as NonNullable<CharacterAIDiagnostic["hint"]>;
  return safe.code === code ? safe : null;
}
