import { describe, it, expect } from "vitest";
import { initialScene, transitionScene, sceneContradiction } from "@/lib/experience-scene";
import {
  photoContextConflicts,
  photoContextForSchedule,
  activeCommitment,
} from "@/lib/calendar-commitment";
import { photoLocation } from "@/lib/photo-personality";
import { photoOpportunity } from "@/lib/photo-opportunities";
import { SEED_STATE } from "@/lib/tess-logic";
describe("grounded live scene continuity", () => {
  it("commits performed actions even when the same message asks about a next step", () => {
    const s = initialScene("riley", "diner:valley", "Valley Table");
    expect(
      transitionScene(
        s,
        "We arrive at your house. Can I walk you to your front door?",
        "riley",
        "Riley",
      ),
    ).toMatchObject({ locationKey: "home:riley", activity: "arriving", area: "outside" });
  });
  it("tracks park → restaurant → car → home without changing calendar provenance", () => {
    let scene = initialScene("riley", "park:local", "Juniper Commons");
    for (const [text, key, activity] of [
      ["We finished the walk and drive to Valley Table.", "vehicle:current", "driving"],
      ["We arrive at Valley Table.", "diner:valley", "arriving"],
      ["We order dinner.", "diner:valley", "ordering"],
      ["We've finished dinner.", "diner:valley", "finished_meal"],
      ["We get back in the car and I drive you home.", "vehicle:current", "driving"],
      ["We arrive at your house.", "home:riley", "arriving"],
      ["I walk you to your front door.", "home:riley", "at_front_door"],
    ]) {
      scene = transitionScene(scene, text!, "riley", "Riley") ?? scene;
      expect(scene.locationKey).toBe(key);
      expect(scene.activity).toBe(activity);
    }
    expect(scene.area).toBe("front door (outside)");
    expect(scene.participants).toEqual(["user", "riley"]);
    expect(sceneContradiction(scene, "Riley smiles as we walk along the park path.")).toBe(true);
    expect(sceneContradiction(scene, "Earlier, we walked along the park path.")).toBe(false);
    expect(
      sceneContradiction(scene, "She smiles at her front door as a breeze moves the trees."),
    ).toBe(false);
  });
  it.each([
    "Want to go back to Juniper Commons?",
    "Let's go back to Juniper Commons.",
    "Remember when we arrived at Juniper Commons?",
    "We haven't arrived at Juniper Commons yet.",
  ])("does not turn a proposal or memory into arrival: %s", (text) => {
    expect(
      transitionScene(
        { ...initialScene("riley", "home:riley", "Riley's home"), locationKind: "home" },
        text,
        "riley",
        "Riley",
      ),
    ).toBeNull();
  });
  it("permits an explicit real return to the park", () => {
    const home = { ...initialScene("riley", "home:riley", "Riley's home"), locationKind: "home" };
    expect(
      transitionScene(home, "We arrive back at Juniper Commons.", "riley", "Riley")?.locationKey,
    ).toBe("park:local");
  });
});
describe("photo blocker regressions", () => {
  const detail =
    "weekend, relaxed; she is off today, even though there is an unresolved workplace storyline";
  const schedule = { activity: "free (weekend)", detail, availability: "free" as const };
  it("does not classify a stale workplace disclaimer as physical work or block itself", () => {
    expect(photoContextConflicts(schedule, detail)).toBe(false);
    expect(photoLocation(detail)).not.toBe("work");
    expect(photoContextForSchedule(schedule, "A rota problem at the clinic")).not.toContain(
      "workplace",
    );
  });
  it("allows the screenshot opportunity to reach character choice without forcing a photo", () => {
    const result = photoOpportunity({
      character: "tess" as const,
      conversationId: "test",
      now: new Date("2026-10-25T18:00Z"),
      schedule,
      state: { ...SEED_STATE, comfort: 65, trust: 60, curiosity: 65 },
      frequency: "normal",
      eligibleTypes: ["casual_selfie"],
      lastPhotoAt: null,
      ownSinceLastPhoto: 99,
      gapHours: 3,
      context: detail,
      preview: true,
    });
    expect(result.eligible).toBe(true);
    expect(result.selected).toBe(true);
  });
  it("still rejects actual incompatible work scenes and keeps negated work out of outing photography", () => {
    expect(photoContextConflicts(schedule, "A selfie at the clinic office")).toBe(true);
    expect(photoLocation("At home, off work; not at any workplace.")).toBe("home");
  });
  it("does not restore the removed schedule/storyline veto when merging newer photo changes", () => {
    expect(
      photoOpportunity({
        character: "tess",
        conversationId: "merged-context",
        now: new Date("2026-10-25T18:00Z"),
        schedule,
        state: { ...SEED_STATE, comfort: 65, trust: 60, curiosity: 65 },
        frequency: "normal",
        eligibleTypes: ["casual_selfie"],
        lastPhotoAt: null,
        ownSinceLastPhoto: 99,
        gapHours: 3,
        context: "An unresolved clinic staffing story",
        preview: true,
      }).eligible,
    ).toBe(true);
  });
  it("live home state overrides an old park calendar title in photography context", () => {
    const home = {
      ...initialScene("riley", "home:riley", "Riley's home"),
      locationKind: "home",
      area: "front door (outside)",
      activity: "at_front_door" as const,
    };
    const c = activeCommitment(
      "riley",
      [
        {
          id: "walk",
          title: "A walk",
          organizer: "riley",
          status: "in_progress",
          starts_at: "2026-10-24T21:00Z",
          ends_at: "2026-10-24T23:00Z",
          place_key: "park:local",
        },
      ],
      [
        {
          plan_id: "walk",
          state: "interactive",
          updated_at: "2026-10-24T22:00Z",
          synced_at: null,
          live_scene: home,
        },
      ],
      new Date("2026-10-24T22:00Z"),
    )!;
    expect(c.detail).toContain("Riley's home");
    expect(photoLocation(c.detail)).toBe("home");
    expect(c.detail).not.toContain("A walk");
  });
  it("keeps sensitive private situations blocked while allowing an ordinary selfie at her own home", () => {
    const request = {
      character: "tess" as const,
      conversationId: "privacy-test",
      now: new Date("2026-10-25T18:00Z"),
      state: { ...SEED_STATE, comfort: 65, trust: 60, curiosity: 65 },
      frequency: "normal" as const,
      eligibleTypes: ["casual_selfie"],
      lastPhotoAt: null,
      ownSinceLastPhoto: 99,
      gapHours: 3,
      context: "a quiet moment",
      preview: true,
    };
    expect(
      photoOpportunity({
        ...request,
        schedule: {
          activity: "at home",
          detail: "relaxing in her private home",
          availability: "free",
        },
      }).eligible,
    ).toBe(true);
    expect(
      photoOpportunity({
        ...request,
        schedule: {
          activity: "private appointment",
          detail: "a private consultation",
          availability: "limited",
        },
      }).eligible,
    ).toBe(false);
  });
});
