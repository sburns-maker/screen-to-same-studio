import { describe, expect, it } from "vitest";
import { applyCampaignChoice, currentCampaignScene, initialCampaign, normalizeCampaign } from "./world-order-campaign";

describe("World Order continuing Cuba campaign", () => {
  it("provides real character-driven scenes on every opening route", () => {
    for (const route of ["reform", "investment", "diplomacy"] as const) {
      const scene = currentCampaignScene(route, initialCampaign());
      expect(scene.character.length).toBeGreaterThan(3);
      expect(scene.setup.length).toBeGreaterThan(70);
      expect(scene.choices.length).toBeGreaterThanOrEqual(3);
    }
  });
  it("decisions change political support and stability as well as relationships", () => {
    const state = initialCampaign();
    const chosen = applyCampaignChoice("reform", state, "listen", 5);
    expect(chosen).not.toBeNull();
    expect(chosen!.state.stage).toBe(1);
    expect(chosen!.state.support).toBeGreaterThan(state.support);
    expect(chosen!.state.stability).toBeGreaterThan(state.stability);
    expect(chosen!.state.relations.Rafael).toBeGreaterThan(50);
    expect(chosen!.state.decisions[0]?.day).toBe(5);
    expect(state.stage).toBe(0);
  });
  it("rejects actions not offered in the current scene", () => {
    expect(applyCampaignChoice("reform", initialCampaign(), "exclusive", 4)).toBeNull();
  });
  it("moves to a second and third conflict, then a new round rather than ending", () => {
    let state = initialCampaign();
    for (let i=0; i<10; i++) {
      const scene = currentCampaignScene("diplomacy", state);
      const result = applyCampaignChoice("diplomacy", state, scene.choices[0]!.id, i + 4);
      expect(result).not.toBeNull();
      state = result!.state;
    }
    expect(state.stage).toBe(10);
    expect(state.decisions).toHaveLength(10);
    expect(currentCampaignScene("diplomacy", state).title).toContain("Round");
  });
  it("restores prior worlds that do not yet have campaign state", () => {
    expect(normalizeCampaign(undefined)).toEqual(initialCampaign());
    expect(normalizeCampaign({ stage: 3, support: 600, stability: -2 }).support).toBe(100);
    expect(normalizeCampaign({ stage: 3, support: 600, stability: -2 }).stability).toBe(0);
  });
  it("sets back legitimacy if the player repeatedly ignores public welfare", () => {
    let state = initialCampaign();
    const a = applyCampaignChoice("investment", state, "investor", 4)!;
    state = a.state;
    const b = applyCampaignChoice("investment", state, "contracts", 5)!;
    state = b.state;
    expect(state.support).toBeLessThan(15);
    expect(state.stability).toBeLessThan(44);
  });
});
