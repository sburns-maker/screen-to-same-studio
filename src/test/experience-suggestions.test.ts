import { describe, expect, it } from "vitest";
import { experienceStarters } from "@/lib/experience-suggestions";
describe("live experience action starters", () => {
  it("shows walking actions when the current scene is a walk", () => {
    expect(experienceStarters("walking").map((x) => x.label)).toContain("Find a bench");
  });
  it("offers context-specific options for shared home activities", () => {
    expect(experienceStarters("cooking").map((x) => x.label)).toContain("Help cook");
    expect(experienceStarters("watching_movie").map((x) => x.label)).toContain("Watch together");
  });
  it("falls back to conversation without inventing scene context", () => {
    expect(experienceStarters(undefined).map((x) => x.label)).toContain("Keep talking");
    expect(experienceStarters("unknown").map((x) => x.label)).toContain("Keep talking");
  });
  it("provides editable text, never action execution", () => {
    expect(experienceStarters("walking").every((x) => x.draft.trim().length > 0)).toBe(true);
  });
});
