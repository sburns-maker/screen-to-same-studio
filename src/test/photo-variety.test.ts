import { describe, it, expect, vi } from "vitest";
import { CHARACTERS } from "@/lib/characters";
import {
  planPhotography,
  continuityPhotoStyle,
  deliveredPhotoHistory,
  photographyGuidance,
  photographyProfile,
  type DeliveredPhoto,
} from "@/lib/photo-personality";
import { selectPhotoComposition, repeatsCapture } from "@/lib/photo-composition";
import { generateTessImage } from "@/lib/tess-image.server";
import type { PhotoStyle } from "@/lib/tess-photos";

vi.mock("@/lib/photo-identity-qc.server", () => ({
  requireVisualScreen: () => {},
  screenPhotoVisuals: vi.fn(async () => ({ status: "screen_passed" })),
}));

const oldStyle: PhotoStyle = {
  pose_type: "sitting",
  camera_angle: "eye_level",
  crop_type: "chest_up",
  selfie_type: "selfie",
  expression: "soft smile",
  hairstyle: "ponytail",
  clothing_category: "blue work uniform",
};
const previous: DeliveredPhoto = {
  character: "riley",
  at: "2026-10-27T03:40:00Z",
  location: "work",
  style: oldStyle,
  objects: [],
};

describe("grounded photo capture", () => {
  it("recognizes capture synonyms without treating a uniform as a duplicate", () => {
    expect(
      repeatsCapture(
        { ...oldStyle, pose_type: "seated", camera_angle: "eye-level", crop_type: "chest-up" },
        [oldStyle],
      ),
    ).toBe(true);
    expect(
      repeatsCapture({ ...oldStyle, camera_angle: "slightly_above", crop_type: "waist_up" }, [
        oldStyle,
      ]),
    ).toBe(false);
    expect(repeatsCapture({ clothing_category: "blue work uniform" }, [oldStyle])).toBe(false);
  });
  it.each(["changed clothes", "got dressed", "showered", "put on a sweater"])(
    "recognizes an established change: %s",
    (detail) => {
      const plan = planPhotography({
        character: "riley",
        key: "one",
        now: new Date("2026-10-27T04:10:00Z"),
        schedule: { activity: "at home", detail, availability: "free" },
        previous: { ...previous, location: "home", at: "2026-10-27T03:40:00Z" },
      });
      expect(plan.outfitEpisode).toBe("context_transition");
      expect(plan.continuity.clothing).toBeNull();
    },
  );
  it("retains a uniform across midnight during the same overnight shift", () => {
    const p = planPhotography({
      character: "riley",
      key: "one",
      now: new Date("2026-10-27T04:10:00Z"),
      schedule: { activity: "at work", detail: "quiet work break", availability: "limited" },
      previous,
    });
    expect(p.continuity.clothing).toBe("blue work uniform");
  });
  it("does not use a player's clothing change as evidence the character changed", () => {
    const p = planPhotography({
      character: "riley",
      key: "one",
      now: new Date("2026-10-27T04:10:00Z"),
      schedule: { activity: "at work", detail: "quiet work break", availability: "limited" },
      previous,
      userText: "I showered and changed clothes. Did you?",
    });
    expect(p.continuity.clothing).toBe("blue work uniform");
  });
  it("preserves explicitly requested capture and character expression", () => {
    const chosen = selectPhotoComposition(
      { ...oldStyle, camera_angle: "side profile" },
      [oldStyle],
      "a side profile at work",
    );
    expect(chosen.style.camera_angle).toBe("side profile");
    expect(chosen.style.expression).toBe("soft smile");
    expect(chosen.decision).toBe("preserved");
  });
  it("filters pending, wrong-character and unscreened history before using styles", () => {
    const now = new Date("2026-10-27T04:10:00Z");
    const msg = {
      sender: "tess",
      created_at: "2026-10-27T04:00:00Z",
      metadata: {
        generated_path: "owner/photo",
        photo_type: "casual_selfie",
        photo_identity: { validationStatus: "screen_passed" },
        photo_visual: { ...previous, version: 1 },
      },
    };
    expect(
      deliveredPhotoHistory(
        [
          msg,
          { ...msg, visible_at: "2026-10-28T04:00:00Z" },
          {
            ...msg,
            metadata: {
              ...msg.metadata,
              photo_visual: { ...previous, version: 1, character: "maya" },
            },
          },
          { ...msg, metadata: { ...msg.metadata, photo_identity: { validationStatus: "failed" } } },
        ],
        "riley",
        now,
      ),
    ).toHaveLength(1);
  });
});

