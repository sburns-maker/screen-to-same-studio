import { describe, expect, it } from "vitest";
import { SEED_STATE } from "@/lib/tess-logic";
import { eligiblePhotos } from "@/lib/tess-photos";

const ids = (s: typeof SEED_STATE) => eligiblePhotos(s).map((p) => p.id);

describe("tess photos", () => {
  it("sends no selfies at the start", () => {
    expect(eligiblePhotos(SEED_STATE).some((p) => p.selfie)).toBe(false);
    expect(ids(SEED_STATE)).toContain("mabel-sock");
  });
  it("unlocks the couch selfie only with real warmth", () => {
    expect(ids({ ...SEED_STATE, comfort: 70, trust: 60, emotional_intimacy: 30 })).not.toContain("selfie-couch");
    expect(ids({ ...SEED_STATE, comfort: 70, trust: 60, emotional_intimacy: 40 })).toContain("selfie-couch");
  });
  it("sends nothing when she's irritated", () => {
    expect(eligiblePhotos({ ...SEED_STATE, irritation: 45 })).toEqual([]);
  });
});

import { allowedGeneratedTypes, curatedFallback, FREQUENCY_RULES } from "@/lib/tess-photos";

describe("generated photos", () => {
  it("early on only allows object photos, no selfies", () => {
    expect(allowedGeneratedTypes(SEED_STATE)).toEqual(["object"]);
  });
  it("mild irritation removes all selfie types", () => {
    const warm = { ...SEED_STATE, comfort: 80, trust: 80, romantic_attraction: 80, playfulness: 80, emotional_intimacy: 80 };
    expect(allowedGeneratedTypes(warm)).toContain("intimate_selfie");
    expect(allowedGeneratedTypes({ ...warm, irritation: 25 })).toEqual(["object"]);
  });
  it("substantial annoyance means no photos at all", () => {
    expect(allowedGeneratedTypes({ ...SEED_STATE, irritation: 45 })).toEqual([]);
  });
  it("pressure blocks flattering selfies", () => {
    const warm = { ...SEED_STATE, comfort: 80, trust: 80, romantic_attraction: 80, playfulness: 80, emotional_intimacy: 80, perceived_pressure: 35 };
    expect(allowedGeneratedTypes(warm)).not.toContain("personal_selfie");
    expect(allowedGeneratedTypes(warm)).toContain("casual_selfie");
  });
  it("frequent still keeps a cooldown", () => {
    expect(FREQUENCY_RULES.frequent.cooldown).toBeGreaterThanOrEqual(1);
    expect(FREQUENCY_RULES.normal.cooldown).toBe(3);
  });
  it("falls back to a matching curated photo", () => {
    expect(curatedFallback("Mabel stole my sock again", [{ id: "mabel-sock", selfie: false, about: "", min: {} }])).toBe("mabel-sock");
  });
});

import { describeStyle, tooSimilarToRecent, varyStyle, type PhotoStyle } from "@/lib/tess-photos";

const chestUpSelfie: PhotoStyle = {
  pose_type: "standing",
  camera_angle: "front_camera",
  crop_type: "chest_up",
  hairstyle: "half_up",
  expression: "slight_smile",
};

describe("photo style variety", () => {
  it("flags an exact repeat of a recent photo's defining attributes", () => {
    expect(tooSimilarToRecent(chestUpSelfie, [chestUpSelfie])).toBe(true);
  });

  it("does not flag a genuinely different composition", () => {
    expect(tooSimilarToRecent({ ...chestUpSelfie, crop_type: "full_body" }, [chestUpSelfie])).toBe(false);
    expect(tooSimilarToRecent(chestUpSelfie, [])).toBe(false);
  });

  it("ignores incomplete styles rather than guessing", () => {
    expect(tooSimilarToRecent({ pose_type: "standing" }, [chestUpSelfie])).toBe(false);
  });

  it("nudges only exact repeats, leaving contextual choices alone", () => {
    const varied = varyStyle(chestUpSelfie, [chestUpSelfie]);
    expect(tooSimilarToRecent(varied, [chestUpSelfie])).toBe(false);
    expect(varied.expression).toBe("slight_smile");
    const untouched = varyStyle({ ...chestUpSelfie, hairstyle: "messy_bun" }, [chestUpSelfie]);
    expect(untouched.hairstyle).toBe("messy_bun");
  });

  it("describes styles for the reply prompt", () => {
    expect(describeStyle(chestUpSelfie)).toContain("front_camera");
    expect(describeStyle({})).toBe("(unrecorded style)");
  });
});

import { photoMomentHint } from "@/lib/tess-photos";
describe("photoMomentHint", () => {
  it("is silent during cooldown", () => {
    expect(photoMomentHint({ ownSinceLastPhoto: 2, freq: "normal", initiation: false, hasTypes: true })).toBe("");
  });
  it("is silent with no eligible types", () => {
    expect(photoMomentHint({ ownSinceLastPhoto: 99, freq: "normal", initiation: true, hasTypes: false })).toBe("");
  });
  it("nudges after cooldown, with a starter variant on initiation", () => {
    expect(photoMomentHint({ ownSinceLastPhoto: 12, freq: "normal", initiation: false, hasTypes: true })).toContain("PHOTO MOMENT");
    expect(photoMomentHint({ ownSinceLastPhoto: 7, freq: "frequent", initiation: true, hasTypes: true })).toContain("open a text");
  });
});
