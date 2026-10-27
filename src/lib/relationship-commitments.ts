import { z } from "zod";

/**
 * Commitment is an explicit, mutually acknowledged world event—not an attraction score.
 * The player and the participating adult character each supply their own decision.
 * This module is pure, so retries and timeline rendering are deterministic.
 */
export const commitmentKinds = [
  "exclusive", "partnership", "engagement", "marriage", "separation", "divorce",
] as const;
export type CommitmentKind = (typeof commitmentKinds)[number];

export const commitmentEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  characterKey: z.string().min(1).max(80),
  kind: z.enum(commitmentKinds),
  proposedBy: z.enum(["user", "character"]),
  status: z.enum(["pending", "accepted", "declined", "cancelled"]),
  userResponse: z.enum(["accepted", "declined", "pending"]),
  characterResponse: z.enum(["accepted", "declined", "pending"]),
  occurredAt: z.string().datetime({ offset: true }),
  sourceId: z.string().min(1).max(150),
  sourceType: z.enum(["message", "call", "outing", "manual"]),
  note: z.string().max(500).nullable(),
});
export type CommitmentEvent = z.infer<typeof commitmentEventSchema>;
export type CommitmentStatus = "none" | "exclusive" | "partnered" | "engaged" | "married" | "separated" | "divorced";

export function resolveCommitmentStatus(events: readonly CommitmentEvent[]): CommitmentStatus {
  const accepted = events.filter((event) =>
    event.status === "accepted" &&
    event.userResponse === "accepted" &&
    event.characterResponse === "accepted",
  ).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  let status: CommitmentStatus = "none";
  for (const event of accepted) {
    if (event.kind === "exclusive") status = "exclusive";
    if (event.kind === "partnership") status = "partnered";
    if (event.kind === "engagement") status = "engaged";
    if (event.kind === "marriage") status = "married";
    if (event.kind === "separation") status = "separated";
    if (event.kind === "divorce") status = "divorced";
  }
  return status;
}

export function canFinalizeCommitment(event: CommitmentEvent): boolean {
  return event.userResponse === "accepted" && event.characterResponse === "accepted"
    && event.status !== "declined" && event.status !== "cancelled";
}

export function commitmentLabel(status: CommitmentStatus): string {
  return ({
    none: "Getting to know each other",
    exclusive: "Exclusive",
    partnered: "In a relationship",
    engaged: "Engaged",
    married: "Married",
    separated: "Separated",
    divorced: "Divorced",
  } as const)[status];
}

/** Structured fictional character intent, attached only to a committed visible message. */
export const commitmentActionSchema = z.object({
  action: z.enum(["propose", "accept", "decline"]).nullable(),
  kind: z.enum(["exclusive", "partnership", "engagement", "marriage", "separation", "divorce"]).nullable(),
  quote: z.string().max(500).nullable(),
  proposalId: z.string().uuid().nullable(),
});
export type CommitmentAction = z.infer<typeof commitmentActionSchema>;
export const COMMITMENT_ACTION_RULES = `RELATIONSHIP DECISIONS: commitment_action defaults to {action:null,kind:null,quote:null,proposalId:null}. Tess may independently propose exclusivity or partnership only when sincerely desired and her recent established relationship context supports it; never as a score reward or scheduled obligation. Only put action=propose when her own current visible words make a clear, specific request for a mutually chosen relationship commitment. Do not mistake romantic language, jokes, kisses or a hypothetical future for a proposal. quote must be an exact contiguous passage from her message. If an authoritative pending player proposal is provided, you may explicitly accept or decline in your own visible words, using that exact proposal ID and the same commitment kind; you can also defer without an action. You must express acceptance or refusal unmistakably in your current message, and quote the exact words. Without a pending proposal never emit accept/decline. Never imply the player has already accepted. Housing, marriage, separation and family changes have separate approval workflows and may never be inferred from this proposal. Never manufacture consent.`;
