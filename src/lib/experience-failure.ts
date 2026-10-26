import {
  CharacterAIError,
  readCharacterAIDiagnostic,
  type CharacterAIDiagnostic,
} from "./character-ai-error";
/** Allowlisted diagnostics only: no provider payloads, SQL, prompts or dialogue. */
export const EXPERIENCE_PHASES = [
  "context",
  "scheduling_sync",
  "scene_sync",
  "generation",
  "schedule_actions",
  "validation",
  "reconciliation",
  "commit",
] as const;
export type ExperiencePhase = (typeof EXPERIENCE_PHASES)[number];
const MESSAGES = {
  context_unavailable: "Character context could not be loaded.",
  calendar_unavailable: "The outing's calendar context could not be synchronized.",
  calendar_action_invalid:
    "A proposed calendar change could not be validated. No scheduling success is assumed.",
  scene_unavailable: "The current scene could not be synchronized.",
  model_unconfigured: "Character AI is not configured.",
  model_paused: "Character AI is paused.",
  model_context_limit: "The character request exceeded its context limit.",
  model_capacity_limit: "Character AI capacity limit reached; try later.",
  model_unavailable:
    "The character service failed without a specific cause recorded. Investigate the failure reference before retrying.",
  model_request_invalid:
    "The provider rejected the character request (400/422). Resolve the rejected request or configuration before retrying.",
  model_authentication:
    "Character AI authentication failed. Correct the server credentials before retrying.",
  model_not_found:
    "The configured character model could not be accessed. Check the model and project access before retrying.",
  model_rate_limited:
    "The provider rate-limited this request. Wait for capacity before an explicit retry; no automatic retry was made.",
  model_timeout:
    "The character request timed out. Recorded progress remains pending; no automatic retry was made.",
  model_invalid_response:
    "The character service returned invalid or incomplete structured output. Investigate before retrying.",
  model_output_limit:
    "The character response reached its output limit. Resolve the request or output configuration before retrying.",
  model_payment_required:
    "Character AI billing or quota access requires attention. Resolve it before retrying.",
  model_access_denied:
    "Character AI access was denied. Check project/model permissions before retrying.",
  empty_response: "The character did not return a usable scene response.",
  scene_contradiction:
    "The reply tried to return to an earlier location or contradicted the recorded scene; your current scene is preserved.",
  unsafe_outcome: "The generated ending could not be accepted under the outing's boundaries.",
  reconciliation_unavailable: "Recorded experience changes could not be reconciled.",
  autonomous_budget: "The autonomous generation budget is unavailable.",
  unknown_step:
    "This step failed without a recognized diagnostic. Use the failure reference to investigate before repeated retries.",
} as const;
export type ExperienceFailure = {
  version: 1;
  phase: ExperiencePhase;
  code: keyof typeof MESSAGES;
  diagnostic?: CharacterAIDiagnostic;
};
const REASONS: Record<string, ExperienceFailure["code"]> = {
  "Character context unavailable": "context_unavailable",
  "Character AI is not configured": "model_unconfigured",
  "Character AI is paused": "model_paused",
  "Character AI context limit reached": "model_context_limit",
  "Character AI capacity limit reached; try later": "model_capacity_limit",
  "Character AI is temporarily unavailable; please try again later": "model_unavailable",
  "Character AI access unavailable (402)": "model_payment_required",
  "Character AI access unavailable (403)": "model_access_denied",
  "Character did not produce a scene": "empty_response",
  "Scene continuity check failed": "scene_contradiction",
  "Unsafe off-screen outcome": "unsafe_outcome",
  "Experience reconciliation unavailable": "reconciliation_unavailable",
  "Autonomous budget unavailable": "autonomous_budget",
};
for (const reason of [
  "Calendar capability unavailable",
  "Experience calendar context unavailable",
  "Experience contribution unavailable",
  "Experience scheduling receipts unavailable",
  "Experience scheduling could not be persisted",
  "Calendar unavailable",
  "Current invitation evidence unavailable",
  "Experience invitation evidence unavailable",
  "Travel schedule unavailable",
])
  REASONS[reason] = "calendar_unavailable";
for (const reason of [
  "Unverified calendar success claim; confirm through the calendar receipt",
  "Calendar acceptance requires exact current user evidence",
  "Scheduling requires reviewed migration 0038",
  "Calendar action requires an owned conversation event",
  "Calendar follow-up requires an owned parent",
  "Calendar character unavailable",
])
  REASONS[reason] = "calendar_action_invalid";
for (const reason of [
  "Live scene storage unavailable",
  "Live scene receipts unavailable",
  "Live scene changed; retry from your recorded progress",
])
  REASONS[reason] = "scene_unavailable";
export function experienceFailure(error: unknown, phase: ExperiencePhase): ExperienceFailure {
  if (error instanceof CharacterAIError) {
    const codes: Record<CharacterAIDiagnostic["code"], ExperienceFailure["code"]> = {
      request_invalid: "model_request_invalid",
      authentication: "model_authentication",
      access_denied: "model_access_denied",
      billing: "model_payment_required",
      model_not_found: "model_not_found",
      rate_limited: "model_rate_limited",
      context_limit: "model_context_limit",
      timeout: "model_timeout",
      invalid_response: "model_invalid_response",
      output_limit: "model_output_limit",
      provider_unavailable: "model_unavailable",
    };
    return { version: 1, phase, code: codes[error.diagnostic.code], diagnostic: error.diagnostic };
  }
  return {
    version: 1,
    phase,
    code:
      error instanceof Error && Object.hasOwn(REASONS, error.message)
        ? REASONS[error.message]!
        : "unknown_step",
  };
}
export function readExperienceFailure(value: unknown): ExperienceFailure | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return v["version"] === 1 &&
    EXPERIENCE_PHASES.includes(v["phase"] as ExperiencePhase) &&
    typeof v["code"] === "string" &&
    Object.hasOwn(MESSAGES, v["code"])
    ? {
        version: 1,
        phase: v["phase"] as ExperiencePhase,
        code: v["code"] as ExperienceFailure["code"],
        ...(readCharacterAIDiagnostic(v["diagnostic"])
          ? { diagnostic: readCharacterAIDiagnostic(v["diagnostic"])! }
          : {}),
      }
    : null;
}
export function experienceFailureMessage(failure: ExperienceFailure) {
  const status =
    failure.diagnostic?.statusCode ??
    (failure.code === "model_payment_required"
      ? 402
      : failure.code === "model_access_denied"
        ? 403
        : null);
  const message =
    failure.code === "model_unavailable" && failure.diagnostic
      ? "The character provider is unavailable. No automatic retry was made."
      : MESSAGES[failure.code];
  return `${message}${status ? ` Provider HTTP ${status}.` : ""} Your recorded progress is safe. Step: ${failure.phase.replaceAll("_", " ")}.`;
}
