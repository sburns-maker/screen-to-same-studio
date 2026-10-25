import { describe, it, expect } from "vitest";
import { easternInstant } from "@/lib/plan-edit";
describe("easternInstant", () => {
  it("Mon Oct 26 2026 7:00 AM ET is 11:00 UTC (EDT)", () => {
    expect(easternInstant("2026-10-26", "07:00").toISOString()).toBe("2026-10-26T11:00:00.000Z");
  });
  it("uses EST after DST ends", () => {
    expect(easternInstant("2026-11-09", "07:00").toISOString()).toBe("2026-11-09T12:00:00.000Z");
  });
});
