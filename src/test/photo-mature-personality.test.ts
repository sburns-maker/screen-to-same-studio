import { describe, expect, it } from "vitest";
import { maturePhotoCharacterHint, deliveredPhotoContextLabel, deliveredRomanticPhotoMemory, allowedCharacterPhotoTypes, characterPhotoIntensityHint } from "@/lib/photo-mature-personality";
import { photoDecisionRules } from "@/lib/tess.server";

describe("character-aware mature photo guidance", () => {
  it("gives Kendra optional fashion-aware framing only when the mature category is eligible", () => {
    expect(maturePhotoCharacterHint("kendra", ["casual_selfie"])).toBe("");
    const hint = maturePhotoCharacterHint("kendra", ["casual_selfie", "mature_romantic"]);
    expect(hint).toContain("freelance model");
    expect(hint).toContain("not consent");
    expect(hint).toContain("Keep many photos ordinary");
  });
  it("gives Sienna distinct contextual, adult non-explicit framing", () => {
    const hint = maturePhotoCharacterHint("sienna", ["mature_romantic"]);
    expect(hint).toContain("late-shift");
    expect(hint).toContain("non-explicit");
    expect(hint).toContain("never imply consent");
  });
  it("supports Riley without implying standing consent", () => {
    expect(maturePhotoCharacterHint("riley", ["casual_selfie"])).toBe("");
    const hint = maturePhotoCharacterHint("riley", ["mature_romantic"]);
    expect(hint).toContain("shift schedule");
    expect(hint).toContain("does not create standing consent");
  });
  it("does not change other characters or bypass eligibility", () => {
    for (const key of ["tess", "maya", "claire", "jordan", "ben"]) {
      expect(maturePhotoCharacterHint(key, ["mature_romantic"])).toBe("");
    }
    expect(maturePhotoCharacterHint("sienna", [])).toBe("");
  });
  it("preserves user-customized mature photo guidance while separating categories", () => {
    const prompt = photoDecisionRules("none");
    expect(prompt).toContain("Mature_romantic is a separate optional adult romantic portrait");
    expect(prompt).toContain("framing=romantic");
    expect(prompt).toContain("Preserve the actual current place and clothing");
    expect(prompt).toContain("Do not relabel an ordinary selfie as mature_romantic");
    expect(prompt).not.toContain("no lingerie, boudoir");
  });
  it("preserves delivered photo category in later chat context", () => {
    expect(deliveredPhotoContextLabel("mature_romantic"))
      .toBe("a privately shared romantic photo");
    expect(deliveredPhotoContextLabel("casual_selfie")).toBe("a photo she just took");
    expect(deliveredPhotoContextLabel(null)).toBe("a photo she just took");
  });
  it("filters mature options per character without forcing a photo", () => {
    const riley = allowedCharacterPhotoTypes("riley", ["casual_selfie", "mature_romantic", "suggestive"]);
    expect(riley).toContain("suggestive");
    expect(allowedCharacterPhotoTypes("maya", riley)).toEqual(["casual_selfie", "mature_romantic"]);
    expect(allowedCharacterPhotoTypes("jordan", riley)).toEqual(["casual_selfie"]);
    expect(allowedCharacterPhotoTypes("ben", riley)).toEqual(["casual_selfie"]);
    expect(characterPhotoIntensityHint("riley", riley)).toContain("independent willingness");
    expect(characterPhotoIntensityHint("jordan", ["casual_selfie"])).toBe("");
  });
  it("stores only actual private romantic photo categories as memories", () => {
    expect(deliveredRomanticPhotoMemory("Riley", "suggestive")).toContain("non-explicit");
    expect(deliveredRomanticPhotoMemory("Riley", "mature_romantic")).toContain("private romantic");
    expect(deliveredRomanticPhotoMemory("Riley", "casual_selfie")).toBeNull();
    expect(deliveredPhotoContextLabel("suggestive")).toContain("suggestive");
  });
});
