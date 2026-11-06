import { afterEach, describe, expect, it } from "vitest";
import { useSpicyCharacterPhoto } from "@/lib/photo-provider-router.server";
import { buildSpicyPrompt } from "@/lib/spicy-image.server";

const original = process.env["SPICY_ALL_CHARACTER_PHOTOS"];
afterEach(() => {
  if (original === undefined) delete process.env["SPICY_ALL_CHARACTER_PHOTOS"];
  else process.env["SPICY_ALL_CHARACTER_PHOTOS"] = original;
});

describe("staged SpicyAPI character photo migration", () => {
  it("keeps ordinary routes unchanged unless explicitly enabled", () => {
    delete process.env["SPICY_ALL_CHARACTER_PHOTOS"];
    expect(useSpicyCharacterPhoto("casual_selfie")).toBe(false);
    expect(useSpicyCharacterPhoto("mature_romantic")).toBe(true);
    expect(useSpicyCharacterPhoto("suggestive")).toBe(true);
  });
  it("includes ordinary character selfies but excludes object photos", () => {
    process.env["SPICY_ALL_CHARACTER_PHOTOS"] = "true";
    for (const category of ["casual_selfie", "personal_selfie", "intimate_selfie", "tess_candid"])
      expect(useSpicyCharacterPhoto(category)).toBe(true);
    expect(useSpicyCharacterPhoto("object")).toBe(false);
  });
  it("does not eroticize an everyday work selfie", () => {
    const prompt = buildSpicyPrompt("Claire", 28, "At work taking a selfie", {
      clothing_category: "blue casual blouse",
    }, "ordinary");
    expect(prompt).toContain("Everyday, non-sexualized smartphone photo");
    expect(prompt).toContain("blue casual blouse");
    expect(prompt).not.toContain("Private romantic non-explicit adult portrait");
  });
});