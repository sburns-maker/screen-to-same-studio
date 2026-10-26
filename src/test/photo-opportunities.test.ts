import { describe, expect, it } from "vitest";
import { attachmentPresent, photoOpportunity, PHOTO_TENDENCIES } from "@/lib/photo-opportunities";
import { SEED_STATE } from "@/lib/tess-logic";
import { eligiblePhotoCategories } from "@/lib/photo-policy";
import { CHARACTERS } from "@/lib/characters";
import { scheduleFor } from "@/lib/tess-life";
import { repeatsPhotoComposition } from "@/lib/tess-photos";

const base = {
  character: "tess" as const,
  conversationId: "thread",
  now: new Date("2026-10-22T15:00:00Z"),
  schedule: {
    activity: "at work",
    availability: "limited" as const,
    detail: "a brief clinic office break",
  },
  state: { ...SEED_STATE, comfort: 65, trust: 60 },
  frequency: "normal" as const,
  eligibleTypes: ["object", "casual_selfie"],
  lastPhotoAt: null,
  ownSinceLastPhoto: 99,
  gapHours: 3,
  context: "A quiet break at her desk, reflecting on the morning's established conversation",
  preview: true,
};
describe("independent contextual photo opportunities", () => {
  it("does not initiate a photo when uninterested or pressured", () => {
    expect(photoOpportunity({ ...base, state: { ...base.state, curiosity: 10 } }).eligible).toBe(
      false,
    );
    expect(
      photoOpportunity({ ...base, state: { ...base.state, perceived_pressure: 40 } }).eligible,
    ).toBe(false);
  });
  it("rejects repeated composition ensembles without changing a meaningful setting", () => {
    const style = {
      pose_type: "seated",
      camera_angle: "front_camera",
      crop_type: "chest_up",
      hairstyle: "clipped_up",
      expression: "amused",
      clothing_category: "work_cardigan",
      setting: "clinic office",
    };
    expect(repeatsPhotoComposition(style, [{ ...style, camera_angle: "Front Camera" }])).toBe(true);
    expect(repeatsPhotoComposition({ setting: "clinic office" }, [style])).toBe(false);
  });
  it("allows a clinic selfie opportunity without using attraction or rewarding flirting", () => {
    const result = photoOpportunity({
      ...base,
      state: { ...base.state, romantic_attraction: 0, romantic_intent: 0 },
    });
    expect(result.selected).toBe(true);
    expect(result.hint).toContain("clinic desk breaks");
    expect(result.hint).toContain("not a flirting reward");
    expect(result.hint).toContain("Never invent");
  });
  it("gives Maya, Claire, Tess and Jordan different subjects and frequencies", () => {
    expect(PHOTO_TENDENCIES.maya.chance).toBeGreaterThan(PHOTO_TENDENCIES.tess.chance);
    expect(PHOTO_TENDENCIES.jordan.hours).toBeGreaterThan(PHOTO_TENDENCIES.claire.hours);
    expect(PHOTO_TENDENCIES.claire.subjects).toContain("garden");
    expect(PHOTO_TENDENCIES.jordan.subjects).toContain("rarely a selfie");
  });
  it.each(["asleep"] as const)(
    "never photographs while %s, even in developer testing",
    (availability) => {
      expect(
        photoOpportunity({ ...base, schedule: { ...base.schedule, availability } }).eligible,
      ).toBe(false);
    },
  );
  it.each(["driving", "emergency surgery", "phone away", "clinic patient consultation"])(
    "blocks incompatible activity: %s",
    (detail) => {
      expect(photoOpportunity({ ...base, schedule: { ...base.schedule, detail } }).eligible).toBe(
        false,
      );
    },
  );
  it("allows optional photos while winding down but not while asleep", () => {
    const result = photoOpportunity({
      ...base,
      schedule: {
        activity: "winding down",
        availability: "limited",
        detail: "winding down for bed",
      },
      context: "A quiet nighttime photo of the book she is reading",
    });
    expect(result.eligible).toBe(true);
    expect(result.selected).toBe(true);
    expect(
      photoOpportunity({
        ...base,
        schedule: { activity: "asleep", availability: "asleep", detail: "asleep — before alarm" },
      }).eligible,
    ).toBe(false);
  });
  it("allows Jordan's free-ish climbing practice when the detail says patiently", () => {
    const result = photoOpportunity({
      ...base,
      character: "jordan",
      schedule: {
        activity: "free-ish",
        availability: "free",
        detail:
          "free-ish; ongoing situation: Jordan and Ruth are working patiently on a climbing technique during their normal sessions",
      },
      context: "Jordan jokes about holding the toaster hostage",
    });
    expect(result.eligible).toBe(true);
  });
  it("continues blocking real patient consultations without matching patiently", () => {
    expect(
      photoOpportunity({
        ...base,
        schedule: { ...base.schedule, detail: "working with patients in a private room" },
      }).reason,
    ).toBe("current activity is incompatible with a photo");
  });
  it("allows fresh grounded photo moments without clock or message cooldowns", () => {
    const justSent = photoOpportunity({
      ...base,
      lastPhotoAt: "2026-10-22T14:00:00Z",
      ownSinceLastPhoto: 0,
    });
    expect(justSent.eligible).toBe(true);
    const again = photoOpportunity({
      ...base,
      lastPhotoAt: "2026-10-22T14:00:00Z",
      ownSinceLastPhoto: 0,
    });
    expect(again.selected).toBe(justSent.selected);
  });
  it("respects no-photo boundaries and preserves ordinary object photos below selfie thresholds", () => {
    const c = CHARACTERS.tess;
    const context = {
      age: c.age,
      enabled: true,
      romanticCapable: true,
      supported: c.photoTypes,
      matureEnabled: false,
      boundary: "all_photos" as const,
    };
    const eligibleTypes = eligiblePhotoCategories(SEED_STATE, context);
    expect(photoOpportunity({ ...base, eligibleTypes }).eligible).toBe(false);
    expect(eligiblePhotoCategories(SEED_STATE, { ...context, boundary: "none" })).toEqual([
      "object",
    ]);
  });
  it("does not reroll with polling or an attraction increase", () => {
    const first = photoOpportunity({ ...base, preview: false });
    const later = photoOpportunity({
      ...base,
      preview: false,
      now: new Date(base.now.getTime() + 60_000),
      state: { ...base.state, romantic_attraction: 100 },
    });
    expect(later.key).toBe(first.key);
    expect(later.selected).toBe(first.selected);
  });
  it("counts all existing attachment formats and fixes Tess's late-night sleep boundary", () => {
    for (const metadata of [
      { photo: "coffee" },
      { generated_path: "owner/file.png" },
      { generated_image_id: "image" },
    ])
      expect(attachmentPresent(metadata)).toBe(true);
    expect(attachmentPresent({ user_photo: "incoming.png" })).toBe(false);
    expect(scheduleFor(new Date("2026-10-23T03:30:00Z")).availability).toBe("asleep");
  });
});

