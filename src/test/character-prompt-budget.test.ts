import { describe, expect, it } from "vitest";
import { boundedCharacterFacts, boundedRecentDialogue } from "@/lib/character-prompt-budget";

describe("character AI context budget (prompt only)", () => {
  it("preserves early prioritized context and reports that additional saved context was omitted", () => {
    const original = ["Current confirmed location", "Next known plan", "Older background " + "x".repeat(1000)];
    const kept = boundedCharacterFacts(original, 80);
    expect(kept).toContain("Current confirmed location");
    expect(kept).toContain("Next known plan");
    expect(kept).not.toContain("Older background x");
    expect(kept).toContain("stored history unchanged");
    expect(original[2]).toContain("x".repeat(1000));
  });
  it("keeps newest dialogue and latest user text under the prompt limit without mutating history", () => {
    const history = Array.from({ length: 80 }, (_, i) => ({
      id: i, sender: i % 2 ? "tess" : "user", body: `message-${i}: ${"a".repeat(3000)}`,
    }));
    const prompt = boundedRecentDialogue(history);
    expect(prompt.length).toBeLessThanOrEqual(26);
    expect(prompt[0]!.id).toBeGreaterThan(0);
    expect(prompt.at(-1)!.id).toBe(79);
    expect(prompt.reduce((n, item) => n + item.body.length + 100, 0)).toBeLessThanOrEqual(24000);
    expect(history[79]!.body.length).toBeGreaterThan(prompt.at(-1)!.body.length);
  });
  it("does not alter already-small conversations", () => {
    const msgs = [{ sender: "user", body: "Hi" }, { sender: "tess", body: "Hello" }];
    expect(boundedRecentDialogue(msgs)).toEqual(msgs);
    expect(boundedCharacterFacts(["a", "b"])).toBe("a | b");
  });
});
