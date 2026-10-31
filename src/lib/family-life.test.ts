import { describe, expect, it } from "vitest";
import {
  createPendingPregnancyEvent, disclosePregnancyEvent, pregnancyRevealTime,
  resolveHouseholdStatus, resolvePregnancyEvent, visiblePregnancyOutcome,
  familyCommitmentStatus, mayPlanWedding, mayCompleteWedding, mayDiscussEngagement, weddingPlanSchema, weddingPlanStatus
} from "./family-life";

const uuid = "00000000-0000-4000-8000-000000000001";
const start = "2026-10-30T12:00:00.000Z";
function pregnancy(roll: number, probability: number) {
  return createPendingPregnancyEvent({
    id: uuid, userId: uuid, characterKey: "kendra", encounterId: "enc-1",
    adultEligible: true, mutuallyAgreed: true, pregnancyPossible: true,
    probability, randomRoll: roll, occurredAt: start,
  });
}
describe("family life domain", () => {
  it("requires explicit agreement before sharing a home", () => {
    const base = { id: uuid, userId: uuid, characterKey: "tess", kind: "move_in" as const,
      proposedBy: "character" as const, occurredAt: start, sourceId: "msg-1" };
    expect(resolveHouseholdStatus([{...base, userResponse: "pending" as const, characterResponse: "accepted" as const}])).toBe("separate");
    expect(resolveHouseholdStatus([{...base, userResponse: "accepted" as const, characterResponse: "accepted" as const}])).toBe("shared");
  });
  it("does not accept an ineligible encounter", () => {
    expect(() => createPendingPregnancyEvent({
      id: uuid, userId: uuid, characterKey: "kendra", encounterId: "enc-1",
      adultEligible: false, mutuallyAgreed: true, pregnancyPossible: true,
      probability: 0.2, randomRoll: 0.1, occurredAt: start,
    })).toThrow("Ineligible encounter");
  });
  it("reveals only at 12 real hours, without rerolling", () => {
    const event = pregnancy(0.1, 0.2);
    expect(pregnancyRevealTime(start)).toBe("2026-10-31T00:00:00.000Z");
    expect(visiblePregnancyOutcome(event, new Date("2026-10-30T23:59:59Z"))).toBe("pending");
    const resolved = resolvePregnancyEvent(event, new Date("2026-10-31T00:00:00Z"));
    expect(resolved.status).toBe("positive");
    expect(resolvePregnancyEvent(resolved, new Date("2026-11-02T00:00:00Z"))).toEqual(resolved);
  });
  it("probability boundaries behave correctly", () => {
    const after = new Date("2026-10-31T00:00:00Z");
    expect(resolvePregnancyEvent(pregnancy(0, 0), after).status).toBe("negative");
    expect(resolvePregnancyEvent(pregnancy(0.999, 1), after).status).toBe("positive");
  });
  it("disclosure is independent and idempotent", () => {
    const event = pregnancy(0.9, 0.2);
    const earlier = disclosePregnancyEvent(event, new Date("2026-10-30T20:00:00Z"));
    expect(earlier.disclosedAt).toBe(null);
    const at = new Date("2026-10-31T05:00:00Z");
    const disclosed = disclosePregnancyEvent(event, at);
    expect(disclosed.status).toBe("negative");
    expect(disclosePregnancyEvent(disclosed, new Date("2026-11-03T00:00:00Z"))).toEqual(disclosed);
  });
});


describe("engagement and wedding integration", () => {
  const base = {
    id: uuid, userId: uuid, characterKey: "tess", kind: "engagement" as const,
    proposedBy: "user" as const, status: "pending" as const,
    userResponse: "accepted" as const, characterResponse: "pending" as const,
    occurredAt: start, sourceId: "message-1", sourceType: "message" as const, note: null,
  };
  it("does not turn a proposal or a character joke into engagement", () => {
    expect(familyCommitmentStatus([base])).toBe("none");
    expect(mayPlanWedding([base])).toBe(false);
  });
  it("permits wedding planning only after mutual engagement", () => {
    const agreed = {...base,status:"accepted" as const,characterResponse:"accepted" as const};
    expect(familyCommitmentStatus([agreed])).toBe("engaged");
    expect(mayPlanWedding([agreed])).toBe(true);
    expect(mayDiscussEngagement([agreed])).toBe(false);
    expect(mayCompleteWedding([agreed], {
      adultPlayer:true,adultCharacter:true,playerAgreed:true,
      characterAgreed:true,ceremonyOccurred:false,
    })).toBe(false);
    expect(mayCompleteWedding([agreed], {
      adultPlayer:true,adultCharacter:true,playerAgreed:true,
      characterAgreed:true,ceremonyOccurred:true,
    })).toBe(true);
    expect(mayCompleteWedding([agreed], {
      adultPlayer:true,adultCharacter:true,playerAgreed:true,
      characterAgreed:false,ceremonyOccurred:true,
    })).toBe(false);
  });
});

describe("wedding plans are not automatic marriages", () => {
  const acceptedEngagement = {
    id:uuid,userId:uuid,characterKey:"tess",kind:"engagement" as const,
    proposedBy:"user" as const,status:"accepted" as const,
    userResponse:"accepted" as const,characterResponse:"accepted" as const,
    occurredAt:start,sourceId:"msg-1",sourceType:"message" as const,note:null,
  };
  const base = {
    id:uuid,userId:uuid,characterKey:"tess",calendarEventId:null,
    startsAt:"2026-11-01T18:00:00Z",venue:"Public garden",
    userResponse:"accepted" as const,characterResponse:"pending" as const,
    ceremonyCompletedAt:null,
  };
  it("requires engagement and both decisions before scheduling", () => {
    const plan = weddingPlanSchema.parse(base);
    expect(weddingPlanStatus(plan, [], new Date("2026-11-02T12:00:00Z"))).toBe("not_engaged");
    expect(weddingPlanStatus(plan, [acceptedEngagement], new Date("2026-11-02T12:00:00Z"))).toBe("awaiting_agreement");
  });
  it("remains scheduled until the ceremony actually happens", () => {
    const plan = weddingPlanSchema.parse({...base,characterResponse:"accepted",ceremonyCompletedAt:null});
    expect(weddingPlanStatus(plan,[acceptedEngagement],new Date("2026-11-02T12:00:00Z"))).toBe("scheduled");
    const completed=weddingPlanSchema.parse({...plan,ceremonyCompletedAt:"2026-11-01T19:00:00Z"});
    expect(weddingPlanStatus(completed,[acceptedEngagement],new Date("2026-11-02T12:00:00Z"))).toBe("ceremony_recorded");
  });
});
