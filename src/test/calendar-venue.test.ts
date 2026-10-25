import { describe, expect, it } from "vitest";
import { resolveCalendarVenue } from "@/lib/calendar-venue";

const venues = [
  { key: "park:local", label: "Juniper Commons" },
  { key: "coffee:local", label: "Switchyard Coffee" },
];
describe("registered calendar venues", () => {
  it("resolves Tess's Juniper Commons action", () => {
    expect(resolveCalendarVenue("Juniper Commons", venues)).toBe("park:local");
  });
  it("resolves Riley's Switchyard Coffee action", () => {
    expect(resolveCalendarVenue("  SWITCHYARD   Coffee  ", venues)).toBe("coffee:local");
  });
  it("preserves canonical keys", () => {
    expect(resolveCalendarVenue("park:local", venues)).toBe("park:local");
  });
  it("does not invent keys for unknown venues", () => {
    expect(resolveCalendarVenue("Imaginary Cafe", venues)).toBe("Imaginary Cafe");
  });
  it("does not guess between duplicate labels", () => {
    expect(resolveCalendarVenue("Juniper Commons", [...venues, { key: "park:other", label: "Juniper Commons" }])).toBe("Juniper Commons");
  });
});