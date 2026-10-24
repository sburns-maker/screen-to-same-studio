import { describe, expect, it } from "vitest";
import { TOWN_PLACES, placeOpen } from "@/lib/town";
import { placeByKey, venueFromText } from "@/lib/place-registry";
const lounge = TOWN_PLACES.find((p) => p.key === "bar:4ds")!;
// 2026-10-24 is a Saturday; Eastern is UTC-4.
const at = (iso: string) => new Date(iso);
describe("4D's Lounge", () => {
  it("is a bar with the supplied address", () => {
    expect(placeByKey("bar:4ds")).toMatchObject({ label: "4D's Lounge", kind: "bar", address: "1801 Logan Avenue, Altoona, PA" });
  });
  it("is open Saturday 4 PM to 2 AM", () => {
    expect(placeOpen(lounge, at("2026-10-24T19:59:00Z"))).toBe(false); // 3:59 PM
    expect(placeOpen(lounge, at("2026-10-24T20:00:00Z"))).toBe(true); // 4 PM
    expect(placeOpen(lounge, at("2026-10-25T05:30:00Z"))).toBe(true); // 1:30 AM
    expect(placeOpen(lounge, at("2026-10-25T06:00:00Z"))).toBe(false); // 2 AM
  });
  it("is recognized in chat for dates", () => {
    expect(venueFromText("Drinks at 4D's tonight?").map((p) => p.key)).toEqual(["bar:4ds"]);
    expect(venueFromText("meet at 4ds lounge at 9").map((p) => p.key)).toEqual(["bar:4ds"]);
  });
});
