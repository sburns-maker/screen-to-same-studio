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
it("shares strict conversation scheduling validation for DST gaps, folds and invalid dates", () => {
  for (const [date, time] of [
    ["2027-03-14", "02:30"],
    ["2026-11-01", "01:30"],
    ["2026-02-30", "14:00"],
    ["2026-10-25", "25:00"],
  ])
    expect(() => easternInstant(date!, time!)).toThrow("unambiguous");
  expect(easternInstant("2027-03-14", "03:30").toISOString()).toBe("2027-03-14T07:30:00.000Z");
  expect(easternInstant("2026-11-01", "02:30").toISOString()).toBe("2026-11-01T07:30:00.000Z");
});
