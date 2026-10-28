import { describe, it, expect } from "vitest";
import {
  continuityPhotoStyle,
  PHOTOGRAPHY_PROFILES,
  photographyProfile,
  planPhotography,
  photoPersonalityPrompt,
  photographyGuidance,
  photographyDiagnostics,
  photoSceneCompatible,
  previousDeliveredPhoto,
} from "@/lib/photo-personality";
import { buildImagePrompt } from "@/lib/tess-image.server";
import { PHOTO_TENDENCIES } from "@/lib/photo-opportunities";
const now = new Date("2026-10-23T16:00:00Z");
const schedule = {
  activity: "at home",
  detail: "at home after work",
  availability: "free" as const,
};
const plan = (character = "tess", override: Partial<Parameters<typeof planPhotography>[0]> = {}) =>
  planPhotography({ character, key: "stable-action", now, schedule, ...override });
describe("typed character photography", () => {
  it("keeps all eight profiles distinct with increased opportunity rates and unchanged pacing metadata", () => {
    expect(Object.keys(PHOTOGRAPHY_PROFILES)).toHaveLength(8);
    expect(photographyProfile("tess").expressions).toContain("deadpan");
    expect(photographyProfile("maya").expressions.join(" ")).toContain("tired");
    expect(photographyProfile("tess").captionVoice).not.toBe(
      photographyProfile("maya").captionVoice,
    );
    expect(PHOTO_TENDENCIES.tess).toMatchObject({ chance: 0.5, hours: 8, messages: 4 });
    expect(PHOTO_TENDENCIES.maya).toMatchObject({ chance: 0.75, hours: 6, messages: 3 });
    expect(photographyProfile("ben").captionVoice).toContain("platonic");
  });
  it("supports future profiles without granting identity approval or copying another character", () => {
    expect(photographyProfile("new-npc").key).toBe("unregistered");
    const npc = {
      ...photographyProfile("new-npc"),
      key: "approved-npc",
      styles: ["quiet nature details"],
    };
    expect(photographyProfile("approved-npc", { "approved-npc": npc })).toBe(npc);
  });
  it("does not invent a venue visit from user questions, preferred settings or an old event", () => {
    const p = plan("maya", { userText: "Are you at the venue? Is the party tomorrow?" });
    expect(p.location).toBe("home");
    expect(p.candidates).not.toContain("venue_update");
    expect(p.candidates).not.toContain("special_occasion");
    expect(p.candidates).toContain("post_work");
    expect(photoSceneCompatible(p, "a selfie at the event venue")).toBe(false);
  });
  it("uses actual current context for a venue update, rather than automatically selecting a selfie", () => {
    const p = plan("maya", {
      schedule: {
        activity: "at venue",
        detail: "at the venue, quiet break setting up tables",
        availability: "limited",
      },
    });
    expect(p.location).toBe("venue");
    expect(p.scenario).toBe("venue_update");
    expect(photoSceneCompatible(p, "a room photo at the venue")).toBe(true);
  });
  it("does not make hypothetical or ambiguous schedules definite", () => {
    const p = plan("tess", {
      schedule: {
        activity: "evening errands / Mabel walk",
        detail: "errands or starting dinner",
        availability: "limited",
      },
    });
    expect(p.location).toBeNull();
    expect(p.candidates).not.toContain("dog_walk");
    expect(p.candidates).not.toContain("cooking");
  });
  it.each(["busy", "asleep"] as const)("does not suggest scenarios when %s", (availability) => {
    expect(
      plan("maya", {
        schedule: { ...schedule, availability },
        userText: "Send your reaction selfie lol",
      }).scenario,
    ).toBeNull();
  });
  it("does not confuse patiently with protected patient activity", () => {
    const p = plan("jordan", {
      schedule: {
        activity: "at home",
        detail: "at home waiting patiently for the kettle",
        availability: "limited",
      },
    });
    expect(p.candidates).toContain("at_home");
    expect(
      plan("tess", {
        schedule: {
          activity: "at the clinic",
          detail: "with a patient at the clinic",
          availability: "limited",
        },
      }).candidates,
    ).toEqual([]);
  });
  it("permits a grounded Mabel walk and a visual reaction without changing her availability", () => {
    const p = plan("tess", {
      schedule: {
        activity: "walking Mabel",
        detail: "walking Mabel outside in the park",
        availability: "limited",
      },
      userText: "Show me your reaction, lol",
    });
    expect(p.candidates).toContain("dog_walk");
    expect(p.candidates).toContain("reaction_selfie");
    expect(p.continuity.objects).toEqual(["Mabel"]);
    expect(p.availability).toBe("limited");
  });
  it("uses a stable weighted selection without rerolling or requiring paid inference", () => {
    expect(plan("maya", { userText: "lol what are you wearing?" })).toEqual(
      plan("maya", { userText: "lol what are you wearing?" }),
    );
  });
  it("carries recent same-place hair/clothing while allowing a deliberate change and mood variation", () => {
    const p = plan("tess", {
      previous: {
        character: "tess",
        at: new Date(now.getTime() - 5 * 60_000).toISOString(),
        location: "home",
        style: { hairstyle: "ponytail", clothing_category: "charcoal sweater" },
        objects: [],
      },
    });
    expect(p.continuitySource).toBe("recent_delivered_photo");
    expect(p.continuity).toMatchObject({ hairstyle: "ponytail", clothing: "charcoal sweater" });
    const prompt = photoPersonalityPrompt(p, { hairstyle: "messy bun", expression: "big smile" });
    expect(prompt).toContain("not explicitly changed");
    expect(prompt).toContain("messy bun");
    expect(prompt).toContain("big smile");
    expect(prompt).toContain("requested expression/mood is unspecified");
  });
  it("fills missing same-moment styling without overriding an explicitly changed hairstyle or scene", () => {
    const p = plan();
    p.outfitEpisode = "same_day";
    p.continuity.hairstyle = "ponytail";
    p.continuity.clothing = "charcoal cardigan";
    expect(continuityPhotoStyle(p, {}, "a reaction selfie at home")).toMatchObject({
      hairstyle: "ponytail",
      clothing_category: "charcoal cardigan",
    });
    expect(
      continuityPhotoStyle(p, { hairstyle: "messy bun" }, "wearing a blue hoodie at home"),
    ).toMatchObject({ hairstyle: "messy bun", clothing_category: "a blue hoodie" });
  });
  it("carries garments through travel without bringing Maya back to a previous venue", () => {
    const previous = {
      character: "maya",
      at: new Date(now.getTime() - 5 * 60_000).toISOString(),
      location: "venue" as const,
      style: { hairstyle: "ponytail", clothing_category: "work jacket" },
      objects: [],
    };
    expect(plan("maya", { previous }).outfitEpisode).toBe("context_transition");
    expect(plan("maya", { previous }).location).toBe("home");
    expect(
      plan("maya", {
        previous: {
          ...previous,
          location: "home",
          at: new Date(now.getTime() - 21 * 60_000).toISOString(),
        },
      }).continuity.hairstyle,
    ).toBe("ponytail");
    expect(
      plan("tess", { previous: { ...previous, location: "home" } }).continuity.hairstyle,
    ).toBeNull();
  });
  it("keeps a look across travel until an actual outfit change", () => {
    const previous = {
      character: "tess",
      at: new Date(now.getTime() - 4 * 3600_000).toISOString(),
      location: "home" as const,
      style: { hairstyle: "messy_bun", clothing_category: "charcoal_sweater" },
      objects: [],
    };
    const home = plan("tess", { previous });
    expect(home.outfitEpisode).toBe("same_day");
    expect(continuityPhotoStyle(home, { clothing_category: "generic_black_top" }, "selfie at home").clothing_category).toBe("charcoal_sweater");
    const trivia = plan("tess", { previous, schedule: {
      activity: "at bar trivia", detail: "at the bar with her trivia team", availability: "free",
    } });
    expect(trivia.outfitEpisode).toBe("same_day");
    expect(trivia.continuity.clothing).toBe("charcoal_sweater");
  });
  it("uses only delivered screened photos from this character, not pending or user images", () => {
    const metadata = {
      generated_path: "owner/photo.png",
      photo_type: "casual_selfie",
      photo_identity: { validationStatus: "screen_passed" },
      photo_visual: {
        version: 1,
        character: "tess",
        location: "home",
        style: { hairstyle: "ponytail" },
        objects: [],
      },
    };
    const m = {
      sender: "tess",
      created_at: new Date(now.getTime() - 60_000).toISOString(),
      visible_at: new Date(now.getTime() + 60_000).toISOString(),
      metadata,
    };
    expect(previousDeliveredPhoto([m], "tess", now)).toBeNull();
    expect(
      previousDeliveredPhoto([{ ...m, visible_at: m.created_at, sender: "user" }], "tess", now),
    ).toBeNull();
    expect(previousDeliveredPhoto([{ ...m, visible_at: m.created_at }], "maya", now)).toBeNull();
    expect(
      previousDeliveredPhoto([{ ...m, visible_at: m.created_at }], "tess", now)?.style.hairstyle,
    ).toBe("ponytail");
  });
  it("composes explicit scene and style with character tendencies without replacing canon or adding text", () => {
    const p = plan("maya");
    const prompt = buildImagePrompt(
      "casual_selfie",
      "at home wearing a blue hoodie, feeling exhausted",
      "tired",
      { hairstyle: "messy bun" },
      { key: "maya", name: "Maya", age: 31, pronouns: "she/her", appearance: "not authoritative" },
      p,
    );
    expect(prompt).toContain("blue hoodie");
    expect(prompt).toContain("messy bun");
    expect(prompt).toContain("feeling exhausted");
    expect(prompt).toContain("actual profile image overrides");
    expect(prompt).toContain("Captions belong to the separate chat message");
    const objectPrompt = buildImagePrompt(
      "object",
      "a coffee mug at home",
      null,
      null,
      undefined,
      p,
    );
    expect(objectPrompt).toContain("No people's faces visible");
    expect(objectPrompt).toContain("Do not add a human");
    expect(objectPrompt).not.toContain("Hairstyle possibilities");
  });
  it("keeps mature category named and makes it suggestive rather than generic sleepwear", () => {
    const mature = buildImagePrompt("mature_romantic", "adult at home, an affectionate private selfie", "playful",
      null, { key: "claire", name: "Claire", age: 35, pronouns: "she/her", appearance: "reference" });
    expect(mature).toContain("coordinated bra and underwear");
    expect(mature).toContain("intentionally flirtatious and sensual");
    expect(mature).toContain("No nudity");
    expect(mature).toContain("provider's content policy");
    const ordinary = buildImagePrompt("intimate_selfie", "warm evening at home", null,
      null, { key: "claire", name: "Claire", age: 35, pronouns: "she/her", appearance: "reference" });
    expect(ordinary).not.toContain("matching bra and underwear");
  });
  it("keeps caption guidance specific to the character and selected scene", () => {
    const tess = photographyGuidance(plan()),
      maya = photographyGuidance(plan("maya"));
    expect(tess).toContain("Dry, clever, concise");
    expect(maya).toContain("Warm, playful, conversational");
    expect(maya).toContain("match only the actual selected scene");
    expect(maya).toContain("never become image text");
  });
  it("redacts URLs, credentials and transcripts from diagnostic prompt components", () => {
    const d = photographyDiagnostics(plan(), {
      hairstyle: "bun https://private/photo?token=secret",
      expression: "sk-secret-key",
    });
    expect(JSON.stringify(d)).not.toContain("token=secret");
    expect(JSON.stringify(d)).not.toContain("sk-secret-key");
    expect(d.promptComponents).toContain("approved canonical reference pixels");
    expect(d.scenarioCandidates).not.toContain("venue_update");
  });
});
