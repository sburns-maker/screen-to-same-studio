import { describe, expect, it } from "vitest";
import { homeMoments } from "@/lib/home-moments";
import type { HousingHome, HousingSnapshot } from "@/lib/housing";

const home: HousingHome = {
  id: "home-one", key: "home:tess", label: "Tess's Townhouse",
  kind: "home", community: "Altoona", housingType: "townhouse",
  arrangement: "renting", description: "A lived-in townhouse",
  latitude: 40.5, longitude: -78.4, address: null, exact: false,
  canEdit: false, canVisit: false, canPlan: false,
  primaryFor: ["tess"], provisional: false,
};
const snapshot = { members: [
  { person_key: "tess", label: "Tess", homeLabel: home.label, residence_id: home.id, kind: "primary", relation: "individual", expires_at: null },
] } as HousingSnapshot;

describe("home moment suggestions respect housing permissions", () => {
  it("does not offer photo requests for an uninvited private residence", () => {
    expect(homeMoments(home, snapshot, "riley").some(m => m.id === "photo")).toBe(false);
    expect(homeMoments(home, snapshot, "riley").some(m => m.id === "mabel")).toBe(false);
  });
  it("offers Tess and Mabel context when already established as living there", () => {
    expect(homeMoments(home, snapshot, "tess").some(m => m.id === "mabel")).toBe(true);
  });
  it("offers photo conversation starters only for homes available to visit", () => {
    const ideas = homeMoments({ ...home, canVisit: true }, snapshot, "tess");
    expect(ideas.some(m => m.id === "photo")).toBe(true);
    expect(ideas.find(m => m.id === "photo")?.suggestion).toContain("If you're home");
  });
  it("offers direct invitation and decorating actions in the player's own home", () => {
    const mine = { ...home, key: "home:user", primaryFor: ["user"], canVisit: true };
    const ideas = homeMoments(mine, { members: [] } as HousingSnapshot, undefined);
    expect(ideas.some(m => m.id === "invite")).toBe(true);
    expect(ideas.some(m => m.id === "myphoto")).toBe(true);
    expect(ideas.some(m => m.id === "cook")).toBe(true);
  });
  it("does not treat a photo of Tess's home as a photo of the player's home", () => {
    const mine = { ...home, key: "home:user", primaryFor: ["user"], canVisit: true };
    expect(homeMoments(mine, { members: [] } as HousingSnapshot, undefined)
      .some(m => m.id === "photo")).toBe(false);
  });

});
