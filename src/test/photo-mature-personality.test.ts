import { describe, expect, it } from "vitest";
import { maturePhotoCharacterHint, deliveredPhotoContextLabel } from "@/lib/photo-mature-personality";
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
  it("aligns dialogue selection with the suggestive non-explicit category", () => {
    const prompt = photoDecisionRules("none");
    expect(prompt).toContain("distinctly flirtatious but NON-EXPLICIT");
    expect(prompt).toContain("tasteful opaque lingerie");
    expect(prompt).toContain("framing=romantic");
    expect(prompt).toContain("Keep the actual current place and clothing");
    expect(prompt).toContain("Never put mature styling in an ordinary photo category");
    expect(prompt).not.toContain("no lingerie, boudoir");
  });
  it("preserves the delivered photo category as private chat history", () => {
    expect(deliveredPhotoContextLabel("mature_romantic"))
      .toBe("a privately flirtatious, non-explicit romantic photo");
    expect(deliveredPhotoContextLabel("casual_selfie")).toBe("a photo she just took");
    expect(deliveredPhotoContextLabel(null)).toBe("a photo she just took");
  });
});
