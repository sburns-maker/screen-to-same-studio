import { expect, it } from "vitest";
import {
  planPhotography,
  continuityPhotoStyle,
  type DeliveredPhoto,
} from "@/lib/photo-personality";
import { ordinaryPhotoStyle, sceneOutfit } from "@/lib/photo-wardrobe";
import { buildImagePrompt } from "@/lib/tess-image.server";
import { cleanPhotoCaptionMarker } from "@/lib/photo-text";
const now = new Date("2026-10-28T15:00:00Z");
const work = {
  activity: "at work",
  detail: "same shift, quiet break",
  availability: "limited" as const,
};
const previous: DeliveredPhoto = {
  character: "maya",
  at: "2026-10-28T14:00:00Z",
  location: "work",
  style: { clothing_category: "burgundy cotton blouse and navy trousers", hairstyle: "ponytail" },
  objects: [],
};
function plan(override: Partial<Parameters<typeof planPhotography>[0]> = {}) {
  return planPhotography({
    character: "maya",
    key: "stable",
    now,
    schedule: work,
    previous,
    ...override,
  });
}
it.each(["tess", "maya", "riley", "claire", "jordan", "ben"])(
  "keeps %s's established work outfit across 20 photo choices",
  (character) => {
    for (let i = 0; i < 20; i++) {
      const p = plan({
        character,
        previous: { ...previous, character },
        now: new Date(now.getTime() + i * 60000),
      });
      expect(p.outfitLocked).toBe(true);
      const style = continuityPhotoStyle(
        p,
        { clothing_category: "random purple sweater" },
        "wearing a purple sweater at work",
      );
      expect(style.clothing_category).toBe(previous.style.clothing_category);
      expect(
        ordinaryPhotoStyle(style, "wearing a purple sweater at work", p)?.clothing_category,
      ).toBe(previous.style.clothing_category);
      const prompt = buildImagePrompt(
        "casual_selfie",
        "wearing a purple sweater at work",
        null,
        style,
        undefined,
        p,
      );
      expect(prompt).toContain(`CURRENT OUTFIT CONTINUITY: ${previous.style.clothing_category}`);
      expect(prompt).toContain("precedence over conflicting wardrobe suggestions");
    }
  },
);
it("permits a fresh outfit on arriving home, then retains that new outfit", () => {
  const atHome = plan({
    schedule: { activity: "at home", detail: "relaxing after work", availability: "free" },
  });
  expect(atHome.outfitLocked).toBe(false);
  expect(atHome.outfitEpisode).toBe("context_transition");
  const style = continuityPhotoStyle(atHome, {}, "wearing a blue cotton tee at home");
  expect(style.clothing_category).toBe("a blue cotton tee");
  const later = plan({
    schedule: { activity: "at home", detail: "relaxing on the couch", availability: "free" },
    previous: { ...previous, location: "home", style },
  });
  expect(later.outfitLocked).toBe(true);
  expect(
    continuityPhotoStyle(later, { clothing_category: "red blouse" }, "wearing a red blouse at home")
      .clothing_category,
  ).toBe("a blue cotton tee");
});
it("can keep work clothes at home when that is explicitly established", () => {
  const p = plan({
    schedule: {
      activity: "at home",
      detail: "still wearing the same clothes",
      availability: "free",
    },
  });
  expect(p.outfitLocked).toBe(true);
});
it("does not treat changing later or the player's own clothes as a current character change", () => {
  const p = plan({
    schedule: { ...work, detail: "getting dressed later, still at work" },
    userText: "I changed into a red shirt.",
  });
  expect(p.outfitLocked).toBe(true);
});
it("allows an actual wardrobe change or a direct current photo outfit request", () => {
  expect(
    plan({ schedule: { ...work, detail: "changed clothes after a spill" } }).outfitLocked,
  ).toBe(false);
  expect(plan({ userText: "Please wear a blue shirt for this photo." }).outfitLocked).toBe(false);
  expect(plan({ userText: "Please wear a blue shirt tomorrow." }).outfitLocked).toBe(true);
});
it("retains clothes through travel and across midnight in one shift but not the next day", () => {
  expect(
    plan({
      schedule: {
        activity: "walking outdoors",
        detail: "walking home from work",
        availability: "free",
      },
    }).outfitLocked,
  ).toBe(true);
  const overnight = plan({
    character: "riley",
    now: new Date("2026-10-29T04:30:00Z"),
    previous: { ...previous, character: "riley", at: "2026-10-29T03:30:00Z" },
  });
  expect(overnight.outfitLocked).toBe(true);
  expect(plan({ now: new Date("2026-10-29T15:00:00Z") }).outfitLocked).toBe(false);
});
it("records a scene's concrete clothing and removes media placeholders without eating ordinary prose", () => {
  expect(sceneOutfit("wearing a burgundy blouse at work")).toBe("a burgundy blouse");
  expect(sceneOutfit("standing at work")).toBeNull();
  expect(cleanPhotoCaptionMarker("[photo] Current work face.")).toBe("Current work face.");
  expect(cleanPhotoCaptionMarker("[image attached] Hello")).toBe("Hello");
  expect(cleanPhotoCaptionMarker("It literally said [photo].")).toBe("It literally said [photo].");
  expect(cleanPhotoCaptionMarker("[photo]")).toBe("");
});
