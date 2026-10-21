import { describe, expect, it } from "vitest";
import { SEED_STATE, applyDelta, clampDelaySeconds, deriveStage, sanitizeDelta } from "@/lib/tess-logic";

describe("tess logic", () => {
  it("starts newly acquainted with the seed values", () => {
    expect(SEED_STATE.comfort).toBe(42);
    expect(SEED_STATE.curiosity).toBe(52);
    expect(deriveStage(SEED_STATE)).toBe("Newly acquainted");
  });

  it("clamps per-turn deltas to ±6 on realistic", () => {
    const d = sanitizeDelta({ trust: 40, irritation: -30 }, "realistic");
    expect(d.trust).toBe(6);
    expect(d.irritation).toBe(-6);
  });

  it("keeps values inside 0–100", () => {
    const s = applyDelta({ ...SEED_STATE, irritation: 0, trust: 99 }, sanitizeDelta({ irritation: -6, trust: 6 }, "realistic"));
    expect(s.irritation).toBe(0);
    expect(s.trust).toBe(100);
  });

  it("guarded slows trust gains", () => {
    expect(sanitizeDelta({ trust: 5 }, "guarded").trust).toBe(3);
  });

  it("high trust with low attraction is platonic friendship", () => {
    expect(deriveStage({ ...SEED_STATE, trust: 70, comfort: 70, romantic_attraction: 15 })).toBe("Platonic friendship");
  });

  it("high irritation fades the connection", () => {
    expect(deriveStage({ ...SEED_STATE, irritation: 75 })).toBe("Connection faded");
  });

  it("reply delays stay between 3 seconds and 4 minutes", () => {
    expect(clampDelaySeconds(1)).toBe(3);
    expect(clampDelaySeconds(3600)).toBe(240);
  });
});
