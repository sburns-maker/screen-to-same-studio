import { describe, expect, it } from "vitest";
import { orphanReplyPlan, recoveryReplyAnchor } from "@/lib/orphan-reply";

describe("orphan reply recovery", () => {
  it("runs the normal reply when no attempt exists yet", () => {
    expect(orphanReplyPlan({ replyStatus: null, recoveryStatus: null, replyRequestedImage: false })).toBe("reply");
  });

  it("allows one text-only recovery after an interrupted reply that never requested an image", () => {
    expect(orphanReplyPlan({ replyStatus: "failed", recoveryStatus: null, replyRequestedImage: false })).toBe("recover");
  });

  it("never retries a reply that requested an image", () => {
    expect(orphanReplyPlan({ replyStatus: "failed", recoveryStatus: null, replyRequestedImage: true })).toBe("skip");
  });

  it("allows only one recovery attempt per user message", () => {
    expect(orphanReplyPlan({ replyStatus: "failed", recoveryStatus: "failed", replyRequestedImage: false })).toBe("skip");
    expect(orphanReplyPlan({ replyStatus: "failed", recoveryStatus: "ok", replyRequestedImage: false })).toBe("skip");
  });

  it("skips an already delivered reply", () => {
    expect(orphanReplyPlan({ replyStatus: "ok", recoveryStatus: null, replyRequestedImage: false })).toBe("skip");
  });

  it("uses a distinct anchor so the original failed action is never reused", () => {
    expect(recoveryReplyAnchor("abc")).toBe("reply-recovery:abc");
  });
});
