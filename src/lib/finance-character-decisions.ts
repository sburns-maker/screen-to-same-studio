import { z } from "zod";

/** Only the character's exact, visible statement can change a pending choice. */
export const financeDecisionSchema=z.object({
  action:z.enum(["ack_agreement","request_revision","accept_offer","decline_offer"]).nullable(),
  assetKey:z.string().max(90).nullable(),
  offerId:z.string().uuid().nullable(),
  quote:z.string().max(500).nullable(),
});
export type FinanceDecision=z.infer<typeof financeDecisionSchema>;

export const FINANCE_DECISION_RULES=`FINANCIAL CONSENT ACTIONS:
finance_decision must always be present with {action:null,assetKey:null,offerId:null,quote:null} unless your own current visible words clearly and intentionally decide a supplied pending written management agreement or OPTIONAL equity offer.
An acknowledged written agreement is separate from accepting ownership. For a delivered management document, use ack_agreement with its exact asset key ONLY if you explicitly say you have actually reviewed and agree with those boundaries; use request_revision if your reply unambiguously requests changes. Merely asking to see the document is NOT acknowledgment. Never invent manager appointments or claim a legal signature.
For an explicit pending offer ID, use accept_offer or decline_offer ONLY when your visible words clearly say yes or no to the exact 50% offer. If you need more time, want advice, or have questions, action must be null. A yes to marriage, comfort with employment, or affection is NOT accepting equity. Do not answer on behalf of the player or accept because the player wants you to.
For any nonnull action, assetKey and quote are required; quote must be an exact contiguous 6+ character segment from YOUR visible reply. For equity actions, offerId must exactly match the supplied pending offer ID. A saved acceptance never changes real businesses or legal ownership; a second player confirmation will finalize purely in-game shares.
Do not keep bringing up settled policy concerns after you have explicitly acknowledged the written boundaries, unless specific new issues arise.`;
