import { describe, expect, it } from "vitest";
import { evaluationFromDetail } from "@/lib/photo-delivery.server";

const detail = {
  userId: "u1",
  conversationId: "c1",
  plan: {
    rows: [{ id: "m1", body: "hey" }],
    relationshipHistory: {
      before: { trust: 30 }, after: { trust: 31 }, delta: { trust: 1 },
      previousStage: "acquaintance", stage: "acquaintance", tone: "warm", tags: ["banter"],
      sourceKind: "conversation", contextSummary: "user said hi",
      perspective: "  I liked that he remembered the clinic thing.  ",
      evaluatedAt: "2026-10-24T11:00:00.000Z",
    },
  },
};

describe("relationship evaluation from delivered turn", () => {
  it("records the character's generated perspective, not null", () => {
    const row = evaluationFromDetail(detail, 1)!;
    expect(row.character_perspective).toBe("I liked that he remembered the clinic thing.");
    expect(row.source_kind).toBe("conversation");
    expect(row.message_id).toBe("m1");
  });

  it("records nothing when no message was delivered", () => {
    expect(evaluationFromDetail(detail, 0)).toBeNull();
  });

  it("records nothing when the plan was already cleared (the old bug)", () => {
    expect(evaluationFromDetail({ userId: "u1", conversationId: "c1" }, 1)).toBeNull();
  });

  it("stores null perspective rather than inventing one", () => {
    const d = { ...detail, plan: { ...detail.plan, relationshipHistory: { ...detail.plan.relationshipHistory, perspective: null } } };
    expect(evaluationFromDetail(d, 1)!.character_perspective).toBeNull();
  });
});
