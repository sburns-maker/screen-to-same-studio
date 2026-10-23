/**
 * Phase 6 experience lifecycle. Pure decisions used by both user actions and
 * future DB-backed atomic claim/finalization procedures.
 * These functions are not a substitute for transactional database locking.
 */
export type ExperienceState =
  "scheduled" | "interactive" | "paused" | "auto_running" | "completed" | "cancelled";
export type ExperienceMode = "interactive" | "automatic";
export type Experience = {
  id: string;
  planId: string;
  state: ExperienceState;
  startAt: string;
  claimDeadline: string;
  claimedAt: string | null;
  mode: ExperienceMode | null;
  outcomeId: string | null;
  revision: number;
};
export type ExperienceAction = "claim" | "pause" | "resume" | "auto_claim" | "finish" | "cancel";
export function canTransition(e: Experience, action: ExperienceAction, now: Date): boolean {
  const t = now.getTime();
  const deadline = Date.parse(e.claimDeadline);
  const start = Date.parse(e.startAt);
  if (![deadline, start, t].every(Number.isFinite)) return false;
  switch (action) {
    case "claim":
      return e.state === "scheduled" && t >= start && t < deadline;
    case "auto_claim":
      return e.state === "scheduled" && t >= deadline && !e.claimedAt;
    case "pause":
      return e.state === "interactive";
    case "resume":
      return e.state === "paused";
    case "finish":
      return ["interactive", "paused", "auto_running"].includes(e.state) && !e.outcomeId;
    case "cancel":
      return e.state === "scheduled";
  }
}
export function nextExperience(
  e: Experience,
  action: ExperienceAction,
  now: Date,
  outcomeId?: string,
): Experience {
  if (!canTransition(e, action, now)) throw new Error("Experience transition is not permitted");
  if (action === "finish" && !outcomeId) throw new Error("A unique durable outcome is required");
  const state: Record<ExperienceAction, ExperienceState> = {
    claim: "interactive",
    auto_claim: "auto_running",
    pause: "paused",
    resume: "interactive",
    finish: "completed",
    cancel: "cancelled",
  };
  return {
    ...e,
    state: state[action],
    revision: e.revision + 1,
    ...(action === "claim" || action === "auto_claim"
      ? {
          claimedAt: now.toISOString(),
          mode: action === "claim" ? ("interactive" as const) : ("automatic" as const),
        }
      : {}),
    ...(action === "finish" ? { outcomeId: outcomeId! } : {}),
  };
}
export type Moment = {
  kind: "conversation" | "activity" | "affection" | "departure";
  summary: string;
  confirmed: boolean;
};
export function eligibleForAutomaticRomance(moments: Moment[]): boolean {
  // Auto-simulation can reflect already established affection, never manufacture
  // a first intimate milestone or substitute ambiguity for mutual consent.
  return moments.some((m) => m.kind === "affection" && m.confirmed);
}
