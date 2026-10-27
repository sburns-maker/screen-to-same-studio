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
