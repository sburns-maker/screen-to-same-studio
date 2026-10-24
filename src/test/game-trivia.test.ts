import { describe, expect, it } from "vitest";
import { QUESTION_BANK, nextTriviaDeck } from "@/lib/game-trivia";

describe("rotating trivia questions", () => {
  it("uses valid unique questions each round", () => {
    const deck = nextTriviaDeck([], 10);
    expect(deck).toHaveLength(10);
    expect(new Set(deck).size).toBe(10);
    for (const id of deck) {
      const q = QUESTION_BANK[id];
      expect(q).toBeDefined();
      expect(q.choices).toHaveLength(4);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(4);
    }
  });
  it("avoids questions from the immediately previous ten-question round", () => {
    const first = nextTriviaDeck([], 10);
    const second = nextTriviaDeck(first, 10);
    expect(second).toHaveLength(10);
    expect(second.some((id) => first.includes(id))).toBe(false);
  });
  it("supports selectable match sizes within the available question bank", () => {
    for (const length of [5, 10, 20]) expect(nextTriviaDeck([], length)).toHaveLength(length);
  });
});