describe("Sienna bar shift framing", () => {
  it("provides several work-grounded subjects without requiring outfit or hairstyle changes", () => {
    const profile = photographyProfile("sienna");
    expect(profile.styles.some((value) => /cocktail-making detail/.test(value))).toBe(true);
    expect(profile.selfies.some((value) => /bar-tool or drink detail/.test(value))).toBe(true);
    expect(profile.selfies.some((value) => /counter/.test(value))).toBe(true);
    expect(profile.wardrobe.some((value) => /consistent during the shift/.test(value))).toBe(true);
  });

  it("applies bar-shift guidance only when Sienna is physically at work", () => {
    const base = {
      character: "sienna",
      key: "shift:photo",
      now: new Date("2026-11-10T21:00:00Z"),
      schedule: {
        activity: "bartending",
        detail: "behind the bar, quick pause between drinks",
        availability: "limited" as const,
      },
    };
    const shift = planPhotography(base);
    expect(shift.location).toBe("work");
    expect(photographyGuidance(shift)).toContain("SIENNA BAR-SHIFT VARIETY");
    expect(photographyGuidance(shift)).toContain("never invent a photographer");
    const home = planPhotography({
      ...base,
      key: "home:photo",
      schedule: { activity: "at home", detail: "relaxing on the couch", availability: "free" },
    });
    expect(photographyGuidance(home)).not.toContain("SIENNA BAR-SHIFT VARIETY");
  });

  it("retains the last established work clothes across successive work images", () => {
    const prior: DeliveredPhoto = {
      character: "sienna",
      at: "2026-11-10T20:30:00Z",
      location: "work",
      style: { ...oldStyle, clothing_category: "black cotton bar shirt", hairstyle: "loose copper-red hair" },
      objects: [],
    };
    const plan = planPhotography({
      character: "sienna",
      key: "shift:followup",
      now: new Date("2026-11-10T21:00:00Z"),
      schedule: { activity: "bartending", detail: "behind the bar between orders", availability: "limited" },
      previous: prior,
    });
    expect(plan.outfitLocked).toBe(true);
    expect(plan.continuity.clothing).toBe("black cotton bar shirt");
    expect(plan.continuity.hairstyle).toBe("loose copper-red hair");
  });
});

// 120 opportunities exercise real planning/prompt construction. The provider is
// mocked: this measures capture decisions, not generated-pixel quality or willingness.
describe.each(Object.values(CHARACTERS))(
  "20 delivered-photo opportunities: $preferredName",
  (character) => {
    it("varies framing while retaining identity, mood, actual location and garments within each episode", async () => {
      const history: DeliveredPhoto[] = [];
      const provider = vi.fn(async (_prompt: string, _references: Blob[]) => ({
        bytes: new Uint8Array([1]),
        mime: "image/png",
        provider: "mock",
        model: "mock",
      }));
      const canonical = {
        blob: new Blob([`${character.key}:approved`], { type: "image/png" }),
        asset: `approved:${character.key}`,
        sha256: `${character.key}:unchanged`,
        width: 512,
        height: 512,
      };
      const frames = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const episode = Math.floor(i / 4);
        const place = ["work", "home", "outdoors", "home", "work"][episode]!;
        const now = new Date(
          Date.parse("2026-10-27T00:00:00Z") + episode * 24 * 3600000 + (i % 4) * 600000,
        );
        const changed = i % 4 === 0;
        const garment = [
          "blue work uniform",
          "cream knit",
          "olive jacket",
          "burgundy top",
          "blue work uniform",
        ][episode]!;
        const schedule = {
          activity: `at ${place}`,
          detail: changed
            ? `at ${place}, changed clothes into ${garment}`
            : `at ${place}, same continuous break`,
          availability: "free" as const,
        };
        const plan = planPhotography({
          character: character.key,
          key: `${character.key}:${i}`,
          now,
          schedule,
          previous: history[0] ?? null,
          recentStyles: history.map((p) => p.style),
        });
        const style = continuityPhotoStyle(
          plan,
          {
            ...oldStyle,
            clothing_category: changed ? garment : "generic_black_top",
            expression: "focused",
          },
          `at ${place}`,
        );
        const capture = selectPhotoComposition(
          style,
          history.map((p) => p.style),
          `at ${place}`,
        );
        expect(capture.style.clothing_category).toBe(garment);
        expect(capture.style.expression).toBe("focused");
        expect(
          repeatsCapture(
            capture.style,
            history.slice(0, 3).map((p) => p.style),
          ),
        ).toBe(false);
        frames.add(`${capture.style.camera_angle}:${capture.style.crop_type}`);
        const result = await generateTessImage({
          provider: {
            name: "mock",
            model: "mock",
            referenceConditioning: true,
            generate: provider,
          },
          canonical,
          type: "casual_selfie",
          scene: `at ${place}`,
          expression: "focused",
          style: capture.style,
          identity: {
            key: character.key,
            name: character.fullName,
            age: character.age,
            pronouns: character.pronouns,
            appearance: character.appearance,
          },
          photography: plan,
        });
        const prompt = provider.mock.calls[i]![0];
        expect(prompt).toContain("identity only");
        expect(prompt).toContain("REFERENCE ROLE / NEW CAPTURE");
        expect(prompt).toContain(`pose_type: ${capture.style.pose_type}`);
        expect(prompt).toContain(`Scene: at ${place}`);
        expect(provider.mock.calls[i]![1][0]).toBe(canonical.blob);
        expect(result.diagnostics.canonicalSha256).toBe(canonical.sha256);
        history.unshift({
          character: character.key,
          at: now.toISOString(),
          location: place as DeliveredPhoto["location"],
          style: capture.style,
          objects: [],
        });
      }
      expect(provider).toHaveBeenCalledTimes(20);
      expect(frames.size).toBeGreaterThanOrEqual(4);
    });
  },
);
