import { describe, expect, it } from "vitest";
import { photoChoiceInstruction } from "@/lib/photo-choice-opportunity";
import type { CharacterKey } from "@/lib/characters";

const ready = ["object", "casual_selfie", "personal_selfie", "mature_romantic", "suggestive"];
const choice = (character: CharacterKey, setting: string, types: readonly string[] = ready, selected = true) =>
  photoChoiceInstruction({ character, currentSetting: setting, eligibleTypes: types, opportunitySelected: selected });

describe("character-driven spontaneous photo choices", () => {
  it("gives Maya a real non-explicit suggestive option in a private established moment", () => {
    const prompt = choice("maya", "at home relaxing alone on her couch");
    expect(prompt).toContain("Before writing a text");
    expect(prompt).toContain("PRIVATE ROMANTIC PHOTO OPTION");
    expect(prompt).toContain("suggestive non-explicit");
    expect(prompt).toContain("photo=null");
    expect(prompt).toContain("actual setting");
    expect(prompt).toContain("willing=true");
  });
  it("keeps characters distinct without forcing them to send anything", () => {
    expect(choice("tess", "at home")).toContain("selective, private and understated");
    expect(choice("sienna", "at home")).toContain("spontaneous photographer");
    expect(choice("kendra", "at home")).toContain("fashion-conscious");
    expect(choice("riley", "at home")).toContain("established mutual affection");
    expect(choice("claire", "at home")).toContain("treasures trust and privacy");
    for (const character of ["maya", "tess", "sienna", "kendra", "riley", "claire"] as const) {
      expect(choice(character, "at home")).toContain("photo=null is a complete, valid choice");
    }
  });
  it("never presents an unestablished workplace as a private suggestive moment", () => {
    const prompt = choice("maya", "working in office on her venue shift");
    expect(prompt).not.toContain("PRIVATE ROMANTIC PHOTO OPTION:");
    expect(prompt).toContain("this current setting does not establish a private photo moment");
    expect(prompt).toContain("rather than inventing privacy");
  });
  it("does not suggest a private romantic category if it is ineligible or the character is platonic", () => {
    const kendra = choice("kendra", "at home", ["object", "casual_selfie"]);
    expect(kendra).not.toContain("PRIVATE ROMANTIC PHOTO OPTION:");
    expect(kendra).toContain("Do not choose a romantic or suggestive photo");
    const jordan = choice("jordan", "at home", ["object", "casual_selfie"]);
    const ben = choice("ben", "at home", ["object"]);
    expect(jordan).not.toContain("PRIVATE ROMANTIC PHOTO OPTION:");
    expect(ben).not.toContain("PRIVATE ROMANTIC PHOTO OPTION:");
    // A mistakenly broad list still cannot override an ordinary-only character's profile.
    expect(choice("jordan", "at home", ready)).not.toContain("PRIVATE ROMANTIC PHOTO OPTION:");
  });
  it("lets Riley consider an ordinary selfie on a direct request even when the random photo lottery loses", () => {
    const prompt = photoChoiceInstruction({
      character: "riley",
      opportunitySelected: false,
      directOrdinaryRequest: true,
      eligibleTypes: ready,
      currentSetting: "at home relaxing",
    });
    expect(prompt).toContain("DIRECT EVERYDAY PHOTO REQUEST");
    expect(prompt).toContain("casual_selfie");
    expect(prompt).toContain("willing=true");
    expect(prompt).toContain("framing=ordinary");
    expect(prompt).toContain("photo=null is valid");
    expect(prompt).not.toContain("PRIVATE ROMANTIC PHOTO OPTION");
    expect(prompt).toContain("Do NOT escalate");
  });
  it("does not bypass a saved no-selfie boundary or fabricate a picture when ordinary types are unavailable", () => {
    const objectOnly = photoChoiceInstruction({
      character: "riley", opportunitySelected: false, directOrdinaryRequest: true,
      eligibleTypes: ["object"], currentSetting: "at home",
    });
    expect(objectOnly).toContain("object");
    expect(objectOnly).not.toContain("casual_selfie");
    const blocked = photoChoiceInstruction({
      character: "riley", opportunitySelected: false, directOrdinaryRequest: true,
      eligibleTypes: [], currentSetting: "at home",
    });
    expect(blocked).toContain("photo=null");
    expect(blocked).toContain("No ordinary photograph is permitted");
  });
  it("retains the normal no-photo default for skipped opportunities and disabled photos", () => {
    expect(choice("maya", "at home", ready, false)).toBe("Usually null.");
    expect(choice("maya", "at home", [], true)).toBe("Usually null.");
  });
});
