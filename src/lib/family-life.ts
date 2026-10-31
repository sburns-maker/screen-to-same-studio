import { z } from "zod";
import type { CommitmentEvent } from "./relationship-commitments";
import { resolveCommitmentStatus, type CommitmentStatus } from "./relationship-commitments";

/**
 * Family-life domain rules for fictional adult characters.
 *
 * These pure functions never trigger an encounter, create a pregnancy,
 * send a notification or advance real-world time on their own. Persist
 * their input records server-side, scoped to userId + characterKey.
 */
export const householdActionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  characterKey: z.string().min(1),
  kind: z.enum(["move_in", "move_out", "share_home", "separate_home"]),
  proposedBy: z.enum(["user", "character"]),
  userResponse: z.enum(["pending", "accepted", "declined"]),
  characterResponse: z.enum(["pending", "accepted", "declined"]),
  occurredAt: z.string().datetime({ offset: true }),
  sourceId: z.string().min(1),
});
export type HouseholdAction = z.infer<typeof householdActionSchema>;
export type HouseholdStatus = "separate" | "shared";

export function resolveHouseholdStatus(actions: readonly HouseholdAction[]): HouseholdStatus {
  const accepted = actions.filter(a =>
    a.userResponse === "accepted" && a.characterResponse === "accepted"
  ).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  let status: HouseholdStatus = "separate";
  for (const a of accepted) {
    status = a.kind === "move_in" || a.kind === "share_home" ? "shared" : "separate";
  }
  return status;
}

export function mayProposeMarriage(events: readonly CommitmentEvent[]): boolean {
  // Proposals can be spontaneous, but cannot themselves change commitment state.
  return resolveCommitmentStatus(events) !== "married";
}

/**
 * Engagement and marriage use the existing canonical commitment ledger.
 * A proposed ceremony is not a wedding; characters and player must both accept.
 */
export function familyCommitmentStatus(events: readonly CommitmentEvent[]): CommitmentStatus {
  return resolveCommitmentStatus(events);
}
export function mayPlanWedding(events: readonly CommitmentEvent[]): boolean {
  return familyCommitmentStatus(events) === "engaged";
}
export function mayCompleteWedding(events: readonly CommitmentEvent[], options: {
  adultPlayer: boolean;
  adultCharacter: boolean;
  characterAgreed: boolean;
  playerAgreed: boolean;
  ceremonyOccurred: boolean;
}): boolean {
  return mayPlanWedding(events) && options.adultPlayer && options.adultCharacter &&
    options.characterAgreed && options.playerAgreed && options.ceremonyOccurred;
}
export function mayDiscussEngagement(events: readonly CommitmentEvent[]): boolean {
  const status = familyCommitmentStatus(events);
  return status !== "married" && status !== "engaged";
}

/**
 * A wedding plan is a proposal for a future ceremony, never evidence of
 * a completed marriage. Use existing calendar events for time and venue.
 */
export const weddingPlanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  characterKey: z.string().min(1),
  calendarEventId: z.string().uuid().nullable(),
  startsAt: z.string().datetime({ offset: true }),
  venue: z.string().min(1).max(200),
  userResponse: z.enum(["pending", "accepted", "declined"]),
  characterResponse: z.enum(["pending", "accepted", "declined"]),
  ceremonyCompletedAt: z.string().datetime({ offset: true }).nullable(),
});
export type WeddingPlan = z.infer<typeof weddingPlanSchema>;
export function weddingPlanStatus(plan: WeddingPlan, commitments: readonly CommitmentEvent[], at: Date) {
  if (!mayPlanWedding(commitments)) return "not_engaged" as const;
  if (plan.userResponse === "declined" || plan.characterResponse === "declined") return "declined" as const;
  if (plan.userResponse !== "accepted" || plan.characterResponse !== "accepted") return "awaiting_agreement" as const;
  if (!plan.ceremonyCompletedAt || at.getTime() < Date.parse(plan.startsAt)
    || at.getTime() < Date.parse(plan.ceremonyCompletedAt)) return "scheduled" as const;
  return "ceremony_recorded" as const;
}

export const pregnancyEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  characterKey: z.string().min(1),
  encounterId: z.string().min(1),
  /** The event is a fictional, mutually agreed pregnancy-capable encounter between adults. */
  adultEligible: z.literal(true),
  mutuallyAgreed: z.literal(true),
  pregnancyPossible: z.literal(true),
  /** Fixed probability sampled once by the server; never inferred from attraction. */
  probability: z.number().min(0).max(1),
  /** Persisted secret random value generated on the trusted server only. */
  randomRoll: z.number().min(0).max(1),
  occurredAt: z.string().datetime({ offset: true }),
  revealAt: z.string().datetime({ offset: true }),
  status: z.enum(["pending", "negative", "positive"]),
  /** Independent of outcome; the fictional character can share the information later. */
  disclosedAt: z.string().datetime({ offset: true }).nullable(),
});
export type PregnancyEvent = z.infer<typeof pregnancyEventSchema>;

export const FICTIONAL_REVEAL_HOURS = 12;
export function pregnancyRevealTime(occurredAt: string): string {
  const ms = Date.parse(occurredAt);
  if (!Number.isFinite(ms)) throw new Error("Invalid encounter timestamp");
  return new Date(ms + FICTIONAL_REVEAL_HOURS * 60 * 60 * 1000).toISOString();
}

/**
 * The caller must persist an event with a UNIQUE (user_id, character_key,
 * encounter_id) constraint before revealing it. Never reroll an existing event.
 * A 12-hour discovery is accelerated FICTIONAL world time, not medical advice.
 */
export function createPendingPregnancyEvent(input: {
  id: string; userId: string; characterKey: string; encounterId: string;
  adultEligible: boolean; mutuallyAgreed: boolean; pregnancyPossible: boolean;
  probability: number; randomRoll: number; occurredAt: string;
}): PregnancyEvent {
  if (!input.adultEligible || !input.mutuallyAgreed || !input.pregnancyPossible) {
    throw new Error("Ineligible encounter");
  }
  const parsed = pregnancyEventSchema.parse({
    ...input,
    adultEligible: true,
    mutuallyAgreed: true,
    pregnancyPossible: true,
    revealAt: pregnancyRevealTime(input.occurredAt),
    status: "pending",
    disclosedAt: null,
  });
  if (parsed.randomRoll === 1 && parsed.probability === 1) {
    // Probabilities are conventionally sampled in [0,1); handle sentinel 1 safely.
    return parsed;
  }
  return parsed;
}

export function resolvePregnancyEvent(event: PregnancyEvent, now: Date): PregnancyEvent {
  if (event.status !== "pending" || now.getTime() < Date.parse(event.revealAt)) return event;
  // Strict less-than means probability 0 never succeeds and 1 always succeeds
  // for an ordinary trusted server roll in [0, 1).
  return { ...event, status: event.randomRoll < event.probability ? "positive" : "negative" };
}

/** Never expose pregnancy outcomes before reveal, even when rolled at encounter time. */
export function visiblePregnancyOutcome(event: PregnancyEvent, now: Date): "pending" | "negative" | "positive" {
  if (now.getTime() < Date.parse(event.revealAt)) return "pending";
  return resolvePregnancyEvent(event, now).status;
}

export function disclosePregnancyEvent(event: PregnancyEvent, at: Date): PregnancyEvent {
  if (event.disclosedAt || visiblePregnancyOutcome(event, at) === "pending") return event;
  return { ...resolvePregnancyEvent(event, at), disclosedAt: at.toISOString() };
}
