import { describe, expect, it } from "vitest";
import { maturePhotoCharacterHint } from "@/lib/photo-mature-personality";

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
});
