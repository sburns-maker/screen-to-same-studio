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

import { applyDelta as _ad, deriveStage as _ds, SEED_STATE as _seed } from "@/lib/tess-logic";
describe("relationship progression realism", () => {
  const z = () => Object.fromEntries(Object.keys(_seed).map((k) => [k, 0])) as typeof _seed;
  it("gains taper near the cap but meaningful turns still progress", () => {
    const s = { ..._seed, trust: 95, comfort: 40 };
    const d = { ...z(), trust: 3, comfort: 3 };
    const n = _ad(s, d);
    expect(n.trust).toBe(96);
    expect(n.comfort).toBe(43);
  });
  it("negative deltas apply in full even at high scores", () => {
    const n = _ad({ ..._seed, trust: 95 }, { ...z(), trust: -4 });
    expect(n.trust).toBe(91);
  });
  it("rounds and clamps to 0..100", () => {
    expect(_ad({ ..._seed, trust: 2 }, { ...z(), trust: -6 }).trust).toBe(0);
    expect(_ad({ ..._seed, comfort: 99 }, { ...z(), comfort: 6 }).comfort).toBe(100);
  });
  it("dynamic states cool on flat turns; durable ones do not decay", () => {
    const n = _ad({ ..._seed, playfulness: 100, curiosity: 90, trust: 90, romantic_attraction: 80 }, z());
    expect(n.playfulness).toBe(99);
    expect(n.curiosity).toBe(89);
    expect(n.trust).toBe(90);
    expect(n.romantic_attraction).toBe(80);
  });
  it("dating stages require romantic intent, not attraction alone", () => {
    const s = { ..._seed, romantic_attraction: 90, trust: 90, emotional_intimacy: 90, curiosity: 90, comfort: 90, romantic_intent: 0 };
    expect(_ds(s)).toBe("Mutual romantic curiosity");
    expect(_ds({ ...s, romantic_intent: 30 })).toBe("Early dating");
    expect(_ds({ ...s, romantic_intent: 70 })).toBe("Established relationship");
  });
});
