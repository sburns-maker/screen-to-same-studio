import { describe, expect, it } from "vitest";
import { fitPromptContext, PROMPT_BUDGETS } from "@/lib/character-prompt-budget";

describe("fitPromptContext", () => {
  const build = (b: { dialogue: number }) => "x".repeat(b.dialogue * 3);
  it("keeps the full window when it fits", () => {
    expect(fitPromptContext(build, 10_000).length).toBe(PROMPT_BUDGETS[0]!.dialogue * 3);
  });
  it("shrinks older context so a long thread stays under 96k", () => {
    const text = fitPromptContext(build, 60_000);
    expect(text.length + 60_000).toBeLessThanOrEqual(96_000);
  });
});
