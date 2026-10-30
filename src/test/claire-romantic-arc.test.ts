import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CHARACTERS } from "@/lib/characters";
import { SEED_STATE } from "@/lib/tess-logic";
import {
  claireMayBeReconsideringFriendship,
  claireHasExpressedFriendshipBoundary,
  clairePrivateRomanticOutlook,
  claireMindPossibility,
} from "@/lib/claire-romantic-arc";
import { mindSummary } from "@/lib/character-mind-insights";

const current = {
  ...SEED_STATE,
  comfort: 97,
  trust: 76,
  romantic_attraction: 51,
  physical_attraction: 59,
  curiosity: 75,
  emotional_intimacy: 69,
  perceived_pressure: 2,
  irritation: 0,
  romantic_intent: 25,
};
const recent = [
  { sender: "user", body: "I think your company might be the highlight of tonight." },
  { sender: "tess", body: "I'm looking forward to it, but I mean that as friends, like we talked about before." },
];

describe("Claire's friends-to-romance uncertainty", () => {
  it("recognizes private possibility at her existing state without raising scores", () => {
    expect(claireMayBeReconsideringFriendship(current)).toBe(true);
    expect(claireMindPossibility(current)).toContain("Maybe there could be more here someday");
    const summary = mindSummary(current, "Mutual romantic curiosity", "claire");
    expect(summary.notes[0]).toContain("not a saved reflection");
    expect(mindSummary(current, "Mutual romantic curiosity", "tess").notes.join(" ")).not.toContain("Maybe there");
    expect(current.romantic_intent).toBe(25);
  });

  it("preserves an explicitly stated friends-only evening in her private guidance", () => {
    expect(claireHasExpressedFriendshipBoundary(recent, [])).toBe(true);
    const outlook = clairePrivateRomanticOutlook(current, recent, []);
    expect(outlook).toContain("She explicitly framed their time together as friends");
    expect(outlook).toContain("STILL the current outward understanding");
    expect(outlook).toContain("she must choose to communicate that clearly herself");
    expect(outlook).toContain("Do not automatically raise romantic_intent");
    expect(outlook).not.toContain("They are now dating");
  });

  it("does not invent an agreement when no friendship statement is recorded", () => {
    expect(claireHasExpressedFriendshipBoundary([], ["relationship: they visited the library"])).toBe(false);
    expect(claireHasExpressedFriendshipBoundary([{ sender: "user", body: "My friends are coming" }], [])).toBe(false);
    expect(claireHasExpressedFriendshipBoundary([], ["relationship: we agreed to be friends"])).toBe(true);
    const outlook = clairePrivateRomanticOutlook(current, [], []);
    expect(outlook).toContain("Respect any friendship agreement or boundary established");
    expect(outlook).not.toContain("She explicitly framed their time together as friends");
  });

  it("does not manufacture romantic doubt under pressure or without developing feelings", () => {
    for (const state of [
      { ...current, romantic_attraction: 18 },
      { ...current, romantic_intent: 0 },
      { ...current, perceived_pressure: 25 },
      { ...current, irritation: 22 },
    ]) {
      expect(claireMayBeReconsideringFriendship(state)).toBe(false);
      expect(clairePrivateRomanticOutlook(state, recent, [])).toBe("");
      expect(claireMindPossibility(state)).toBeNull();
    }
  });

  it("keeps the original character identity and wires the nuance only to Claire", () => {
    expect(CHARACTERS.claire.romanticCapable).toBe(true);
    expect(CHARACTERS.claire.bible).toContain("A past decision to spend time together as friends is real");
    const replySource = readFileSync("src/lib/tess.server.ts", "utf8");
    expect(replySource).toContain('c.key === "claire" ? clairePrivateRomanticOutlook(args.state, args.messages, args.memories)');
    expect(replySource).toContain("CHARACTER_PERSPECTIVE_RULES");
    expect(replySource).not.toContain("state.romantic_intent = 55");
  });
});
