import { describe, expect, it } from "vitest";
import { invitationGuidance } from "@/lib/experience-invitations";
const base = { key: "tess" as const, availability: "free", detail: "off duty", hasSharedPlan: false, hasActiveExperience: false };
describe("spontaneous character invitations", () => {
  it("never treats an invitation as an agreed or saved plan", () => {
    const guidance = invitationGuidance(base);
    expect(guidance).toContain("NOT an accepted plan");
    expect(guidance).toContain("mutual confirmation");
    expect(guidance).toContain("MAY independently suggest");
  });
  it("does not pressure asleep or busy characters into immediate meetings", () => {
    for (const availability of ["asleep", "busy"]) {
      const guidance = invitationGuidance({ ...base, availability });
      expect(guidance).toContain("Do not offer an immediate meetup");
    }
  });
  it("protects an already-active outing from being replaced", () => {
    expect(invitationGuidance({ ...base, hasActiveExperience: true })).toContain("do not replace it");
    expect(invitationGuidance({ ...base, hasSharedPlan: true })).toContain("do not replace it");
  });
  it("keeps Ben's suggestions platonic and Riley's after her overnight shift", () => {
    expect(invitationGuidance({ ...base, key: "ben" })).toContain("strictly platonic");
    expect(invitationGuidance({ ...base, key: "riley" })).toContain("daytime sleep");
  });
});
