import { describe, expect, it } from "vitest";
import {
  characterPregnancyDisclosure,
  playerPregnancyReference,
  explicitPregnancyDenial,
  experiencePregnancyContinuity,
  type ExperiencePregnancyEvidence,
} from "./experience-pregnancy-continuity";

const evidence = (patch: Partial<ExperiencePregnancyEvidence> = {}): ExperiencePregnancyEvidence => ({
  disclosedPositive: false,
  disclosedNegative: false,
  lifecycle: "unknown",
  characterSharedPositive: false,
  playerMentioned: false,
  ...patch,
});

describe("interactive experience pregnancy canon", () => {
  it("prioritizes a disclosed active pregnancy over a roommate-scene denial", () => {
    const state = experiencePregnancyContinuity(evidence({
      disclosedPositive: true, lifecycle: "pregnant", playerMentioned: true,
    }));
    expect(state.source).toBe("canonical_active");
    expect(state.rejectUnverifiedDenial).toBe(true);
    expect(state.lines.join(" ")).toContain("The player already knows");
    expect(explicitPregnancyDenial(
      "I need to be clear about one thing: I'm not pregnant. There isn't a little one on the way."
    )).toBe(true);
  });
  it("respects a previously disclosed positive test even when lifecycle is not loaded", () => {
    const state = experiencePregnancyContinuity(evidence({ disclosedPositive: true }));
    expect(state.source).toBe("canonical_disclosure");
    expect(state.rejectUnverifiedDenial).toBe(true);
    expect(state.lines.join(" ")).not.toContain("active pregnancy lifecycle");
  });
  it("does not invent an active pregnancy if the recorded pregnancy has ended", () => {
    const state = experiencePregnancyContinuity(evidence({
      disclosedPositive: true, lifecycle: "ended", playerMentioned: true,
    }));
    expect(state.rejectUnverifiedDenial).toBe(false);
    expect(state.lines.join(" ")).toContain("has ended");
  });
  it("honors an explicitly recorded negative test rather than overriding it with the player's assumption", () => {
    const state = experiencePregnancyContinuity(evidence({
      disclosedNegative: true, playerMentioned: true,
    }));
    expect(state.rejectUnverifiedDenial).toBe(false);
    expect(state.lines.join(" ")).toContain("negative");
  });
  it("preserves a character-authored prior disclosure without creating a new pregnancy", () => {
    expect(characterPregnancyDisclosure("I'm pregnant. I wanted to tell you directly.")).toBe(true);
    expect(characterPregnancyDisclosure("My pregnancy test came back positive.")).toBe(true);
    expect(characterPregnancyDisclosure("I'm not pregnant.")).toBe(false);
    expect(characterPregnancyDisclosure("I got a positive flu test.")).toBe(false);
    const state = experiencePregnancyContinuity(evidence({ characterSharedPositive: true }));
    expect(state.source).toBe("shared_disclosure");
    expect(state.lines.join(" ")).toContain("not authorization to create a canonical pregnancy event");
    expect(state.rejectUnverifiedDenial).toBe(true);
  });
  it("does not turn a player's baby discussion into a fictional positive result", () => {
    expect(playerPregnancyReference("With our little one already on the way, we can use the den.")).toBe(true);
    const state = experiencePregnancyContinuity(evidence({ playerMentioned: true }));
    expect(state.source).toBe("player_claim");
    expect(state.lines.join(" ")).toContain("does not establish a canonical pregnancy event");
    expect(state.rejectUnverifiedDenial).toBe(true);
  });
  it("leaves unrelated turns unaffected and avoids scanning benign denials", () => {
    expect(experiencePregnancyContinuity(evidence()).lines).toEqual([]);
    expect(explicitPregnancyDenial("I'm not moving in tonight.")).toBe(false);
    expect(explicitPregnancyDenial("I am not comfortable with the mortgage share.")).toBe(false);
    expect(explicitPregnancyDenial("There isn't a little one on the way.")).toBe(true);
  });
});
