import { describe, expect, it } from "vitest";
import {
  deliveredPhotoSubjects,
  photographyGuidance,
  planPhotography,
  previousDeliveredPhoto,
} from "@/lib/photo-personality";

const now = new Date("2026-10-27T21:00:00Z");
const schedule = { activity: "at home", detail: "relaxing at home", availability: "free" as const };
function photo(index: number, character = "maya", type = "object") {
  return {
    sender: "tess",
    created_at: new Date(now.getTime() - (index + 1) * 60_000).toISOString(),
    metadata: {
      generated_path: `owner/${character}/${index}.png`,
      photo_type: type,
      photo_identity: { validationStatus: "screen_passed" },
      photo_visual: { version: 1, character, location: "home", style: {}, objects: [] },
    },
  };
}
function guidance(messages: Parameters<typeof deliveredPhotoSubjects>[0], character = "maya") {
  return photographyGuidance(
    planPhotography({
      character,
      key: "test",
      now,
      schedule,
      recentSubjects: deliveredPhotoSubjects(messages, character, now),
    }),
  );
}

describe("ordinary photo subject balance", () => {
  it("notices repeated objects without using them as outfit continuity", () => {
    const messages = [photo(0), photo(1)];
    expect(deliveredPhotoSubjects(messages, "maya", now)).toEqual(["object", "object"]);
    expect(previousDeliveredPhoto(messages, "maya", now)).toBeNull();
    expect(guidance(messages)).toContain("two most recent visible screened photos");
    expect(guidance(messages)).toContain("ordinary eligible photo with you in frame");
  });

  it("does not nudge after one object, mixed subjects, or an already varied sequence", () => {
    for (const messages of [
      [],
      [photo(0)],
      [photo(0), photo(1, "maya", "casual_selfie")],
      [photo(0, "maya", "tess_candid"), photo(1)],
    ]) {
      expect(guidance(messages)).not.toContain("two most recent visible screened photos");
    }
  });

  it("ignores hidden, failed, user, foreign-character, old and malformed records", () => {
    const good = photo(0);
    const messages = [
      good,
      { ...photo(1), visible_at: new Date(now.getTime() + 60_000).toISOString() },
      { ...photo(2), sender: "user" },
      photo(3, "riley"),
      { ...photo(4), created_at: "2026-10-25T20:00:00Z" },
      { ...photo(5), created_at: "invalid" },
      {
        ...photo(6),
        metadata: { ...photo(6).metadata, photo_identity: { validationStatus: "failed" } },
      },
      { ...photo(7), metadata: { ...photo(7).metadata, generated_path: "" } },
      { ...photo(8), metadata: { ...photo(8).metadata, photo_type: "unknown" } },
      {
        ...photo(9),
        metadata: {
          ...photo(9).metadata,
          photo_visual: { ...photo(9).metadata.photo_visual, version: 2 },
        },
      },
    ];
    expect(deliveredPhotoSubjects(messages, "maya", now)).toEqual(["object"]);
    expect(guidance(messages)).not.toContain("two most recent visible screened photos");
  });

  it("deduplicates attachments and uses visible delivery order", () => {
    const object = photo(0);
    const selfie = { ...photo(5, "maya", "casual_selfie"), visible_at: now.toISOString() };
    expect(deliveredPhotoSubjects([object, object, selfie], "maya", now)).toEqual([
      "person",
      "object",
    ]);
  });

  it.each(["tess", "maya", "riley", "claire", "jordan", "ben"])(
    "keeps subject guidance bounded and contextual across 20 opportunities for %s",
    (character) => {
      // Synthetic history exercises selection context only, without paid generation or forcing the AI's choice.
      for (let count = 1; count <= 20; count++) {
        const messages = Array.from({ length: count }, (_, i) => photo(i, character));
        const subjects = deliveredPhotoSubjects(messages, character, now);
        expect(subjects).toHaveLength(Math.min(count, 6));
        const prompt = guidance(messages, character);
        expect(prompt.includes("two most recent visible screened photos")).toBe(count >= 2);
        expect(prompt).toContain("Only choose an eligible type if independently willing");
        expect(prompt).toContain(
          "never substitute a selfie when they asked to see a particular object",
        );
        expect(prompt).toContain("No required alternation, quota");
        expect(prompt).toContain("forced outfit change or escalation to romantic content");
      }
    },
  );
});
