import { describe, expect, it } from "vitest";
import { photoOpportunity } from "./photo-opportunities";

const characters = ["tess", "riley", "claire", "kendra", "maya", "sienna"] as const;
const now = new Date("2026-10-30T19:00:00.000Z");
const state = {
  comfort: 80, trust: 70, romantic_attraction: 60, physical_attraction: 50,
  curiosity: 70, emotional_intimacy: 55, perceived_pressure: 0,
  irritation: 0, respect: 80, playfulness: 75,
  relationship_momentum: 70, romantic_intent: 45,
};
const schedule = { activity: "relaxing", availability: "free" as const, detail: "at home making dinner" };
describe("autonomous opportunity eligibility and declining", () => {
  for (const character of characters) {
    it(`${character} evaluates ordinary grounded photo context without requiring romance`, () => {
      const opportunity = photoOpportunity({
        character, conversationId: "photo-test-" + character, now, schedule, state,
        frequency: "normal", eligibleTypes: ["object", "casual_selfie"], lastPhotoAt: null,
        ownSinceLastPhoto: 0, gapHours: 2, context: "Dinner is ready at home",
      });
      expect(opportunity.eligible).toBe(true);
      expect(opportunity.hint).toContain("ordinary selfie or snapshot");
      expect(typeof opportunity.selected).toBe("boolean");
    });
  }
  it("does not bypass a character sleeping", () => {
    const result = photoOpportunity({
      character: "riley", conversationId: "sleep-test", now,
      schedule: { activity: "sleeping", availability: "asleep", detail: "asleep at home" },
      state, frequency: "normal", eligibleTypes: ["object"],
      lastPhotoAt: null, ownSinceLastPhoto: 0, gapHours: 3, context: "a dog asleep",
    });
    expect(result.eligible).toBe(false);
    expect(result.selected).toBe(false);
  });
  it("repeated worker polls keep their choice stable in one hour", () => {
    const args = {
      character: "claire" as const, conversationId: "stable", now, schedule, state,
      frequency: "normal" as const, eligibleTypes: ["object"],
      lastPhotoAt: null, ownSinceLastPhoto: 0, gapHours: 2, context: "library book display",
    };
    expect(photoOpportunity(args)).toEqual(photoOpportunity(args));
  });
});
