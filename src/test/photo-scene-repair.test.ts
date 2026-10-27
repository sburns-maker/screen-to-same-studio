import { describe, expect, it } from "vitest";
import { correctedPhotoScene } from "@/lib/photo-scene";
import type { PhotographyPlan } from "@/lib/photo-personality";
const plan = (location: PhotographyPlan["location"]): PhotographyPlan => ({
  version: 1, character: "riley", scenario: null, candidates: [],
  location, availability: "limited",
  continuity: { hairstyle: null, clothing: null, objects: [], weather: null },
  continuitySource: "current_context_only", continuityReason: "",
  outfitEpisode: "unestablished",
});
describe("canonical photo scene repair", () => {
  it("repairs a home photo request when the character is at work", () => {
    const fixed = correctedPhotoScene(plan("work"), "Riley relaxing at home in the bedroom");
    expect(fixed).toContain("current work shift");
    expect(fixed).not.toContain("bedroom");
    expect(fixed).toContain("without customers, patients, records or screens");
  });
  it("keeps a scene consistent with current location", () => {
    const original = "Riley at work in a break area";
    expect(correctedPhotoScene(plan("work"), original)).toBe(original);
  });
  it("does not invent a setting when location is unknown", () => {
    expect(correctedPhotoScene(plan(null), "A mug on a table")).toBe("A mug on a table");
  });
});
