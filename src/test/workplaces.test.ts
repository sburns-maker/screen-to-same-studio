import { describe, expect, it } from "vitest";
import { WORKPLACES, workplaceFor, workVisitGuidance } from "@/lib/workplaces";
import { CHARACTERS } from "@/lib/characters";
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
  it("does not treat hospital or school jobs as unrestricted visits", () => {
    expect(WORKPLACES.riley.publicAccess).toBe("restricted");
    expect(WORKPLACES.claire.publicAccess).toBe("restricted");
    const guidance=workVisitGuidance("riley", new Date("2026-10-27T06:00:00Z"));
    expect(guidance).toContain("does not guarantee");
    expect(guidance).toContain("never imply workplace access");
  });
});
