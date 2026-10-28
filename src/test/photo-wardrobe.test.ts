import { describe, expect, it } from "vitest";
import { ordinaryPhotoStyle, ordinaryWardrobeChoice } from "@/lib/photo-wardrobe";
import { planPhotography, photographyGuidance } from "@/lib/photo-personality";
import { buildImagePrompt } from "@/lib/tess-image.server";
import { CHARACTERS } from "@/lib/characters";

const now = new Date("2026-10-27T16:00:00Z");
const schedule = {
  activity: "at home",
  detail: "making lunch in the kitchen",
  availability: "free" as const,
};
const cast = ["tess", "maya", "riley", "claire", "jordan", "ben"] as const;
const plan = (character: string, key = "one", date = now) =>
  planPhotography({ character, key, now: date, schedule });

describe("character-specific ordinary wardrobe", () => {
  it("gives all six characters different concrete fallbacks on the same day", () => {
    const outfits = cast.map((c) => plan(c).ordinaryWardrobe);
    expect(outfits.every(Boolean)).toBe(true);
    expect(new Set(outfits).size).toBe(6);
  });

  it.each(cast)(
    "keeps %s stable over 20 opportunities, and varies only unestablished new-day fallbacks",
    (character) => {
      const first = plan(character);
      for (let i = 0; i < 20; i++) {
        const p = plan(character, `action-${i}`, new Date(now.getTime() + i * 60_000));
        expect(
          ordinaryPhotoStyle({ clothing_category: "home_casual" }, "a kitchen selfie", p)
            ?.clothing_category,
        ).toBe(first.ordinaryWardrobe);
      }
      const days = Array.from(
        { length: 20 },
        (_, i) => plan(character, "one", new Date(now.getTime() + i * 86400000)).ordinaryWardrobe,
      );
      expect(new Set(days).size).toBe(3);
      expect(days[0]).not.toBe(days[1]);
    },
  );

  it("keeps previous screened clothing rather than refreshing it to the daily fallback", () => {
    const p = planPhotography({
      character: "riley",
      key: "next",
      now,
      schedule,
      previous: {
        character: "riley",
        at: "2026-10-27T15:00:00Z",
        location: "home",
        style: { clothing_category: "navy embroidered blouse and white jeans" },
        objects: [],
      },
    });
    expect(ordinaryPhotoStyle({}, "a kitchen selfie", p)?.clothing_category).toBe(
      "navy embroidered blouse and white jeans",
    );
  });

  it("honors explicit scene and style garments, including black clothes", () => {
    const p = plan("riley");
    const style = { clothing_category: "black polo and jeans" };
    expect(ordinaryPhotoStyle(style, "a kitchen selfie", p)).toBe(style);
    expect(ordinaryPhotoStyle({}, "wearing a red silk blouse", p)).toEqual({clothing_category:"a red silk blouse"});
    expect(ordinaryPhotoStyle(null, "in blue scrubs", p)).toBeNull();
  });

  it("does not infer another character's wardrobe from unrelated history", () => {
    const p = planPhotography({
      character: "riley",
      key: "next",
      now,
      schedule,
      previous: {
        character: "tess",
        at: now.toISOString(),
        location: "home",
        style: { clothing_category: "Tess's jacket" },
        objects: [],
      },
    });
    expect(p.continuity.clothing).toBeNull();
    expect(p.ordinaryWardrobe).not.toContain("Tess");
  });

  it("uses contextual sleep and uniform clothes without inventing jobs or locations", () => {
    expect(ordinaryWardrobeChoice("riley", now, "work", "quiet shift break")).toContain("scrubs");
    expect(ordinaryWardrobeChoice("riley", now, "home", "bedtime")).toContain("pajama");
    expect(ordinaryWardrobeChoice("riley", now, "home", "making lunch")).not.toContain("scrubs");
    expect(ordinaryWardrobeChoice("claire", now, "work", "working")).toBeNull();
    expect(ordinaryWardrobeChoice("unknown", now, "home", "relaxing")).toBeNull();
    expect(ordinaryWardrobeChoice("riley", now, null, "maybe home or at work")).toBeNull();
  });

  it("uses Eastern local dates across UTC midnight", () => {
    expect(plan("riley", "a", new Date("2026-10-28T00:10:00Z")).ordinaryWardrobe).toBe(
      plan("riley", "b", new Date("2026-10-27T23:50:00Z")).ordinaryWardrobe,
    );
  });

  it.each(cast)(
    "passes %s's concrete choice to GPT rather than a shared outfit palette",
    (character) => {
      const p = plan(character);
      const c = CHARACTERS[character];
      const identity = {
        key: c.key,
        name: c.fullName,
        age: c.age,
        pronouns: c.pronouns,
        appearance: c.appearance,
      };
      const prompt = buildImagePrompt(
        "casual_selfie",
        "a kitchen selfie",
        "relaxed",
        { clothing_category: "home_casual" },
        identity,
        p,
      );
      expect(prompt).toContain(`Clothing: ${p.ordinaryWardrobe}.`);
      expect(prompt).not.toContain("use a varied palette including");
      expect(photographyGuidance(p)).toContain("not a fact already established");
    },
  );

  it("does not apply ordinary fallback to mature or object photos", () => {
    const p = plan("riley");
    expect(
      buildImagePrompt("mature_romantic", "a private portrait", "relaxed", {}, undefined, p),
    ).not.toContain(`Clothing: ${p.ordinaryWardrobe}.`);
    expect(buildImagePrompt("object", "coffee mug", null, {}, undefined, p)).not.toContain(
      p.ordinaryWardrobe!,
    );
  });
});
