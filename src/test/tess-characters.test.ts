import { describe, expect, it } from "vitest";
import { CHARACTERS, CHARACTER_LIST, characterAvailability, characterFor } from "@/lib/characters";
import { decideInitiation, scheduleFor } from "@/lib/tess-life";
import { SEED_STATE } from "@/lib/tess-logic";

describe("character roster", () => {
  it("has exactly the five V1 contacts", () => {
    expect(CHARACTER_LIST.map((c) => c.key).sort()).toEqual(["ben", "claire", "jordan", "maya", "tess"]);
  });

  it("every character lives in or near ZIP 16602", () => {
    for (const c of CHARACTER_LIST) {
      expect(c.zip.startsWith("166")).toBe(true);
    }
  });

  it("Tess keeps her original seed state and full photo system", () => {
    expect(CHARACTERS.tess.seedState).toEqual(SEED_STATE);
    expect(CHARACTERS.tess.photosEnabled).toBe(true);
    expect(CHARACTERS.tess.romanticCapable).toBe(true);
  });

  it("Ben is platonic: no romantic capability and zero attraction seed", () => {
    expect(CHARACTERS.ben.romanticCapable).toBe(false);
    expect(CHARACTERS.ben.seedState.romantic_attraction).toBe(0);
    expect(CHARACTERS.ben.seedState.physical_attraction).toBe(0);
  });

  it("Claire seeds warm but not romantic", () => {
    const s = CHARACTERS.claire.seedState;
    expect(s.comfort).toBeGreaterThanOrEqual(50);
    expect(s.trust).toBeGreaterThanOrEqual(35);
    expect(s.romantic_attraction).toBeLessThanOrEqual(10);
  });

  it("Maya seeds more playful and socially warm than Tess", () => {
    expect(CHARACTERS.maya.seedState.playfulness).toBeGreaterThan(CHARACTERS.tess.seedState.playfulness);
  });

  it("Jordan seeds guarded: low trust and momentum", () => {
    const s = CHARACTERS.jordan.seedState;
    expect(s.trust).toBeLessThan(CHARACTERS.tess.seedState.trust);
    expect(s.relationship_momentum).toBeLessThan(CHARACTERS.tess.seedState.relationship_momentum);
  });

  it("each character has a distinct baseline note for debriefs", () => {
    const notes = new Set(CHARACTER_LIST.map((c) => c.baselineNotes));
    expect(notes.size).toBe(CHARACTER_LIST.length);
    for (const c of CHARACTER_LIST) expect(c.baselineNotes.length).toBeGreaterThan(40);
  });

  it("non-Tess contacts have their own personality bibles and restricted photo sets", () => {
    for (const c of CHARACTER_LIST) {
      if (c.key === "tess") continue;
      expect(c.bible.length).toBeGreaterThan(200);
      expect(c.photosEnabled).toBe(true);
      // Contacts generate photos only (no curated library). Intimate selfies are
      // limited to romance-capable contacts; Claire, Jordan and Ben never send them.
      if (c.key !== "maya") expect(c.photoTypes).not.toContain("intimate_selfie");
      expect(c.photoTypes.length).toBeGreaterThan(0);
    }
  });

  it("characterFor falls back to Tess for unknown keys", () => {
    expect(characterFor("nobody").key).toBe("tess");
    expect(characterFor(null).key).toBe("tess");
  });
});

describe("contact availability", () => {
  it("respects each contact's own work hours", () => {
    // A Tuesday at 11am Eastern.
    const tue11 = new Date("2026-10-20T15:00:00Z"); // 11:00 EDT
    const claire = characterAvailability(CHARACTERS.claire, tue11);
    expect(claire.availability).not.toBe("free"); // school hours
    const ben = characterAvailability(CHARACTERS.ben, tue11);
    expect(ben.availability).not.toBe("free"); // job site
  });

  it("everyone is asleep in the small hours", () => {
    const night = new Date("2026-10-21T07:00:00Z"); // 03:00 EDT
    for (const c of CHARACTER_LIST) {
      if (c.key === "tess") continue;
      expect(characterAvailability(c, night).availability).toBe("asleep");
    }
  });
});

describe("per-contact initiation tuning", () => {
  const baseState = { ...SEED_STATE };
  const schedule = scheduleFor(new Date("2026-10-20T19:00:00Z"), 1); // Tue afternoon

  const input = (over: Partial<Parameters<typeof decideInitiation>[0]> = {}) => ({
    state: baseState,
    stage: "Newly acquainted" as const,
    gapHours: 6,
    lastInitiatedAt: null,
    userCarrying: false,
    recentQuality: 40,
    schedule,
    lifeEvent: null,
    hasPlausibleReason: true,
    now: new Date("2026-10-20T19:00:00Z"),
    ...over,
  });

  it("a shorter minGapHours makes a contact eligible sooner", () => {
    const tessLike = decideInitiation(input({ gapHours: 4 }), () => 0.99);
    expect(tessLike.eligible).toBe(false);
    const mayaLike = decideInitiation(input({ gapHours: 4, minGapHours: 3 }), () => 0.99);
    expect(mayaLike.eligible).toBe(true);
  });

  it("scoreMultiplier raises and lowers inclination", () => {
    const normal = decideInitiation(input(), () => 0.99);
    const boosted = decideInitiation(input({ scoreMultiplier: 1.5 }), () => 0.99);
    const damped = decideInitiation(input({ scoreMultiplier: 0.55 }), () => 0.99);
    expect(boosted.score).toBeGreaterThan(normal.score);
    expect(damped.score).toBeLessThan(normal.score);
  });
});
