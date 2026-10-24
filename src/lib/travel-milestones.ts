import type { TessState } from "./tess-logic";

/** An aspirational destination is NOT a booking, a promise or a completed trip. */
export type TravelPhase = "dream" | "discussing" | "planning" | "confirmed" | "traveling" | "completed" | "cancelled";
export type TravelGoal = {
  character: "tess";
  destination: "Iceland";
  season: "winter";
  origin: "character-stated dream";
  phase: TravelPhase;
  proposedStart: string | null;
  proposedEnd: string | null;
  bothAgreed: boolean;
};
export const TESS_ICELAND_GOAL: TravelGoal = {
  character: "tess",
  destination: "Iceland",
  season: "winter",
  origin: "character-stated dream",
  phase: "dream",
  proposedStart: null,
  proposedEnd: null,
  bothAgreed: false,
};
/** A steady relationship makes travel worth discussing; numbers alone cannot book it. */
export function canDiscussCouplesTravel(s: TessState): boolean {
  return s.trust >= 65 && s.comfort >= 70 && s.emotional_intimacy >= 50 &&
    s.romantic_intent >= 45 && s.perceived_pressure < 25;
}
export function advanceTravelGoal(goal: TravelGoal, next: TravelPhase, opts: {
  mutualAgreement?: boolean;
  start?: string | null;
  end?: string | null;
  started?: boolean;
  finished?: boolean;
} = {}): TravelGoal {
  if (next === "cancelled") return { ...goal, phase: "cancelled" };
  const order: TravelPhase[] = ["dream", "discussing", "planning", "confirmed", "traveling", "completed"];
  if (order.indexOf(next) !== order.indexOf(goal.phase) + 1) throw new Error("Travel phase must advance in order");
  if (next === "confirmed" && (!opts.mutualAgreement || !opts.start || !opts.end || opts.start > opts.end))
    throw new Error("A trip needs two-sided agreement and valid travel dates");
  if (next === "traveling" && !opts.started) throw new Error("Trip must actually begin within the simulation");
  if (next === "completed" && !opts.finished) throw new Error("Trip completion requires recorded follow-through");
  return { ...goal, phase: next, bothAgreed: goal.bothAgreed || !!opts.mutualAgreement,
    proposedStart: opts.start ?? goal.proposedStart, proposedEnd: opts.end ?? goal.proposedEnd };
}
/** Story beats, not claimed reservations or automatic character consent. */
export const ICELAND_WINTER_IDEAS = [
  "Arriving in Reykjavík and finding a cozy place to eat",
  "Walking the old harbor together in winter layers",
  "Visiting geothermal baths in cold weather",
  "A weather-dependent Northern Lights outing",
  "A day trip to scenic waterfalls if roads and weather permit",
  "A quiet final morning before flying home",
] as const;
