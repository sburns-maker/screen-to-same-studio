import { describe, expect, it } from "vitest";
import { AFTER_DARK_CAST, canUnlockAfterDarkContact, nextBrookeIntroductionBeat } from "../lib/after-dark-cast";

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
  it("mentions Brooke early, then proposes a meetup without unlocking her", () => {
    expect(nextBrookeIntroductionBeat({ completedCarlyExchanges: 0, status: "not_mentioned", naturalOpening: true })).toBe("none");
    expect(nextBrookeIntroductionBeat({ completedCarlyExchanges: 1, status: "not_mentioned", naturalOpening: true })).toBe("mention");
    expect(nextBrookeIntroductionBeat({ completedCarlyExchanges: 3, status: "not_mentioned", naturalOpening: true })).toBe("mention");
    expect(nextBrookeIntroductionBeat({ completedCarlyExchanges: 2, status: "mentioned", naturalOpening: true })).toBe("offer_group_meet");
    expect(nextBrookeIntroductionBeat({ completedCarlyExchanges: 2, status: "mentioned", naturalOpening: false })).toBe("none");
    expect(nextBrookeIntroductionBeat({ completedCarlyExchanges: 4, status: "declined", naturalOpening: true })).toBe("none");
    expect(nextBrookeIntroductionBeat({ completedCarlyExchanges: 4, status: "met", naturalOpening: true })).toBe("none");
    expect(nextBrookeIntroductionBeat({ completedCarlyExchanges: 4, status: "contact_accepted", naturalOpening: true })).toBe("none");
  });
});
