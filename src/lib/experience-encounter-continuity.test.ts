import { describe, expect, it } from "vitest";
import { initialScene, transitionScene, replayScene } from "./experience-scene";
import { completedEncounterNarration, reconcileExperienceEncounter, experienceEncounterId, verifyEncounterAction } from "./family-encounter-actions";
import { experienceStarters } from "./experience-suggestions";
import { createPendingPregnancyEvent, resolvePregnancyEvent } from "./family-life";

const homes = { user: "home:user", character: "home:nina" };
const nina24 = "*We finish dinner. I take care of the bill, and we head back to her place together.*\n*Once inside, I turn toward her with a smile.*\n*That night, Nina and I willingly have sex for the first time.*\n**Fade to black.**";
const t = (s: string, i: string, c = "x") => ({ id: i, source: s, body: c, confirmed: true, created_at: `2026-11-13T00:${i.padStart(2, "0")}:00Z` });

describe("restaurant-to-home continuity", () => {
  it("moves from Valley Table to Nina's home interior", () => {
    const s = transitionScene(initialScene("nina", "diner:valley", "Valley Table"), nina24, "nina", "Nina", homes)!;
    expect(s.locationKey).toBe("home:nina");
    expect(s.locationKind).toBe("home");
    expect(s.area).toBe("inside");
    expect(s.activity).toBe("private_moment");
  });
  it("replay self-heals a stale outdoor walking scene", () => {
    const r = replayScene(initialScene("nina", "diner:valley", "Valley Table"), [t("user", "1", "*We finish walking to her place, and I follow her inside.*")], "nina", "Nina", homes);
    expect(r.scene.locationKey).toBe("home:nina");
    expect(r.scene.area).toBe("inside");
  });
  it("a character invitation alone does not move anyone", () => {
    expect(transitionScene(initialScene("nina", "diner:valley", "Valley Table"), "So how about we get out of here?", "nina", "Nina", homes)).toBeNull();
  });
});

describe("intimacy recognition", () => {
  it("recognises clearly completed non-graphic encounters", () => {
    expect(completedEncounterNarration(nina24)).toBe(true);
    expect(completedEncounterNarration("We choose to spend the night together as lovers, sharing an evening that progresses beyond kissing.")).toBe(true);
  });
  it("ignores attraction, kissing, proposals and hypotheticals", () => {
    for (const s of ["I'm attracted to you.", "We kiss again, slowly.", "We both want to take our intimacy further.", "Maybe we could have sex later?", "I wish we had sex.", "We didn't have sex."])
      expect(completedEncounterNarration(s)).toBe(false);
  });
  it("structured action still needs the exact character quote", () => {
    expect(verifyEncounterAction({ action: "completed", quote: "I'm glad we chose this." }, "Hello", nina24)).toBe(false);
  });
});

describe("exactly-once reconciliation", () => {
  const moments = [t("character", "1", "Let's finish dinner, then come back to my place. I want some privacy with you."), t("user", "2", nina24), t("character", "3"), t("user", "4", "We had sex again, it was lovely.")];
  it("requires the character's own prior willingness", () => {
    expect(reconcileExperienceEncounter([t("user", "2", nina24)])).toBeNull();
    expect(reconcileExperienceEncounter([t("character", "1", "I want you."), t("character", "2", "Not tonight."), t("user", "3", nina24)])).toBeNull();
  });
  it("returns the first qualifying moment; repeats share one experience-scoped encounter id", () => {
    expect(reconcileExperienceEncounter(moments)?.id).toBe("2");
    expect(experienceEncounterId("f28d")).toBe("experience:f28d");
  });
});

describe("pregnancy probability rules are unchanged", () => {
  const base = { id: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002", characterKey: "nina" as const, encounterId: "experience:x", occurredAt: "2026-11-13T00:49:00Z", pregnancyPossible: true, mutuallyAgreed: true, adultEligible: true, probability: 0.2 };
  it("roll below 20% is positive after the reveal delay; above is negative", () => {
    const late = new Date("2026-11-14T00:00:00Z");
    expect(resolvePregnancyEvent(createPendingPregnancyEvent({ ...base, randomRoll: 0.1 }), late).status).toBe("positive");
    expect(resolvePregnancyEvent(createPendingPregnancyEvent({ ...base, randomRoll: 0.5 }), late).status).toBe("negative");
  });
});

describe("context-sensitive suggestions", () => {
  it("no park bench or coffee outside a park, and none inside a home", () => {
    const labels = experienceStarters("walking", { locationKind: "restaurant", area: "outside" }).map((x) => x.label);
    expect(labels).not.toContain("Find a bench");
    expect(experienceStarters("private_moment", { locationKind: "home", area: "inside" }).map((x) => x.label)).not.toContain("Find a bench");
  });
});
