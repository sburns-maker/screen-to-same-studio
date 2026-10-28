import { describe, expect, it } from "vitest";
import { CHARACTERS } from "@/lib/characters";
import { buildImagePrompt } from "@/lib/tess-image.server";
import { buildSpicyPrompt, SPICY_CAST } from "@/lib/spicy-image.server";
import { referencePoseGuidance } from "@/lib/photo-reference-prompt";
import type { PhotoStyle } from "@/lib/tess-photos";

const style: PhotoStyle = {
  pose_type:
    "standing with torso turned slightly left, head level, looking toward lens, free hand relaxed",
  camera_angle: "eye_level",
  crop_type: "waist_up",
  selfie_type: "selfie",
  expression: "tired but content",
  clothing_category: "established gray cotton tee",
};
const scene = "standing in the established apartment kitchen after work";

describe("reference identity without reference pose locking", () => {
  it.each(Object.values(CHARACTERS))(
    "gives $preferredName a concrete capture independent of reference geometry",
    (character) => {
      const prompt = buildImagePrompt("casual_selfie", scene, "tired but content", style, {
        key: character.key,
        name: character.fullName,
        age: character.age,
        pronouns: character.pronouns,
        appearance: character.appearance,
      });
      expect(prompt).toContain("For stable identity features only");
      expect(prompt).toContain(
        "TARGET CAPTURE: pose_type: standing with torso turned slightly left",
      );
      expect(prompt).toContain("camera_angle: eye level");
      expect(prompt).toContain("expression: tired but content");
      expect(prompt).toContain("Reconstruct a fresh photograph of that same adult");
      expect(prompt).toContain("do not merely replace the clothes or background");
      expect(prompt).toContain("without changing underlying facial anatomy");
      expect(prompt).toContain("If the player explicitly requests the same pose, preserve it");
      expect(prompt).toContain(style.clothing_category);
      expect(prompt).toContain(scene);
    },
  );

  it.each(SPICY_CAST)("applies the same identity/geometry split in %s's Spicy prompt", (key) => {
    const character = CHARACTERS[key];
    const prompt = buildSpicyPrompt(character.fullName, character.age, scene, style);
    expect(prompt).toContain(referencePoseGuidance(style));
    expect(prompt).toContain(style.pose_type);
    expect(prompt).toContain("keep the phone behind the lens");
    expect(prompt).toContain("the reference controls stable appearance only");
    expect(prompt).toContain(style.clothing_category);
  });

  it("resolves missing pose from activity without prescribing a universal head position or smile", () => {
    const prompt = referencePoseGuidance();
    expect(prompt).toContain(
      "Resolve a single believable pose and camera placement from the requested activity and mood",
    );
    expect(prompt).toContain("Do not restore the reference's smile or lean");
    expect(prompt).toContain(
      "No forced pose alternation, emotion change, outfit change or invented activity",
    );
  });

  it("does not apply human pose instructions to object-only photos", () => {
    const prompt = buildImagePrompt("object", "a cup on the kitchen counter", null);
    expect(prompt).not.toContain("TARGET CAPTURE");
    expect(prompt).not.toContain("Reconstruct a fresh photograph of that same adult");
  });

  it("respects a deliberately selected mirror photo without creating a new photographer", () => {
    const prompt = referencePoseGuidance({
      ...style,
      selfie_type: "mirror",
      camera_angle: "side angle",
    });
    expect(prompt).toContain("selfie_type: mirror");
    expect(prompt).toContain("camera_angle: side angle");
    expect(prompt).toContain("only when established in the scene");
  });
});
