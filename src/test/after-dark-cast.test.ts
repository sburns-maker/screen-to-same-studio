import { describe, expect, it } from "vitest";
import { AFTER_DARK_CAST, canUnlockAfterDarkContact } from "../lib/after-dark-cast";

describe("After Dark staged character identities", () => {
  it("keeps both adults distinct from existing names and one another", () => {
    expect(AFTER_DARK_CAST.carly.age).toBeGreaterThanOrEqual(21);
    expect(AFTER_DARK_CAST.brooke.age).toBeGreaterThanOrEqual(21);
    expect(AFTER_DARK_CAST.carly.fullName).not.toBe(AFTER_DARK_CAST.brooke.fullName);
    expect(AFTER_DARK_CAST.carly.appearance).toMatch(/jet-black/);
    expect(AFTER_DARK_CAST.brooke.appearance).toMatch(/platinum blonde/);
  });
  it("does not unlock Brooke just because Carly mentions her", () => {
    expect(canUnlockAfterDarkContact({ target: "brooke", source: "carly", metInScene: false, targetConsentedToContact: true })).toBe(false);
    expect(canUnlockAfterDarkContact({ target: "brooke", source: "carly", metInScene: true, targetConsentedToContact: false })).toBe(false);
  });
  it("permits introduction only after a real encounter and independent agreement", () => {
    expect(canUnlockAfterDarkContact({ target: "brooke", source: "carly", metInScene: true, targetConsentedToContact: true })).toBe(true);
  });
});
