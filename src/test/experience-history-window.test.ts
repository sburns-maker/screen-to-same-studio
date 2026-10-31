import { describe, expect, it } from "vitest";
import { experienceInstructions, windowExperienceHistory } from "@/lib/living-experiences";

const moment = (i: number, body: string) => ({
  user_id: "u",
  id: `m${i}`,
  experience_id: "e",
  ordinal: i,
  kind: "conversation",
  body,
  source: i % 2 ? "user" : "character",
  confirmed: true,
  created_at: "2026-10-31T14:00:00Z",
});
const long = (n: number, len = 700) =>
  Array.from({ length: n }, (_, i) => moment(i + 1, `moment ${i + 1} ` + "x".repeat(len) + " 😂"));

describe("long outing prompt windowing", () => {
  it("keeps a short outing verbatim", () => {
    const h = long(10, 100);
    expect(windowExperienceHistory("turn", h)).toEqual(h.map((m) => ({ source: m.source, body: m.body })));
  });

  it("keeps a 98-moment date small, with the opening and the latest moment", () => {
    const h = long(98);
    const prompt = experienceInstructions("turn", "Breakfast", "Tess's home", h);
    expect(prompt.length).toBeLessThan(25_000);
    expect(prompt).toContain("moment 1 ");
    expect(prompt).toContain("moment 98 ");
    expect(prompt).not.toContain("moment 40 ");
    expect(prompt).toContain("earlier moments of this same outing");
  });

  it("never splits an emoji when clipping", () => {
    const h = long(60, 2000);
    const json = JSON.stringify(windowExperienceHistory("turn", h));
    expect(json.isWellFormed()).toBe(true);
  });

  it("gives a finishing summary sampled milestones from the middle", () => {
    const h = long(120);
    const w = windowExperienceHistory("finish", h);
    expect(w.some((m) => m.body.startsWith("moment 40 ") || m.body.startsWith("moment 50 "))).toBe(true);
    expect(JSON.stringify(w).length).toBeLessThan(25_000);
  });
});
