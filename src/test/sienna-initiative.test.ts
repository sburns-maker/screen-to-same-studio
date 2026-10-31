import { describe, expect, it } from "vitest";
import { CHARACTERS } from "@/lib/characters";
import { characterInitiativeOpportunity } from "@/lib/character-initiative";
import { FICTIONAL_MARRIAGE_SHOW, siennaShowContext } from "@/lib/fictional-marriage-show";

const base = {
  key: "sienna" as const, channel: "text" as const,
  state: { ...CHARACTERS.sienna.seedState, trust: 53, romantic_intent: 19 },
  latestPlayerMessage: "That sounds like a nice evening",
  latestCharacterMessage: "I'm excited to see you",
  turnCount: 25, availabilityDetail: "Free until 4 pm",
};

describe("Sienna's character initiative", () => {
  it("is deterministic for retries and not added to unrelated characters", () => {
    expect(characterInitiativeOpportunity(base)).toEqual(characterInitiativeOpportunity(base));
    expect(characterInitiativeOpportunity({ ...base, key: "tess" })).toBeNull();
  });
  it("provides genuinely differentiated action opportunities across turns", () => {
    const modes = Array.from({ length: 120 }, (_, i) => characterInitiativeOpportunity({
      ...base, turnCount: i, latestPlayerMessage: "Let's have fun " + i,
    })!.mode);
    expect(new Set(modes).size).toBeGreaterThanOrEqual(4);
    expect(modes.filter(m => m !== "ordinary").length).toBeGreaterThan(80);
  });
  it("addresses explicit marriage proposals instead of inventing a yes", () => {
    const choice = characterInitiativeOpportunity({ ...base, latestPlayerMessage: "Sienna, will you marry me?" })!;
    expect(choice.mode).toBe("direct_vulnerability");
    expect(choice.instruction).toContain("no, or a specific request for time");
    expect(choice.instruction).toContain("bold yes is allowed");
  });
  it("prioritizes boundaries above daring actions", () => {
    const choice = characterInitiativeOpportunity({
      ...base, state: { ...base.state, perceived_pressure: 25 },
    })!;
    expect(choice.mode).toBe("ordinary");
    expect(choice.instruction).toContain("say no");
  });
});

describe("fictional TV wedding casting listing", () => {
  const date = new Date("2026-10-31T19:00:00-04:00");
  const thread = [{sender:"user",body:"Remember that million dollar reality show marriage idea?"}];
  it("is a world-canon listing rather than a fabricated already-won prize", () => {
    expect(FICTIONAL_MARRIAGE_SHOW.prizeUsd).toBe(1_000_000);
    const guidance = siennaShowContext("sienna", thread, date);
    expect(guidance).toContain("genuine listing");
    expect(guidance).toContain("person-specific proposal");
    expect(guidance).toContain("not selection or a guaranteed award");
    expect(guidance).toContain("can say no");
    expect(guidance).toContain("million isn't what matters");
  });
  it("does not intrude into other conversations or without a related topic", () => {
    expect(siennaShowContext("riley",thread,date)).toBe("");
    expect(siennaShowContext("sienna",[{sender:"user",body:"How's your shift?"}],date)).toBe("");
  });
});
