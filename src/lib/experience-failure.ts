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
  model_unavailable: "The character response service is temporarily unavailable.",
  model_payment_required: "Character AI access unavailable (402); billing requires attention.",
  model_access_denied: "Character AI access unavailable (403); access requires attention.",
  empty_response: "The character did not return a usable scene response.",
  scene_contradiction:
    "The reply tried to return to an earlier location or contradicted the recorded scene; your current scene is preserved.",
  unsafe_outcome: "The generated ending could not be accepted under the outing's boundaries.",
  reconciliation_unavailable: "Recorded experience changes could not be reconciled.",
  autonomous_budget: "The autonomous generation budget is unavailable.",
  unknown_step:
    "This step failed without a recognized diagnostic. Use the failure reference to investigate before repeated retries.",
} as const;
export type ExperienceFailure = { version: 1; phase: ExperiencePhase; code: keyof typeof MESSAGES };
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
      }
    : null;
}
export function experienceFailureMessage(failure: ExperienceFailure) {
  return `${MESSAGES[failure.code]} Your recorded progress is safe. Step: ${failure.phase.replaceAll("_", " ")}.`;
}
