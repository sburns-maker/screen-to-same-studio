import { describe, expect, it } from "vitest";
import { buildImagePrompt, includesTess, sceneHasMabel } from "@/lib/tess-image.server";

describe("image prompt builder", () => {
  it("treats the canonical reference as identity only, not pose", () => {
    const p = buildImagePrompt(
      "casual_selfie",
      "Tess at her kitchen counter with coffee",
      "tired but amused",
    );
    expect(p).toContain("defines the woman's identity only");
    expect(p).toContain("Do not recreate the reference image's pose or composition");
    expect(p).toContain(
      "varied personal smartphone photos rather than repeated professional portraits",
    );
    expect(p).toContain("WARDROBE AND POSE VARIETY");
    expect(p).toContain("Avoid making black or charcoal tops the habitual default");
  });

  it("weaves pose, angle, crop, hair, expression and clothing into the prompt", () => {
    const p = buildImagePrompt("tess_candid", "Tess on the couch with Mabel", null, {
      pose_type: "sitting_cross_legged",
      camera_angle: "propped_phone",
      crop_type: "waist_up",
      hairstyle: "messy_bun",
      expression: "laughing",
      clothing_category: "home_casual",
      selfie_type: "propped_phone",
    });
    expect(p).toContain("Pose: sitting cross legged.");
    expect(p).toContain("Framing: waist up.");
    expect(p).toContain("Hairstyle: messy bun.");
    expect(p).toContain("Her expression: laughing.");
    expect(p).toContain("Clothing: home casual.");
    expect(p).toContain("propped on a table or counter");
  });

  it("object photos never include Tess's identity text", () => {
    const p = buildImagePrompt("object", "a burnt tray of short ribs on the stove", null);
    expect(p).not.toContain("Tess Morgan reference");
    expect(p).toContain("No people's faces visible");
  });

  it("describes Mabel only when the scene includes her", () => {
    expect(buildImagePrompt("object", "Mabel buried in a blanket", null)).toContain(
      "scruffy medium-sized brown-and-white",
    );
    expect(buildImagePrompt("object", "a latte on a table", null)).not.toContain("Mabel");
  });

  it("selfie types fall back to arm's-length front camera", () => {
    expect(buildImagePrompt("casual_selfie", "Tess in the snow", null)).toContain(
      "front-camera selfie",
    );
    expect(buildImagePrompt("tess_candid", "Tess laughing at trivia", null)).toContain(
      "rather than reflexively making a centered chest-up front-camera selfie",
    );
  });

  it("type classification is unchanged", () => {
    expect(includesTess("object")).toBe(false);
    expect(includesTess("intimate_selfie")).toBe(true);
    expect(sceneHasMabel("walking the dog")).toBe(false);
    expect(sceneHasMabel("a foster puppy at the clinic")).toBe(false);
    expect(sceneHasMabel("coffee shop")).toBe(false);
  });
});

describe("casual phone realism preserves identity and explicit scene", () => {
  it("adds conditional camera/portrait guidance to a walk selfie without mandating camera defects", () => {
    const p = buildImagePrompt("casual_selfie", "Tess walking outdoors in Blair County", "amused", {
      hairstyle: "loose curls",
      clothing_category: "brown wool coat",
      crop_type: "waist_up",
    });
    expect(p).toContain("CASUAL PHONE CAPTURE");
    expect(p).toContain("not an influencer campaign");
    expect(p).toContain("Bright daylight can be clean and detailed");
    expect(p).toContain("No blanket grain, fake compression blocks");
    expect(p).toContain("never compulsory");
    expect(p).toContain("natural groups and overlapping strands");
    expect(p).toContain("Eye catchlights should be consistent with the actual ambient light");
    expect(p).toContain("Clothing: brown wool coat");
    expect(p).toContain("Hairstyle: loose curls");
    expect(p.indexOf("canonical Tess Morgan reference")).toBeLessThan(p.indexOf("PORTRAIT DETAIL"));
  });
  it("does not seed a specific skyline or turn an object/travel photo into a portrait", () => {
    const p = buildImagePrompt("object", "a coastal view during an established Iceland trip", null);
    expect(p).toContain("scene's established location");
    expect(p).not.toContain("in a mid-sized Pennsylvania city");
    expect(p).toContain("explicit travel scenes take precedence");
    expect(p).toContain("No people's faces visible");
    expect(p).not.toContain("PORTRAIT DETAIL");
    expect(p).not.toContain("Central Park");
    expect(p).not.toContain("Mabel");
  });
  it("keeps another character's canonical identity and requested mirror composition", () => {
    const p = buildImagePrompt(
      "personal_selfie",
      "Maya in her entryway",
      null,
      { selfie_type: "mirror", camera_angle: "eye_level", hairstyle: "ponytail" },
      {
        key: "maya",
        name: "Maya Reynolds",
        age: 31,
        pronouns: "she/her",
        appearance: "unused approximation",
      },
    );
    expect(p).toContain("canonical Maya Reynolds reference");
    expect(p).not.toContain("canonical Tess Morgan reference");
    expect(p).toContain("Hairstyle: ponytail");
    expect(p).toContain("mirror");
    expect(p).toContain("Unless explicit scene/camera directions say otherwise");
    expect(p).toContain("Do not change curls, cut, color or hairstyle");
  });
  it("retains non-explicit mature restrictions while sharing phone realism", () => {
    const p = buildImagePrompt("mature_romantic", "an adult in opaque sleepwear at home", null);
    expect(p).toContain("No nudity");
    expect(p).toContain("CASUAL PHONE CAPTURE");
    expect(p).toContain("PORTRAIT DETAIL");
  });
});
