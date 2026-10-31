import { describe, expect, it } from "vitest";
import { experienceInstructions } from "@/lib/living-experiences";

describe("experience scene agency guardrails", () => {
  const history = [
    { user_id: "u", id: "m", experience_id: "e", ordinal: 1, kind: "conversation", body: "Would you like to walk to the candy shop?", source: "user", confirmed: true, created_at: "2026-10-23T22:00:00Z" },
  ];
  it("lets a character advance an interactive scene while preserving user agency", () => {
    const prompt = experienceInstructions("turn", "Dinner", "Fanelli's", history);
    expect(prompt).toContain("Take believable initiative");
    expect(prompt).toContain("Do not require the user to narrate every transition");
    expect(prompt).toContain("do not invent a user decision");
    expect(prompt).toContain("Avoid looping at the same stage");
    expect(prompt).toContain("acknowledge what occurred in your immediate response");
    expect(prompt).toContain("Would you like to walk to the candy shop?");
  });
  it("permits mutually chosen adult intimacy without a mandatory kissing ceiling", () => {
    const prompt = experienceInstructions("turn", "Saturday at Tess's", "Tess's home", history);
    expect(prompt).toContain("including hooking up");
    expect(prompt).toContain("fade to black without explicit sexual depiction");
    expect(prompt).toContain("must not decide the player accepts");
    expect(prompt).toContain("character must freely choose");
    expect(prompt).toContain("Do not interpret past kisses");
    expect(prompt).toContain("respect that specific decision");
    expect(prompt).toContain("neither future sex nor exclusivity");
  });

  it("addresses the current direct in-person question before older travel memories", () => {
    const historyWithKiss = [
      ...history,
      { ...history[0]!, id: "m2", ordinal: 2, source: "character", body: "Tess holds him close while the movie plays." },
      { ...history[0]!, id: "m3", ordinal: 3, body: "I pause the movie, pull her closer, and kiss her. Still think we need the movie?" },
    ];
    const prompt = experienceInstructions("turn", "Saturday at Tess's", "Tess's home", historyWithKiss);
    expect(prompt).toContain("IMMEDIATE SCENE RELEVANCE");
    expect(prompt).toContain("CURRENT PLAYER SCENE TURN");
    expect(prompt).toContain("Still think we need the movie?");
    expect(prompt).toContain("do not abruptly pivot to old saved goals, travel fantasies");
    expect(prompt).toContain("If the character wants to continue the movie");
    expect(prompt).not.toContain("she must deepen the kiss");
  });

  it("does not license invented romance in automatic completion", () => {
    const prompt = experienceInstructions("automatic", "Dinner", "Fanelli's", history);
    expect(prompt).toContain("Automatic completion must not establish any new intimate milestone");
    expect(prompt).toContain("Do not invent user dialogue, new commitments, mutual consent");
    expect(prompt).not.toContain("Take believable initiative");
  });
});
