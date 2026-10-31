import { describe, expect, it } from "vitest";
import { housingActionsSchema, housingInputSchema, HOUSING_ACTION_RULES } from "./housing";

describe("roommate proposal contracts", () => {
  it("accepts a discussion-stage player proposal without marking a completed move", () => {
    const request = housingInputSchema.parse({
      command: "propose_move",
      payload: {
        place: "player-home",
        movers: ["user", "tess"],
        startsAt: null,
        kind: "move",
        purpose: "roommates",
      },
    });
    expect(request.command).toBe("propose_move");
    expect(request.payload.movers).toContain("tess");
  });

  it("requires explicit proposal ID and version to respond", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const accept = housingInputSchema.parse({
      command: "respond",
      payload: { proposalId: id, version: 0, accept: true },
    });
    expect(accept.command).toBe("respond");
    expect(() => housingInputSchema.parse({
      command: "respond",
      payload: { version: 0, accept: true },
    })).toThrow();
  });

  it("does not equate an in-chat yes with a database move or confirmed commitment", () => {
    expect(HOUSING_ACTION_RULES).toContain("A proposal is not a completed move");
    expect(HOUSING_ACTION_RULES).toContain("all necessary consent");
    expect(HOUSING_ACTION_RULES).toContain("Without a pending proposal");
  });

  it("keeps fictional character actions distinct from unapproved player decisions", () => {
    const action = {
      action: "propose_move",
      quote: "I think we could try being roommates if the bills make sense.",
      place: "player-home",
      movers: ["tess", "user"],
      purpose: "roommates",
      startsAt: null,
      endsAt: null,
      kind: "move",
      label: null,
      community: null,
      housingType: null,
      arrangement: null,
      proposalId: null,
      version: null,
      accept: null,
      viewer: null,
      permission: null,
      goal: null,
    };
    expect(housingActionsSchema.parse([action])).toHaveLength(1);
  });
});
