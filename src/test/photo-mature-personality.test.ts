import { describe, expect, it } from "vitest";
import { PHOTO_INTENSITY_PROFILES, maturePhotoCharacterHint, deliveredPhotoContextLabel, deliveredRomanticPhotoMemory, allowedCharacterPhotoTypes, characterPhotoIntensityHint, characterPhotoInstructions } from "@/lib/photo-mature-personality";
import { photoDecisionRules } from "@/lib/tess.server";
import { PHOTO_LAB_TYPES, PHOTO_LAB_PRESETS, labTypeSupported } from "@/lib/developer-photo-lab";
import { CHARACTERS, type CharacterKey } from "@/lib/characters";
import { photographyProfile } from "@/lib/photo-personality";
import { safePhotoScene } from "@/lib/photo-policy";

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
  it("favors appropriately grounded suggestive choices for Sienna and Kendra", () => {
    expect(PHOTO_INTENSITY_PROFILES["sienna"]?.maxCategory).toBe("suggestive");
    expect(PHOTO_INTENSITY_PROFILES["sienna"]?.suggestiveBias).toBe(0.7);
    expect(PHOTO_INTENSITY_PROFILES["kendra"]?.maxCategory).toBe("suggestive");
    expect(PHOTO_INTENSITY_PROFILES["kendra"]?.suggestiveBias).toBe(0.8);
    const eligible = ["casual_selfie", "mature_romantic", "suggestive"];
    for (const character of ["sienna", "kendra"]) {
      expect(allowedCharacterPhotoTypes(character, eligible)).toEqual(eligible);
      const hint = characterPhotoIntensityHint(character, eligible);
      expect(hint).toContain("favor");
      expect(hint).toContain("independently");
      expect(hint).toContain("not standing consent");
      expect(allowedCharacterPhotoTypes(character, ["casual_selfie"])).toEqual(["casual_selfie"]);
    }
    expect(characterPhotoIntensityHint("sienna", eligible)).toContain("candid");
    expect(characterPhotoIntensityHint("kendra", eligible)).toContain("intentional pose");
    expect(PHOTO_INTENSITY_PROFILES["kendra"]!.suggestiveBias).toBeGreaterThan(PHOTO_INTENSITY_PROFILES["sienna"]!.suggestiveBias);
  });
  it("supports Riley without implying standing consent", () => {
    expect(maturePhotoCharacterHint("riley", ["casual_selfie"])).toBe("");
    const hint = maturePhotoCharacterHint("riley", ["mature_romantic"]);
    expect(hint).toContain("shift schedule");
    expect(hint).toContain("does not create standing consent");
  });
  it("gives Maya her own gradual romantic-photo guidance", () => {
    const hint = maturePhotoCharacterHint("maya", ["mature_romantic"]);
    expect(hint).toContain("playful flirtation");
    expect(hint).toContain("romantic intent");
    expect(hint).toContain("suggestive non-explicit");
    expect(maturePhotoCharacterHint("maya", ["casual_selfie"])).toBe("");
  });
  it("lets Claire make private romantic choices without equating warmth with consent", () => {
    const hint = maturePhotoCharacterHint("claire", ["mature_romantic"]);
    expect(hint).toContain("open to genuine romance");
    expect(hint).toContain("consent");
    expect(hint).toContain("suggestive non-explicit");
    expect(maturePhotoCharacterHint("claire", ["casual_selfie"])).toBe("");
  });
  it("keeps unmodified or platonic characters out of the romantic-photo guidance", () => {
    for (const key of ["jordan", "ben"]) {
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
    expect(allowedCharacterPhotoTypes("maya", riley)).toEqual(riley);
    expect(allowedCharacterPhotoTypes("claire", riley)).toEqual(riley);
    expect(allowedCharacterPhotoTypes("jordan", riley)).toEqual(["casual_selfie"]);
    expect(allowedCharacterPhotoTypes("ben", riley)).toEqual(["casual_selfie"]);
    expect(characterPhotoIntensityHint("riley", riley)).toContain("independent willingness");
    expect(characterPhotoIntensityHint("maya", riley)).toContain("gradual");
    expect(characterPhotoIntensityHint("claire", riley)).toContain("privacy");
    expect(characterPhotoIntensityHint("claire", ["casual_selfie"])).toBe("");
    expect(characterPhotoIntensityHint("jordan", ["casual_selfie"])).toBe("");
  });
  it("never expands a character's hard eligibility list", () => {
    for (const character of ["maya", "claire"]) {
      expect(allowedCharacterPhotoTypes(character, ["casual_selfie"])).toEqual(["casual_selfie"]);
      expect(allowedCharacterPhotoTypes(character, [])).toEqual([]);
    }
  });
  it("stores only actual private romantic photo categories as memories", () => {
    expect(deliveredRomanticPhotoMemory("Riley", "suggestive")).toContain("non-explicit");
    expect(deliveredRomanticPhotoMemory("Riley", "mature_romantic")).toContain("private romantic");
    expect(deliveredRomanticPhotoMemory("Riley", "casual_selfie")).toBeNull();
    expect(deliveredPhotoContextLabel("suggestive")).toContain("suggestive");
  });
  it("developer lab exposes suggestive without changing a character choice", () => {
    expect(PHOTO_LAB_TYPES).toContain("suggestive");
    expect(PHOTO_LAB_PRESETS.suggestive.label).toContain("Suggestive");
    expect(safePhotoScene(PHOTO_LAB_PRESETS.suggestive.scene)).toBe(true);
    expect(labTypeSupported(CHARACTERS.riley, "suggestive")).toBe(true);
    expect(labTypeSupported(CHARACTERS.ben, "suggestive")).toBe(false);
  });
  it("gives Tess her own mature-romantic guidance when eligible", () => {
    expect(maturePhotoCharacterHint("tess", ["casual_selfie"])).toBe("");
    const guidance = maturePhotoCharacterHint("tess", ["mature_romantic"]);
    expect(guidance).toContain("TESS PHOTO PERSONALITY");
    expect(guidance).toContain("dry, understated");
    expect(guidance).toContain("Mabel");
    expect(guidance).toContain("independently");
  });
  it("wires all female character photo profiles into the shared chat prompt", () => {
    const girls: CharacterKey[] = ["tess", "maya", "riley", "sienna", "kendra", "claire", "jordan"];
    for (const key of girls) {
      const def = CHARACTERS[key];
      expect(def.photosEnabled).toBe(true);
      expect(photographyProfile(key).key).toBe(key);
      const profile = PHOTO_INTENSITY_PROFILES[key];
      expect(profile).toBeDefined();
      const offered = ["object", "casual_selfie", "mature_romantic", "suggestive"];
      const eligible = allowedCharacterPhotoTypes(key, offered);
      const instructions = characterPhotoInstructions(key, eligible);
      if (profile.maxCategory === "ordinary") {
        expect(eligible).toEqual(["object", "casual_selfie"]);
        expect(instructions).toBe("");
      } else {
        expect(eligible).toContain("mature_romantic");
        expect(eligible).toContain("suggestive");
        expect(maturePhotoCharacterHint(key, eligible)).toContain("PHOTO PERSONALITY");
        expect(instructions).toContain("PHOTO CHOICE");
        expect(instructions).toContain(profile.guidance);
      }
    }
    expect(characterPhotoInstructions("ben", allowedCharacterPhotoTypes("ben", ["object", "suggestive"]))).toBe("");
  });
});
