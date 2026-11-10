import { describe, expect, it } from "vitest";
import { placeByKey, venueFromText } from "@/lib/place-registry";
import { resolveCalendarVenue } from "@/lib/calendar-venue";
import { initialScene } from "@/lib/experience-scene";

describe("fictional maternity event venue", () => {
  it("supports the owner's 8 PM Eastern visit without closing before midnight", () => {
    const venue = placeByKey("medical:maternity");
    expect(venue?.opens).toBe(0);
    expect(venue?.closes).toBe(24);
    expect(venue?.eventCategories).toContain("meetup");
  });
  it("resolves the hospital name to the same stable calendar and scene key", () => {
    const venue = placeByKey("medical:maternity");
    if (!venue) throw new Error("Maternity venue missing");
    expect(resolveCalendarVenue("Altoona Maternity Center", [venue])).toBe("medical:maternity");
    expect(venueFromText("We arrived at Altoona Maternity Center").map(p => p.key)).toEqual(["medical:maternity"]);
    expect(initialScene("tess", venue.key, venue.label).participants).toEqual(["user", "tess"]);
    expect(initialScene("tess", venue.key, venue.label).locationKey).toBe("medical:maternity");
  });
});