import { describe, expect, it } from "vitest";
import { CHARACTERS } from "@/lib/characters";
import { SEED_STATE } from "@/lib/tess-logic";
import { eligiblePhotos } from "@/lib/tess-photos";
import { photoCapabilities, eligiblePhotoCategories, willingPhotoAllowed, photoDecisionReason, nextPhotoBoundary, safePhotoScene, photoSceneBoundaryIssue, PhotoSceneBoundaryError, type PhotoContext } from "@/lib/photo-policy";

const context: PhotoContext = { age: 35, enabled: true, romanticCapable: true,
  supported: CHARACTERS.claire.photoTypes, matureEnabled: false, boundary: "none" };
const close = { ...SEED_STATE, comfort: 80, trust: 80, emotional_intimacy: 80,
  romantic_attraction: 0, physical_attraction: 0, romantic_intent: 0 };
const romantic = { ...close, romantic_attraction: 70, romantic_intent: 60 };

describe("photo autonomy and boundaries", () => {
  it("all adult women share underlying capabilities", () => {
    for (const key of ["tess", "maya", "claire", "jordan"] as const) {
      expect(photoCapabilities({ ...context, supported: CHARACTERS[key].photoTypes })).toEqual(photoCapabilities(context));
    }
  });
  it("unlocks everyday candid and casual selfies before private photo milestones", () => {
    // Kendra's seed state is comfortable and curious, but still low on trust.
    // A normal selfie does not require her to have reached romantic interest.
    const early = { ...SEED_STATE, comfort: 52, trust: 24, romantic_attraction: 0, romantic_intent: 0 };
    const categories = eligiblePhotoCategories(early, {
      ...context, supported: CHARACTERS.kendra.photoTypes, matureEnabled: true,
    });
    expect(categories).toEqual(["object", "tess_candid", "casual_selfie"]);
    expect(categories).not.toContain("personal_selfie");
    expect(categories).not.toContain("mature_romantic");
    expect(categories).not.toContain("suggestive");
    expect(eligiblePhotos(early).map((p) => p.id)).toContain("selfie-work");
  });
  it("keeps basic familiarity, consent, and boundaries for ordinary selfies", () => {
    const barelyKnown = { ...SEED_STATE, comfort: 44, trust: 24 };
    expect(eligiblePhotoCategories(barelyKnown, context)).toEqual(["object"]);
    const acquainted = { ...barelyKnown, comfort: 45, trust: 20 };
    expect(eligiblePhotoCategories(acquainted, context)).toContain("casual_selfie");
    expect(eligiblePhotoCategories(acquainted, { ...context, boundary: "selfies" })).toEqual(["object"]);
    expect(eligiblePhotoCategories(acquainted, { ...context, enabled: false })).toEqual([]);
    expect(willingPhotoAllowed({
      type: "casual_selfie", willing: false, contextual: true, framing: "ordinary",
      eligible: ["casual_selfie"], state: acquainted, context,
    })).toBe(false);
    expect(eligiblePhotoCategories({ ...acquainted, irritation: 20 }, context)).toEqual(["object"]);
  });
  it("treats dressed-up public selfies as ordinary rather than romantic rewards", () => {
    const dressedUp = { ...SEED_STATE, comfort: 55, trust: 35,
      romantic_attraction: 0, romantic_intent: 0 };
    expect(eligiblePhotos(dressedUp).map((p) => p.id)).toContain("selfie-out");
    expect(eligiblePhotoCategories(dressedUp, { ...context, matureEnabled: true })).not.toContain("mature_romantic");
    expect(eligiblePhotoCategories(dressedUp, { ...context, matureEnabled: true })).not.toContain("suggestive");
  });
  it("close platonic friendship permits personal photography", () => {
    expect(eligiblePhotoCategories(close, context)).toContain("personal_selfie");
  });
  it("emotional intimacy permits ordinary intimate selfies without attraction", () => {
    expect(eligiblePhotoCategories(close, context)).toContain("intimate_selfie");
  });
  it("mature photography is disabled by default", () => {
    expect(eligiblePhotoCategories(romantic, context)).not.toContain("mature_romantic");
  });
  it("opt-in with developed romance permits consideration", () => {
    expect(eligiblePhotoCategories(romantic, { ...context, matureEnabled: true })).toContain("mature_romantic");
  });
  it("keeps the separate nude category disabled without BOTH adult verification and opt-in", () => {
    const opts = { ...context, matureEnabled: true };
    expect(eligiblePhotoCategories(romantic, opts)).not.toContain("mature_nude");
    expect(eligiblePhotoCategories(romantic, { ...opts, nudeEnabled: true })).not.toContain("mature_nude");
    expect(eligiblePhotoCategories(romantic, { ...opts, adultVerified: true })).not.toContain("mature_nude");
    expect(eligiblePhotoCategories(romantic, { ...opts, adultVerified: true, nudeEnabled: true })).toContain("mature_nude");
    expect(eligiblePhotoCategories(romantic, { ...opts, adultVerified: true, nudeEnabled: true, boundary: "mature" })).not.toContain("mature_nude");
    expect(eligiblePhotoCategories(romantic, { ...opts, adultVerified: true, nudeEnabled: true, age: 17 })).not.toContain("mature_nude");
  });
  it("attraction alone does not establish romantic intent", () => {
    expect(eligiblePhotoCategories({ ...romantic, romantic_intent: 0 }, { ...context, matureEnabled: true })).not.toContain("mature_romantic");
  });
  it("diagnoses ordinary messy-hair selfies without treating them as romantic", () => {
    const args = { type: "casual_selfie" as const, willing: true, contextual: true,
      framing: "ordinary" as const, eligible: ["casual_selfie"], state: close, context };
    expect(photoDecisionReason(args)).toBeNull();
    expect(photoDecisionReason({ ...args, eligible: ["object"] })).toContain("not eligible");
    expect(photoDecisionReason({ ...args, willing: false })).toContain("did not consent");
    expect(photoDecisionReason({ ...args, contextual: false })).toContain("contextual");
    expect(photoDecisionReason({ ...args, context: { ...context, boundary: "selfies" as const } })).toContain("boundary");
    expect(photoDecisionReason({ ...args, framing: "romantic" })).toContain("romantic framing");
  });
  it("eligibility never guarantees willingness", () => {
    expect(willingPhotoAllowed({ type: "personal_selfie", willing: false, contextual: true, framing: "ordinary",
      eligible: ["personal_selfie"], state: close, context })).toBe(false);
  });
  it("an unnatural photo is not allowed", () => {
    expect(willingPhotoAllowed({ type: "personal_selfie", willing: true, contextual: false, framing: "ordinary",
      eligible: ["personal_selfie"], state: close, context })).toBe(false);
  });
  it("romantic framing requires developed romance separately", () => {
    expect(willingPhotoAllowed({ type: "personal_selfie", willing: true, contextual: true, framing: "romantic",
      eligible: ["personal_selfie"], state: close, context })).toBe(false);
  });
  it("refusal blocks a simultaneous photo regardless of willingness", () => {
    expect(willingPhotoAllowed({ type: "casual_selfie", willing: true, contextual: true, framing: "ordinary",
      eligible: ["casual_selfie"], state: close, context: { ...context, boundary: "selfies" } })).toBe(false);
  });
  it("repeated requests cannot clear a refusal and send in the same turn", () => {
    expect(nextPhotoBoundary("selfies", "reopen", true)).toBe("selfies");
    expect(nextPhotoBoundary("selfies", "unchanged", false)).toBe("selfies");
  });
  it("Ben remains ordinary and strictly platonic", () => {
    const ben = { ...context, romanticCapable: false, supported: CHARACTERS.ben.photoTypes, matureEnabled: true };
    expect(eligiblePhotoCategories(romantic, ben)).toEqual(["object", "tess_candid", "casual_selfie"]);
  });
  it("minors have no photo capability", () => {
    expect(photoCapabilities({ ...context, age: 17 })).toEqual([]);
  });
  it("age ambiguity has no photo capability", () => {
    expect(photoCapabilities({ ...context, age: NaN })).toEqual([]);
  });
  it("pressure suppresses mature portraits", () => {
    expect(eligiblePhotoCategories({ ...romantic, perceived_pressure: 30 }, { ...context, matureEnabled: true })).not.toContain("mature_romantic");
  });
  it("permits adult opaque lingerie descriptions but still rejects explicit or age-ambiguous scenes", () => {
    for (const scene of ["adult in matching bra and panties", "adult in tasteful lingerie", "opaque bralette and robe", "boudoir-style clothed portrait"])
      expect(safePhotoScene(scene)).toBe(true);
    for (const scene of ["nude portrait", "topless", "sheer lingerie", "exposed nipples", "teenager portrait", "sexual activity"])
      expect(safePhotoScene(scene)).toBe(false);
  });
  it("Tess curated couch photo still permits genuine platonic closeness", () => {
    expect(eligiblePhotos(close).map(p => p.id)).toContain("selfie-couch");
    expect(eligiblePhotos(SEED_STATE).map(p => p.id)).toEqual(["mabel-sock", "mabel-walk", "trivia-sheet", "coffee"]);
  });
  it("separates voluntary suggestive eligibility from ordinary and mature portraits", () => {
    const mature = { ...context, matureEnabled: true };
    expect(eligiblePhotoCategories(romantic, mature)).toContain("mature_romantic");
    expect(eligiblePhotoCategories({ ...romantic, romantic_intent: 45 }, mature)).not.toContain("suggestive");
    const ready = { ...romantic, comfort: 85, trust: 80, emotional_intimacy: 75,
      romantic_attraction: 75, romantic_intent: 70 };
    expect(eligiblePhotoCategories(ready, mature)).toContain("suggestive");
    expect(eligiblePhotoCategories(ready, { ...mature, matureEnabled: false })).not.toContain("suggestive");
    expect(eligiblePhotoCategories(ready, { ...mature, boundary: "mature" })).not.toContain("suggestive");
    expect(eligiblePhotoCategories(ready, { ...mature, age: 17 })).not.toContain("suggestive");
    expect(eligiblePhotoCategories({ ...ready, perceived_pressure: 25 }, mature)).not.toContain("suggestive");
    expect(photoDecisionReason({
      type: "suggestive", willing: false, contextual: true, framing: "romantic",
      eligible: ["suggestive"], state: ready, context: mature,
    })).toContain("did not consent");
    expect(photoDecisionReason({
      type: "suggestive", willing: true, contextual: true, framing: "ordinary",
      eligible: ["suggestive"], state: ready, context: mature,
    })).toContain("romantic framing");
  });
  it("identifies the invalid generated field without exposing prompt content", () => {
    const teasing = "I'm at work, and I'd love a confident, playful photo from my girlfriend.";
    expect(photoSceneBoundaryIssue({
      scene: "Riley at home, playful selfie in opaque casual clothes",
      expression: "amused smile",
      caption: teasing,
    })).toBeNull();
    expect(photoSceneBoundaryIssue({
      scene: "Riley at home",
      clothing_category: "sheer fabric",
      expression: "playful",
    })).toEqual({ field: "clothing_category", rule: "photo.scene_content_boundary" });
    expect(photoSceneBoundaryIssue({
      scene: "Riley at home",
      expression: "nude portrait",
      clothing_category: "blue sweater",
    })).toEqual({ field: "expression", rule: "photo.scene_content_boundary" });
    const e = new PhotoSceneBoundaryError("expression");
    expect(e.message).toBe("photo scene outside supported boundaries");
    expect(e.field).toBe("expression");
    expect(JSON.stringify(e)).not.toContain("Riley");
  });

});