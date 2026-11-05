import { describe, expect, it } from "vitest";
import { buildImagePrompt } from "@/lib/tess-image.server";
import { buildSpicyPrompt } from "@/lib/spicy-image.server";

describe("photo prompt clothing anatomy", () => {
  it("keeps Riley's ordinary scrub selfie anatomically realistic without inventing cleavage", () => {
    const prompt = buildImagePrompt(
      "casual_selfie",
      "Riley at home, wearing navy V-neck medical scrubs",
      "relaxed",
      { clothing_category: "navy V-neck medical scrubs" },
      { key: "riley", name: "Riley", age: 28, pronouns: "she/her", appearance: "" },
    );
    expect(prompt).toContain("established chest and torso proportions");
    expect(prompt).toContain("medical scrubs");
    expect(prompt).toContain("Do not artificially flatten or enlarge breasts");
    expect(prompt).toContain("Coverage follows the actual garment");
  });

  it("retains realistic fabric and chest shaping for the alternative image provider", () => {
    const prompt = buildSpicyPrompt("Riley", 28, "At home in navy scrubs", {
      clothing_category: "navy V-neck medical scrubs",
    });
    expect(prompt).toContain("natural adult chest and torso anatomy");
    expect(prompt).toContain("without artificially flattening or enlarging");
    expect(prompt).toContain("Do not change canonical body proportions");
  });
});
