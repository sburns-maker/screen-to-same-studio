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
  it("supports travel, arrival and ordering without auto-submitting", () => {
    expect(experienceStarters("driving").some((x) => x.label === "Talk on the way")).toBe(true);
    expect(experienceStarters("arriving").some((x) => x.label === "Go inside?")).toBe(true);
    expect(experienceStarters("ordering").some((x) => x.label === "Choose a drink")).toBe(true);
    expect(experienceStarters("finished_meal").some((x) => x.label === "Suggest next stop")).toBe(true);
  });
  it("falls back to conversation without inventing scene context", () => {
    expect(experienceStarters(undefined).map((x) => x.label)).toContain("Keep talking");
    expect(experienceStarters("unknown").map((x) => x.label)).toContain("Keep talking");
  });
  it("provides editable text, never action execution", () => {
    expect(experienceStarters("walking").every((x) => x.draft.trim().length > 0)).toBe(true);
  });
});
