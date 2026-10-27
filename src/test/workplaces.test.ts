import { describe, expect, it } from "vitest";
import { WORKPLACES, workplaceFor, workVisitGuidance, workplaceShiftLikely } from "@/lib/workplaces";
import { CHARACTERS, characterAvailability } from "@/lib/characters";
import { TOWN_PLACES } from "@/lib/town";
describe("fictional places of work", () => {
  it("gives every existing contact one uniquely keyed map point", () => {
    const keys = Object.keys(CHARACTERS);
    expect(Object.keys(WORKPLACES).sort()).toEqual(keys.sort());
    expect(new Set(Object.values(WORKPLACES).map(place => place.key)).size).toBe(keys.length);
    for (const key of keys as (keyof typeof CHARACTERS)[]) {
      const place=workplaceFor(key);
      expect(place.label.trim().length).toBeGreaterThan(4);
      expect(Number.isFinite(place.latitude) && Number.isFinite(place.longitude)).toBe(true);
      expect(TOWN_PLACES.some(p => p.key === place.key)).toBe(true);
    }
  });
  it("restricts hospital visits and keeps library visitors in public space", () => {
    expect(WORKPLACES.riley.publicAccess).toBe("restricted");
    expect(WORKPLACES.claire.publicAccess).toBe("lobby");
    const guidance=workVisitGuidance("riley", new Date("2026-10-27T06:00:00Z"));
    expect(guidance).toContain("does not guarantee");
    expect(guidance).toContain("never imply workplace access");
  });
  it("recognizes cross-midnight shifts by the day on which they started", () => {
    expect(workplaceShiftLikely("riley", new Date("2026-10-27T06:00:00Z"))).toBe(true);
    expect(workplaceShiftLikely("riley", new Date("2026-10-27T17:00:00Z"))).toBe(false);
  });

  it("keeps Riley's character availability consistent with her overnight workplace schedule", () => {
    const working = new Date("2026-10-27T06:00:00Z");
    const daytime = new Date("2026-10-27T17:00:00Z");
    expect(workplaceShiftLikely("riley", working)).toBe(true);
    expect(characterAvailability(CHARACTERS.riley, working).availability).toBe("limited");
    expect(workplaceShiftLikely("riley", daytime)).toBe(false);
    expect(characterAvailability(CHARACTERS.riley, daytime).availability).toBe("asleep");
  });
  it("allows every contact real off-shift periods, not 24-hour shifts", () => {
    const dates=Array.from({length:168},(_,i)=>new Date(Date.UTC(2026,9,25)+i*3600000));
    for (const key of Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[]) {
      expect(dates.some(d=>!workplaceShiftLikely(key,d))).toBe(true);
      expect(dates.some(d=>workplaceShiftLikely(key,d))).toBe(true);
    }
  });

  it("preserves plausible off-shift opportunity for every character", () => {
    const dates=Array.from({length:7*24},(_,i)=>new Date(Date.UTC(2026,9,25)+i*3600000));
    for(const key of Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[]) {
      const offHours=dates.filter(d=>!workplaceShiftLikely(key,d));
      expect(offHours.length).toBeGreaterThan(60);
    }
  });

});
