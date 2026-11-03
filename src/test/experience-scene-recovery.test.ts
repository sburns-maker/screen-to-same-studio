import { describe, expect, it } from "vitest";
import {
  initialScene,
  replayScene,
  sceneContradiction,
  sceneNeedsReconcile,
  transitionScene,
  type LiveScene,
} from "@/lib/experience-scene";
import { experienceStarters } from "@/lib/experience-suggestions";

const bar = () => initialScene("maya", "bar:4ds", "4D's Lounge");
const outside: LiveScene = {
  ...initialScene("maya", "home:maya", "Maya's home"),
  locationKind: "home",
  area: "outside",
  activity: "arriving",
};
const moments = [
  "I slip my arm around her as we head outside and wait for our ride.",
  "The ride arrives, and we climb in together. A little while later, we pull up outside her place. I step out and offer her my hand.",
  "I grab your hand and follow you to the couch.",
  "We walk through the front door into her house, close the door behind us, and head into the living room. I sit beside her on the couch as she starts the mystery movie.",
].map((body, i) => ({ id: `m${i}`, source: "user", body }));

describe("live scene location recovery", () => {
  it("bar-to-home travel arrives outside Maya's home", () => {
    const r = replayScene(bar(), moments.slice(0, 2), "maya", "Maya");
    expect(r.scene).toMatchObject({ locationKey: "home:maya", area: "outside" });
  });
  it("front-door entry moves the scene inside instead of back to the doorstep", () => {
    const s = transitionScene(outside, "We walk through the front door into her house.", "maya", "Maya")!;
    expect(s.area).not.toMatch(/outside|front door/);
  });
  it("natural entry phrases count", () => {
    for (const t of ["We go inside.", "I follow her to the couch.", "We sit down in the living room."])
      expect(transitionScene(outside, t, "maya", "Maya")?.area, t).not.toMatch(/outside|front door/);
  });
  it("hypothetical entry does not move anyone", () => {
    expect(transitionScene(outside, "Want to go inside?", "maya", "Maya")).toBeNull();
    expect(transitionScene(outside, "Let's go inside.", "maya", "Maya")).toBeNull();
  });
  it("living-room and movie-start transitions", () => {
    const r = replayScene(bar(), moments, "maya", "Maya");
    expect(r.scene).toMatchObject({ area: "living room (couch)", activity: "watching_movie" });
  });
  it("mentioning the front door while indoors does not regress location", () => {
    const inside = { ...outside, area: "living room", activity: "watching_movie" as const };
    expect(transitionScene(inside, "I glance at the front door and smile.", "maya", "Maya")).toBeNull();
  });
  it("a stale persisted scene is detected for reconciliation on resume/refresh", () => {
    const r = replayScene(bar(), moments, "maya", "Maya");
    expect(sceneNeedsReconcile(outside, r.scene)).toBe(true);
    expect(sceneNeedsReconcile(r.scene, r.scene)).toBe(false);
    expect(r.evidence).toBe("m3");
  });
  it("character narration alone is never evidence", () => {
    const r = replayScene(outside, [{ id: "c", source: "character", body: "We walk inside and sit on the couch." }], "maya", "Maya");
    expect(r.evidence).toBeNull();
  });
  it("rejects contradictory front-door dialogue once inside", () => {
    const inside = { ...outside, area: "living room (couch)", activity: "watching_movie" as const };
    expect(sceneContradiction(inside, "I pause at the front step, smiling at your confidence.")).toBe(true);
    expect(sceneContradiction(inside, "Come on—let's get inside and see if you can follow this plot.")).toBe(true);
    expect(sceneContradiction(inside, "I lean into you on the couch.")).toBe(false);
  });
  it("character can still decide to end the night and walk out", () => {
    const inside = { ...outside, area: "living room", activity: "relaxing" as const };
    expect(sceneContradiction(inside, "I want to call it a night here.")).toBe(false);
    expect(transitionScene(inside, "We walk back outside to the porch.", "maya", "Maya")?.area).toBe("front door (outside)");
  });
  it("suggestions follow the authoritative indoor scene, not 'Go inside?'", () => {
    const labels = experienceStarters("arriving", { locationKind: "home", area: "living room" }).map((x) => x.label);
    expect(labels).not.toContain("Go inside?");
    expect(experienceStarters("arriving", { locationKind: "home", area: "outside" }).map((x) => x.label)).toContain("Go inside?");
  });
});
