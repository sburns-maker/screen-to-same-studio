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
export const COMMITMENT_ACTION_RULES = `RELATIONSHIP DECISIONS: commitment_action defaults to {action:null,kind:null,quote:null,proposalId:null}. The participating character may independently propose exclusivity or partnership only when sincerely desired and her recent established relationship context supports it; never as a score reward or scheduled obligation. Only put action=propose when their own current visible words make a clear, specific request for a mutually chosen relationship commitment. Do not mistake romantic language, jokes, kisses or a hypothetical future for a proposal. quote must be an exact contiguous passage from her message. If an authoritative pending player proposal is provided, including engagement or marriage, you may explicitly accept or decline in your own visible words, using that exact proposal ID and the same commitment kind; you can also defer without an action. An engagement is an agreement to marry in the future, NOT proof a wedding or legal marriage occurred. A spontaneous, same-day proposal may be answered sincerely without a mandatory relationship-score threshold or arbitrary number of dates, but never automatically, for money, to satisfy a plot goal, or under pressure. The character decides for herself. You must express acceptance or refusal unmistakably in your current message, and quote the exact words. Without a pending proposal never emit accept/decline. Never imply the player has already accepted. Housing, marriage, separation and family changes have separate approval workflows and may never be inferred from this proposal. Never manufacture consent.`;

export const RELATIONSHIP_CAST = ["tess", "maya", "riley", "claire", "jordan", "sienna", "kendra"] as const;
export function supportsRelationshipCommitment(key: string): boolean {
  return (RELATIONSHIP_CAST as readonly string[]).includes(key);
}
// Retained name for compatibility; isolation applies to every participating character.
export const RELATIONSHIP_PILOT = {
  crossCharacterDisclosure: false,
  propagateCommitmentScores: false,
} as const;

export function relationshipDiscussionDraft(kind: CommitmentKind): string {
  if (kind === "exclusive") return "I'd like us to date exclusively. How do you feel about that?";
  if (kind === "partnership") return "I'd like us to be in a committed relationship. How do you feel about that?";
  if (kind === "engagement") return "I want to marry you someday. Will you marry me?";
  if (kind === "marriage") return "I'd like to talk about a wedding we'd both genuinely want, and what marriage would mean for us. What do you think?";
  if (kind === "separation") return "I think we should talk about our relationship and what we both want next.";
  if (kind === "divorce") return "I think we should talk about ending our marriage and how to handle the practical decisions together.";
  return "I'd like to talk about our relationship. How are you feeling?";
}
export function relationshipDraftKey(conversationId: string): string {
  return "relationship-discussion-draft:" + conversationId;
}
export function readRelationshipDraft(raw: string, character: string): string | null {
  try {
    const draft = z.object({ character: z.string(), kind: z.enum(commitmentKinds), eventId: z.string().uuid() }).parse(JSON.parse(raw));
    return supportsRelationshipCommitment(character) && draft.character === character
      ? relationshipDiscussionDraft(draft.kind) : null;
  } catch { return null; }
}

export function canShareCommitmentWithCharacter(source: string, recipient: string): boolean {
  return source === recipient; // Never share another character’s proposal or decision.
}

/** Canonical facts for the character's own private prompt only. */
export function commitmentContextForCharacter(
  sourceCharacter: string,
  receivingCharacter: string,
  events: readonly CommitmentEvent[],
): string[] {
  if (!canShareCommitmentWithCharacter(sourceCharacter, receivingCharacter)) return [];
  const own = events.filter((event) => event.characterKey === sourceCharacter);
  const status = resolveCommitmentStatus(own);
  const pending = own.find((event) => event.status === "pending");
  return [
    `CANONICAL PRIVATE COMMITMENT WITH PLAYER: ${commitmentLabel(status)}. Commitment requires explicit mutual agreement, not high attraction, flirting, kissing or a shared address.`,
    ...(status === "engaged" ? ["THE ENGAGEMENT IS ALREADY MUTUALLY ACCEPTED AND RECORDED. Do not spontaneously accept again, repeatedly assure the player you still want to marry them, or re-stage the proposal in an unrelated reply or scene. You may naturally use fiancé/fiancée and discuss real future plans when relevant. If directly asked about the engagement, answer sincerely without treating it as a fresh proposal."] : []),
    ...(pending ? [`PENDING PRIVATE RELATIONSHIP DECISION: ${JSON.stringify({
      id: pending.id,
      kind: pending.kind,
      proposedBy: pending.proposedBy,
      userResponse: pending.userResponse,
      characterResponse: pending.characterResponse,
    })}. Do not claim a pending proposal has been accepted.`] : []),
  ];
}
