/**
 * Decides what the background check-in does with a user text that never got a reply.
 *
 * - "reply": no reply attempt exists yet (or one is still running) — run the normal reply turn.
 * - "recover": the original reply attempt ended without delivering anything and never
 *   requested an image, so one fresh text-only recovery attempt is allowed.
 * - "skip": the message was already answered/processed, an image was requested (uncertain
 *   paid request — never retried), or the one recovery attempt was already used. The
 *   check-in must then continue to the normal "text first" decision instead of stopping,
 *   so one interrupted reply can never silence a character forever.
 */
export type OrphanReplyPlan = "reply" | "recover" | "skip";

export function orphanReplyPlan(args: {
  replyStatus: string | null;
  recoveryStatus: string | null;
  replyRequestedImage: boolean;
}): OrphanReplyPlan {
  if (args.replyStatus === null || args.replyStatus === "running") return "reply";
  if (args.replyStatus !== "failed") return "skip";
  if (args.replyRequestedImage) return "skip";
  if (args.recoveryStatus !== null) return "skip";
  return "recover";
}

export function recoveryReplyAnchor(userMessageId: string): string {
  return `reply-recovery:${userMessageId}`;
}
