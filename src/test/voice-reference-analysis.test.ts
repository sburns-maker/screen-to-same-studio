import { describe, expect, it } from "vitest";
import { analyzePcm, buildMatchedInstructions, paceWords } from "@/lib/voice-reference-analysis";

describe("voice reference analysis", () => {
  it("detects the pitch of a 230 Hz tone", () => {
    const rate = 24000;
    const s = new Float32Array(rate * 2);
    for (let i = 0; i < s.length; i++) s[i] = 0.5 * Math.sin((2 * Math.PI * 230 * i) / rate);
    const st = analyzePcm(s, rate, "one two three four five six");
    expect(st.medianPitchHz).toBeGreaterThan(220);
    expect(st.medianPitchHz).toBeLessThan(240);
    expect(st.wordsPerMinute).toBe(180);
  });
  it("classifies ~98 wpm as unhurried", () => {
    expect(paceWords(98)).toBe("unhurried and deliberate");
  });
  it("keeps the base identity and stays within the 4000-char limit", () => {
    const out = buildMatchedInstructions("BASE", { durationSec: 14, medianPitchHz: 231, pitchLowHz: 182, pitchHighHz: 286, wordsPerMinute: 98, pauseRatio: 0.4 }, "x".repeat(5000));
    expect(out.startsWith("BASE")).toBe(true);
    expect(out).toContain("98 words per minute");
    expect(out.length).toBeLessThanOrEqual(4000);
  });
});
