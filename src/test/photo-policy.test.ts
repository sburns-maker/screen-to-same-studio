import { describe, expect, it } from "vitest";
import { CHARACTERS } from "@/lib/characters";
import { SEED_STATE } from "@/lib/tess-logic";
import { eligiblePhotos } from "@/lib/tess-photos";
import { photoCapabilities, eligiblePhotoCategories, willingPhotoAllowed, nextPhotoBoundary, safePhotoScene, type PhotoContext } from "@/lib/photo-policy";

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
  it("attraction alone does not establish romantic intent", () => {
    expect(eligiblePhotoCategories({ ...romantic, romantic_intent: 0 }, { ...context, matureEnabled: true })).not.toContain("mature_romantic");
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
  it("explicit and unverified lingerie scenes are rejected", () => {
    for (const scene of ["nude portrait", "topless", "sheer lingerie", "boudoir", "teenager portrait"]) expect(safePhotoScene(scene)).toBe(false);
    expect(safePhotoScene("adult in opaque elegant sleepwear" )).toBe(true);
  });
  it("Tess curated couch photo still permits genuine platonic closeness", () => {
    expect(eligiblePhotos(close).map(p => p.id)).toContain("selfie-couch");
    expect(eligiblePhotos(SEED_STATE).map(p => p.id)).toEqual(["mabel-sock", "mabel-walk", "trivia-sheet", "coffee"]);
  });
});