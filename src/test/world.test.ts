import { describe, expect, it } from "vitest";
import { inQuietHours, isDue, TICK_INTERVAL_MINUTES } from "@/lib/world.server";
import { CHARACTERS, characterFor } from "@/lib/characters";

// Quiet hours are wall-clock hours in America/New_York (EDT in July = UTC-4).
describe("inQuietHours", () => {
  const at = (utcHour: number) => new Date(Date.UTC(2026, 6, 15, utcHour, 0)); // July 15 2026

  it("returns false when quiet hours are unset", () => {
    expect(inQuietHours(at(3), null, null)).toBe(false);
    expect(inQuietHours(at(3), 23, null)).toBe(false);
  });

  it("handles overnight ranges (23:00–07:00 ET)", () => {
    // 03:00 UTC = 23:00 ET previous day → inside
    expect(inQuietHours(at(3), 23, 7)).toBe(true);
    // 10:00 UTC = 06:00 ET → inside
    expect(inQuietHours(at(10), 23, 7)).toBe(true);
    // 16:00 UTC = 12:00 ET → outside
    expect(inQuietHours(at(16), 23, 7)).toBe(false);
  });

  it("handles same-day ranges (12:00–14:00 ET)", () => {
    expect(inQuietHours(at(17), 12, 14)).toBe(true); // 13:00 ET
    expect(inQuietHours(at(19), 12, 14)).toBe(false); // 15:00 ET
  });
});

describe("isDue", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("is due when never checked", () => {
    expect(isDue(null, now)).toBe(true);
    expect(isDue(undefined, now)).toBe(true);
  });

  it("is not due inside the interval", () => {
    const recent = new Date(now.getTime() - (TICK_INTERVAL_MINUTES - 1) * 60_000).toISOString();
    expect(isDue(recent, now)).toBe(false);
  });

  it("is due after the interval", () => {
    const old = new Date(now.getTime() - (TICK_INTERVAL_MINUTES + 1) * 60_000).toISOString();
    expect(isDue(old, now)).toBe(true);
  });
});

describe("per-character photo rules", () => {
  it("every character has a photo policy and all are photo-capable", () => {
    for (const c of Object.values(CHARACTERS)) {
      expect(c.photosEnabled).toBe(true);
      expect(c.photoTypes.length).toBeGreaterThan(0);
    }
  });

  it("Tess keeps the full photo set including intimate selfies", () => {
    const tess = characterFor("tess");
    expect(tess.photoTypes).toContain("intimate_selfie");
    expect(tess.photoTypes).toContain("tess_candid");
  });

  it("Claire never sends intimate selfies", () => {
    expect(characterFor("claire").photoTypes).not.toContain("intimate_selfie");
  });

  it("Ben and Jordan only send everyday non-selfie-intimate photos", () => {
    for (const key of ["ben", "jordan"]) {
      const types = characterFor(key).photoTypes;
      expect(types).not.toContain("intimate_selfie");
      expect(types).not.toContain("personal_selfie");
      expect(types).toContain("object");
    }
  });

  it("platonic characters are not romantic-capable", () => {
    expect(characterFor("ben").romanticCapable).toBe(false);
  });

  it("all characters live in or near ZIP 16602", () => {
    for (const c of Object.values(CHARACTERS)) {
      expect(c.zip.startsWith("166")).toBe(true);
    }
  });
});