describe("ordinary photos without a special event", () => {
  it("allows an occupied character to consider a quick photo while doing ordinary errands", () => {
    expect(
      photoOpportunity({
        ...base,
        schedule: {
          activity: "running errands",
          availability: "busy",
          detail: "browsing groceries",
        },
        context: "browsing groceries",
      }).eligible,
    ).toBe(true);
  });
  it("does not require an event or a visual punchline at home", () => {
    expect(
      photoOpportunity({
        ...base,
        schedule: { activity: "at home", availability: "free", detail: "relaxing at home" },
        context: "relaxing at home",
      }).eligible,
    ).toBe(true);
  });
  it("does not reroll the lottery when only storyline wording changes", () => {
    const ordinary = photoOpportunity({ ...base, preview: false, context: "relaxing at home" });
    const story = photoOpportunity({
      ...base,
      preview: false,
      context: "Maya and Becca are planning a weekend",
    });
    expect(story.selected).toBe(ordinary.selected);
  });
});

it("offers photos more often while keeping character differences and the frequency setting",()=>{
 expect(PHOTO_TENDENCIES.tess.chance).toBe(0.5);expect(PHOTO_TENDENCIES.maya.chance).toBe(0.75);expect(PHOTO_TENDENCIES.jordan.chance).toBe(0.22);
 const samples=(character:typeof base.character|"maya"|"jordan",frequency:"rare"|"normal"|"frequent")=>Array.from({length:1000},(_,n)=>photoOpportunity({...base,character,frequency,conversationId:`frequency-sample-${n}`,preview:false,context:"relaxing at home"})).filter(r=>r.selected).length;
 expect(samples("maya","normal")).toBeGreaterThan(samples("tess","normal"));expect(samples("tess","normal")).toBeGreaterThan(samples("jordan","normal"));
 expect(samples("tess","rare")).toBeLessThan(samples("tess","normal"));expect(samples("tess","normal")).toBeLessThan(samples("tess","frequent"));
});
