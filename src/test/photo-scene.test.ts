import { photoContextForSchedule } from "@/lib/calendar-commitment";
import { it, expect } from "vitest";
import { statedScene, photoSceneCheck, sceneVersion } from "@/lib/photo-scene";
import { planPhotography } from "@/lib/photo-personality";
it("extracts actual first-person home and grocery statements rather than hypothetical travel", () => {
  expect(statedScene("I'm at the grocery store.")).toMatchObject({ location: "grocery" });
  expect(
    statedScene("I'm home now. Groceries are away and I'm relaxing on the couch."),
  ).toMatchObject({ location: "home" });
  expect(statedScene("I'm relaxing at home for the evening.")).toEqual({
    location: "home",
    activity: "relaxing at home",
  });
  for (const s of [
    "When I'm home I'll relax.",
    "I'm not at home.",
    "I'm thinking about being at home.",
    "Becca said she's at home.",
  ])
    expect(statedScene(s)).toBeNull();
});
it("uses the exact same location rule for the requested and generated scene with explicit diagnostics", () => {
  const plan = planPhotography({
    character: "tess",
    key: "fixed",
    now: new Date("2026-10-25T18:00Z"),
    schedule: { activity: "relaxing", detail: "at home", availability: "free" },
  });
  expect(photoSceneCheck(plan, "A casual selfie at home", "conversation")).toMatchObject({
    allowed: true,
    canonicalLocation: "home",
    inferredRequestedScene: "home",
    failedRule: null,
  });
  expect(photoSceneCheck(plan, "A selfie at the clinic office", "conversation")).toMatchObject({
    allowed: false,
    canonicalLocation: "home",
    inferredRequestedScene: "clinic",
    failedRule: "photo.location_matches_current_scene",
  });
  expect(
    photoSceneCheck(plan, "A casual selfie in her kitchen with groceries", "conversation").allowed,
  ).toBe(true);
  expect(photoSceneCheck(plan, "A selfie", "conversation").assessment).toBe(
    "location_unspecified_in_request",
  );
  expect(
    photoSceneCheck(
      plan,
      "A casual selfie at home after a busy day at the veterinary clinic",
      "conversation",
    ).inferredRequestedScene,
  ).toBe("home");
  expect(
    photoSceneCheck(plan, "Not at home; a selfie at the clinic office", "conversation")
      .inferredRequestedScene,
  ).toBe("clinic");
  const first = {
    location: "home" as const,
    activity: "relaxing at home",
    sourceId: "one",
    observedAt: "2026-10-25T18:00Z",
    expiresAt: "2026-10-25T22:00Z",
  };
  const schedule = {
    activity: "relaxing at home",
    detail: "at home",
    availability: "free" as const,
  };
  expect(sceneVersion(first, schedule)).toBe(
    sceneVersion({ ...first, sourceId: "a newer identical statement" }, schedule),
  );
  expect(
    photoContextForSchedule(
      {
        activity: "relaxing",
        detail: "Current confirmed physical scene: at home; relaxing at home.",
        availability: "free",
      },
      "A grocery shopping trip is ongoing",
    ),
  ).toContain("at home");
  expect(
    photoContextForSchedule(
      {
        activity: "relaxing",
        detail: "Current confirmed physical scene: at home; relaxing at home.",
        availability: "free",
      },
      "A grocery shopping trip is ongoing",
    ),
  ).not.toContain("shopping");
});
