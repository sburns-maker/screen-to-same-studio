import { describe, expect, it } from "vitest";
import { initialScene, transitionScene } from "@/lib/experience-scene";
import { experienceStarters } from "@/lib/experience-suggestions";
describe("free-form park outing activity transitions", () => {
  const park = { ...initialScene("tess", "park:test", "The park"), locationKind: "park" };
  it("records sitting together as an activity without moving locations", () => {
    const next = transitionScene(park, "I sit on the bench beside Tess.", "tess", "Tess");
    expect(next?.activity).toBe("sitting");
    expect(next?.locationKey).toBe(park.locationKey);
    expect(next?.area).toBe("park bench");
  });
  it("does not turn an invitation into an action", () => {
    expect(transitionScene(park, "Want to sit on that bench?", "tess", "Tess")).toBeNull();
  });
  it("resumes walking after leaving the bench", () => {
    const seated = { ...park, activity: "sitting" as const, area: "park bench" };
    const next = transitionScene(seated, "I stand up from the bench.", "tess", "Tess");
    expect(next?.activity).toBe("walking");
    expect(next?.area).toBe("");
  });
  it("keeps an invitation to coffee optional", () => {
    expect(experienceStarters("walking").some(x => x.label === "Suggest coffee")).toBe(true);
    expect(experienceStarters("sitting").some(x => x.label === "Walk again")).toBe(true);
    expect(transitionScene(park, "Would you like to stop for coffee?", "tess", "Tess")).toBeNull();
  });
});
