import { describe, it, expect } from "vitest";
import { applyDisruption, disruptionFor } from "@/lib/daily-disruptions";

describe("daily disruptions", () => {
  it("is deterministic for the same character and time", () => {
    const t = new Date("2026-10-20T15:00:00Z");
    expect(disruptionFor("ben", t, true)).toEqual(disruptionFor("ben", t, true));
  });
  it("varies across 30 days and stays occasional", () => {
    const ids = new Set<string>(); let hits = 0;
    for (let d = 0; d < 30; d++) {
      const x = disruptionFor("tess", new Date(Date.UTC(2026, 9, 1 + d, 15)), true);
      if (x) { hits++; ids.add(x.id); }
    }
    expect(ids.size).toBeGreaterThan(1);
    expect(hits).toBeLessThan(20);
  });
  it("never wakes a sleeping character", () => {
    const base = { availability: "asleep" as const, detail: "asleep" };
    expect(applyDisruption(base, { id: "x", detail: "y", availability: "busy", block: "off" })).toBe(base);
  });
});
