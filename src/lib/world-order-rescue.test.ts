import { describe, expect, it } from "vitest";
import { RESCUE_BEATS, rescueAdvancePhase, rescueChoice, rescueOutcome, type RescueRecord } from "./world-order-rescue";

describe("World Order concert rescue", () => {
  it("begins before the attack is resolved, with three playable beats", () => {
    expect(RESCUE_BEATS).toHaveLength(3);
    expect(RESCUE_BEATS[0]!.scene).toContain("Security hasn't reacted");
    expect(RESCUE_BEATS[0]!.choices).toHaveLength(3);
  });
  it("advances one scene beat at a time", () => {
    expect(rescueAdvancePhase(0)).toBe(1);
    expect(rescueAdvancePhase(1)).toBe(2);
    expect(rescueAdvancePhase(2)).toBe(3);
    expect(rescueAdvancePhase(3)).toBe(3);
  });
  it("requires choices appropriate to the current scene", () => {
    expect(rescueChoice(0, "warn")?.phase).toBe(0);
    expect(rescueChoice(0, "shield")).toBeNull();
    expect(rescueChoice(2, "press")?.phase).toBe(2);
  });
  it("prevents a hero reward before three actual player actions", () => {
    const one = rescueChoice(0, "warn")!;
    expect(() => rescueOutcome([one])).toThrow();
    expect(() => rescueOutcome([one, one, one])).toThrow();
  });
  it("honors the player's distinct approach in the outcome and follow-up DM", () => {
    const first = rescueChoice(0, "warn")!;
    const second = rescueChoice(1, "shield")!;
    const care = rescueOutcome([first, second, rescueChoice(2, "stay")!] as RescueRecord[]);
    const publicity = rescueOutcome([first, second, rescueChoice(2, "press")!] as RescueRecord[]);
    expect(care.followers).toBeLessThan(publicity.followers);
    expect(care.reputation).toBeGreaterThan(publicity.reputation);
    expect(care.sabrinaMessage).toContain("cameras");
    expect(publicity.summary).toContain("cameras");
  });
});
