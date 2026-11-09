import { describe, expect, it } from "vitest";
import { AFTER_DARK_CAST, canUnlockAfterDarkContact, nextBrookeIntroductionBeat, canStartBrookeHelpText, BROOKE_MOVING_INTRO } from "../lib/after-dark-cast";

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
  it("offers moving help just after Carly's first meaningful conversation", () => {
    expect(nextBrookeIntroductionBeat({completedCarlyExchanges:0,status:"not_mentioned",naturalOpening:true})).toBe("none");
    expect(nextBrookeIntroductionBeat({completedCarlyExchanges:1,status:"not_mentioned",naturalOpening:true})).toBe("offer_help_text");
    expect(nextBrookeIntroductionBeat({completedCarlyExchanges:1,status:"not_mentioned",naturalOpening:false})).toBe("none");
    expect(nextBrookeIntroductionBeat({completedCarlyExchanges:2,status:"text_offered",naturalOpening:true})).toBe("none");
    expect(nextBrookeIntroductionBeat({completedCarlyExchanges:3,status:"declined",naturalOpening:true})).toBe("none");
    expect(BROOKE_MOVING_INTRO.initialCarlyLine).toMatch(/Mind texting her/);
  });
  it("lets texting start before the move only with both parties' consent", () => {
    expect(canStartBrookeHelpText({status:"text_offered",brookeAgreedToShareNumber:true,userAcceptedIntroduction:true})).toBe(true);
    expect(canStartBrookeHelpText({status:"text_offered",brookeAgreedToShareNumber:false,userAcceptedIntroduction:true})).toBe(false);
    expect(canStartBrookeHelpText({status:"text_offered",brookeAgreedToShareNumber:true,userAcceptedIntroduction:false})).toBe(false);
    expect(canStartBrookeHelpText({status:"not_mentioned",brookeAgreedToShareNumber:true,userAcceptedIntroduction:true})).toBe(false);
  });
});
