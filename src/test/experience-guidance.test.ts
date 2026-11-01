import { describe, expect, it } from "vitest";
import { experienceInstructions } from "@/lib/living-experiences";
import { inPersonOutputRules } from "@/lib/in-person-output-rules";

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

  it("replays Riley's redirect without turning a specific limit into a blanket refusal", () => {
    const rileyHistory = [
      { ...history[0]!, id: "kiss", ordinal: 2, source: "character", body: "You can definitely kiss me properly, love. The movie can survive a minute without us." },
      { ...history[0]!, id: "advance", ordinal: 3, body: "I kiss her and my hand moves from her waist toward her chest." },
      { ...history[0]!, id: "boundary", ordinal: 4, source: "character", body: "I kiss you back, then catch your hand gently before it moves higher and guide it back to my waist. Keep kissing me, though—I'm very happy with your attention right here." },
      { ...history[0]!, id: "next", ordinal: 5, body: "I keep my hand at her waist, return her kiss, and let her choose what happens next." },
    ];
    const prompt = experienceInstructions("turn", "Sleep over", "My Home", rileyHistory);
    const systemRules = inPersonOutputRules("Riley", true);
    expect(prompt).toContain("Keep kissing me, though");
    expect(prompt).toContain("Respect the exact scope of a boundary");
    expect(prompt).toContain("do not repeat or work around that touch in this scene");
    expect(prompt).toContain("not automatically a blanket refusal");
    expect(systemRules).toContain("Keep the redirected hand where she chose");
    expect(systemRules).toContain("not automatically every form of affection");
    expect(systemRules).toContain("An interested adult character can also take meaningful initiative");
    expect(systemRules).toContain("Her interest, not the player's persistence, determines her choice");
  });

  it("retains an explicit tonight-wide no while permitting independently chosen adult romance", () => {
    const stopped = [
      ...history,
      { ...history[0]!, id: "stop", ordinal: 2, source: "character", body: "I don't want to go further tonight. Let's just watch the movie." },
    ];
    const prompt = experienceInstructions("turn", "Sleep over", "My Home", stopped);
    const systemRules = inPersonOutputRules("Riley", true);
    expect(prompt).toContain("If they explicitly decline further intimacy for tonight");
    expect(prompt).toContain("honor that broader boundary throughout the scene");
    expect(prompt).toContain("I don't want to go further tonight");
    expect(systemRules).toContain("maintain that broader boundary for the scene");
    expect(systemRules).toContain("Never treat repeated invitations");
    expect(systemRules).toContain("BOTH adults independently choose");
  });

  it("detects Riley's repeated engagement refrain from the full scene instead of disabling topic checks", () => {
    const relationshipHistory = [
      { ...history[0]!, id: "opening", ordinal: 1, body: "We are already engaged and enjoying a sleepover." },
      { ...history[0]!, id: "yes1", ordinal: 2, source: "character", body: "I still want to marry you, fiancé." },
      { ...history[0]!, id: "yes2", ordinal: 3, source: "character", body: "I'm still choosing you every day." },
      { ...history[0]!, id: "morning", ordinal: 4, source: "user", body: "Come help me cook breakfast." },
    ];
    const prompt = experienceInstructions("turn", "Sleep over", "My Home", relationshipHistory, "riley");
    expect(prompt).toContain("SCENE TOPIC REPETITION");
    expect(prompt).toContain("repeated reassurances about an already discussed commitment");
    expect(prompt).toContain("Come help me cook breakfast.");
    expect(experienceInstructions("automatic", "Sleep over", "My Home", relationshipHistory, "riley"))
      .not.toContain("SCENE TOPIC REPETITION");
  });

  it("does not license invented romance in automatic completion", () => {
    const prompt = experienceInstructions("automatic", "Dinner", "Fanelli's", history);
    expect(prompt).toContain("Automatic completion must not establish any new intimate milestone");
    expect(prompt).toContain("Do not invent user dialogue, new commitments, mutual consent");
    expect(prompt).not.toContain("Take believable initiative");
  });
});
