import { describe, expect, it } from "vitest";
import {
  createPendingPregnancyEvent, disclosePregnancyEvent, pregnancyRevealTime,
  resolveHouseholdStatus, resolvePregnancyEvent, visiblePregnancyOutcome
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
    expect(resolveHouseholdStatus([{...base, userResponse: "pending", characterResponse: "accepted"}])).toBe("separate");
    expect(resolveHouseholdStatus([{...base, userResponse: "accepted", characterResponse: "accepted"}])).toBe("shared");
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
