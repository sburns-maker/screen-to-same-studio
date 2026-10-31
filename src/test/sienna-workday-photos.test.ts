import { describe, expect, it } from "vitest";
import { CHARACTERS } from "@/lib/characters";
import { photoActivityBlock } from "@/lib/photo-activity";
import { photoContextForSchedule } from "@/lib/calendar-commitment";
import { photoChoiceInstruction } from "@/lib/photo-choice-opportunity";
import { photoOpportunity } from "@/lib/photo-opportunities";
import { planPhotography, photoLocation, photoSceneCompatible } from "@/lib/photo-personality";

const shift = {
  activity: "at work (Sienna's schedule: second-shift cocktail bartending, with private clients and independent plans)",
  detail: "at work (Sienna's schedule: second-shift cocktail bartending, with private clients and independent plans)",
  availability: "busy" as const,
};

describe("Sienna's workday photography", () => {
  it("strips biographical private-client schedule notes without moving her away from the bar", () => {
    expect(photoContextForSchedule(shift)).toBe("at work");
    expect(photoActivityBlock(shift)).toBeNull();
    expect(photoLocation(photoContextForSchedule(shift))).toBe("work");
    expect(photoLocation("standing behind the bar, working a shift")).toBe("work");
    expect(photoLocation("out with friends at the bar")).toBe("social");
  });

  it("permits a grounded shift selfie while busy rather than suppressing every scenario", () => {
    const plan = planPhotography({
      character: "sienna",
      key: "sienna-2026-10-31-work",
      now: new Date("2026-10-31T20:40:00Z"),
      schedule: shift,
    });
    expect(plan.location).toBe("work");
    expect(plan.candidates).toContain("work_moment");
    expect(plan.scenario).toBe("work_moment");
    expect(photoSceneCompatible(plan, "quick selfie behind the bar on shift")).toBe(true);
    expect(photoSceneCompatible(plan, "selfie at home on the couch")).toBe(false);

    const offered = photoOpportunity({
      character: "sienna",
      conversationId: "sienna-shift",
      now: new Date("2026-10-31T20:40:00Z"),
      schedule: shift,
      state: CHARACTERS.sienna.seedState,
      frequency: "normal",
      eligibleTypes: ["object", "casual_selfie"],
      lastPhotoAt: null,
      ownSinceLastPhoto: 99,
      gapHours: 0,
      context: photoContextForSchedule(shift),
      preview: true,
    });
    expect(offered.eligible).toBe(true);
    expect(offered.selected).toBe(true);
  });

  it("evaluates her direct everyday-photo requests regardless of the unsolicited photo draw", () => {
    const prompt = photoChoiceInstruction({
      character: "sienna",
      opportunitySelected: false,
      directOrdinaryRequest: true,
      eligibleTypes: ["object", "casual_selfie", "suggestive"],
      currentSetting: shift.detail,
    });
    expect(prompt).toContain("DIRECT EVERYDAY PHOTO REQUEST");
    expect(prompt).toContain("SIENNA AT WORK");
    expect(prompt).toContain("casual_selfie");
    expect(prompt).toContain("without needing to wait until her shift ends");
    expect(prompt).not.toContain("PRIVATE ROMANTIC PHOTO OPTION");
    expect(prompt).toContain("photo=null");
    const unprompted = photoChoiceInstruction({
      character: "sienna", opportunitySelected: true,
      eligibleTypes: ["object", "casual_selfie"], currentSetting: shift.detail,
    });
    expect(unprompted).toContain("SIENNA AT WORK");
  });

  it("still blocks actual private client work, driving, and sleeping", () => {
    const privateTask = { ...shift, activity: "private client photography session", detail: "handling private client portraits" };
    expect(photoActivityBlock(privateTask)).toBe("current activity is incompatible with a photo");
    expect(planPhotography({ character: "sienna", key: "private-task", now: new Date(), schedule: privateTask }).candidates).toEqual([]);
    expect(photoActivityBlock({ ...shift, activity: "driving to work", detail: "driving to work" })).not.toBeNull();
    expect(photoActivityBlock({ ...shift, availability: "asleep" })).toBe("asleep");
  });
});
