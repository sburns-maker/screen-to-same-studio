import { describe, expect, it } from "vitest";
import { NINA_PROFILE, NINA_STORY_RULES, ninaEventVisibleTo } from "./nina-cast";
describe("Nina's independent introduction", () => {
  it("knows about the engagement without sharing private messages", () => {
    expect(NINA_PROFILE.establishedPublicKnowledge.join(" ")).toMatch(/engaged/);
    expect(ninaEventVisibleTo("kendra", {kind:"private_text",speaker:"nina",messageId:"m1"})).toBe(false);
    expect(ninaEventVisibleTo("nina", {kind:"private_photo",sender:"nina",messageId:"p1"})).toBe(true);
  });
  it("shares only recorded group events and disclosures", () => {
    expect(ninaEventVisibleTo("kendra", {kind:"shared_encounter",participants:["player","nina"],eventId:"e1"})).toBe(false);
    expect(ninaEventVisibleTo("kendra", {kind:"explicit_disclosure",speaker:"nina",recipients:["kendra"],eventId:"e2"})).toBe(true);
    expect(ninaEventVisibleTo("nina", {kind:"shared_encounter",participants:["kendra","nina"],eventId:"e3"})).toBe(true);
  });
  it("requires individually approved identity and a recorded opener", () => {
    expect(NINA_PROFILE.openingPhotoAsset).toContain("nina-opening");
    expect(NINA_PROFILE.employer).toBe("Victoria’s Secret");
    expect(NINA_PROFILE.jobTitle).toBe("Sales Associate");
    expect(NINA_PROFILE.workSchedule.workDays).toContain(6);
    expect(NINA_PROFILE.jobDescription).toMatch(/customer private details/);
    expect(NINA_STORY_RULES.join(" ")).toMatch(/idempotent/);
    expect(NINA_STORY_RULES.join(" ")).toMatch(/canonical identity/);
  });
});
