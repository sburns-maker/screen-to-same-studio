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
