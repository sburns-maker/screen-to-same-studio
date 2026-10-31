import { describe, expect, it } from "vitest";
import { photoChoiceInstruction } from "./photo-choice-opportunity";
import { photoOpportunity } from "./photo-opportunities";

const cast = ["tess", "riley", "claire", "kendra", "maya", "sienna"] as const;
describe("ordinary autonomous photo decisions", () => {
  for (const character of cast) {
    it(`${character} can independently consider an ordinary photo outside a scheduled photo moment`, () => {
      const text = photoChoiceInstruction({
        character, opportunitySelected: false,
        eligibleTypes: ["object", "casual_selfie"],
        currentSetting: "home with dinner",
      });
      expect(text).toContain("ordinary");
      expect(text).toContain("object");
      expect(text).toContain("silence");
      expect(text).not.toBe("Usually null.");
    });
    it(`${character} retains the right to decline an ordinary photo`, () => {
      const text = photoChoiceInstruction({
        character, opportunitySelected: true,
        eligibleTypes: ["object", "casual_selfie"],
        currentSetting: "home",
      });
      expect(text).toContain("photo=null");
    });
  }
  it("no eligible category blocks photos without suppressing ordinary messaging", () => {
    const text = photoChoiceInstruction({
      character: "claire", opportunitySelected: false,
      eligibleTypes: [], currentSetting: "library",
    });
    expect(text).toContain("photo=null");
  });
});
