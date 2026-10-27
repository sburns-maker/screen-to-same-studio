import { describe, expect, it } from "vitest";
import { buildImagePrompt, includesTess, sceneHasMabel, classifyImageFailure, ImageProviderFailure, safeProviderErrorFields, spicyFailureDiagnostics } from "@/lib/tess-image.server";

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

  it("selfie categories no longer mandate arm's-length framing", () => {
    expect(buildImagePrompt("casual_selfie", "Tess in the snow", null)).toContain(
      "do not default to a centered arm’s-length portrait",
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

describe("safe image error diagnostics", () => {
  it("classifies provider failures without leaking provider messages", () => {
    const secret = "a potentially sensitive provider response";
    expect(classifyImageFailure(new Error(secret), "provider_generation")).toBe("provider_request_failed");
    expect(classifyImageFailure(new ImageProviderFailure("provider_rate_limited", 429), "provider_generation")).toBe("provider_rate_limited");
    expect(classifyImageFailure(Object.assign(new Error("network timeout"), { name: "TimeoutError" }), "provider_generation")).toBe("provider_timeout");
    expect(classifyImageFailure(new Error("face_structure_drift"), "visual_screen")).toBe("face_structure_drift");
    expect(classifyImageFailure(new Error("unrecognized screening exception"), "visual_screen")).toBe("visual_screen_failed");
    expect(classifyImageFailure(new Error("text provider unavailable"), "text_quality")).toBe("text_quality_check_failed");
    expect(classifyImageFailure(new Error("spicy_quote_invalid"), "provider_generation")).toBe("spicy_quote_invalid");
    expect(classifyImageFailure(new Error("spicy_http_402"), "provider_generation")).toBe("spicy_http_402");
    expect(classifyImageFailure(new Error("spicy private detail"), "provider_generation")).toBe("provider_request_failed");
  });
});

describe("spicy structured diagnostics", () => {
  it("carries quote stage, HTTP status, provider code and request id", () => {
    const e = Object.assign(new Error("spicy_http_402"), { stage: "quote", status: 402, requestId: "req_1", providerCode: "insufficient_credit" });
    expect(spicyFailureDiagnostics(e)).toEqual({ providerStage: "quote", providerHttpStatus: 402, providerRequestId: "req_1", providerError: { code: "insufficient_credit" } });
  });
  it("records the exact local validation rule", () => {
    const e = Object.assign(new Error("spicy_quote_model_mismatch"), { stage: "quote" });
    expect(spicyFailureDiagnostics(e)).toEqual({ providerStage: "quote", localValidationRule: "spicy_quote_model_mismatch" });
    expect(classifyImageFailure(e, "provider_generation")).toBe("spicy_quote_model_mismatch");
  });
  it("ignores unsafe fields and non-spicy errors", () => {
    const e = Object.assign(new Error("spicy_http_400"), { requestId: "bad id https://x", providerCode: "a b" });
    expect(spicyFailureDiagnostics(e)).toEqual({ providerHttpStatus: 400 });
    expect(spicyFailureDiagnostics(new Error("other"))).toEqual({});
  });
});

describe("provider error field privacy", () => {
  it("keeps only safe structured identifiers from HTTP errors", () => {
    expect(safeProviderErrorFields({error:{code:"content_policy_violation",type:"invalid_request_error",param:"prompt",message:"private prompt and sk-secret"}}))
      .toEqual({code:"content_policy_violation",type:"invalid_request_error",param:"prompt"});
    expect(safeProviderErrorFields({error:{code:"unsafe value with secrets",type:"request_error",param:"input[0].image_url"}}))
      .toEqual({type:"request_error"});
    expect(safeProviderErrorFields({error:{message:"don't publish this"}})).toEqual({});
    expect(safeProviderErrorFields(null)).toEqual({});
  });
});
