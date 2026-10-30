import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CHARACTERS, type CharacterKey } from "@/lib/characters";
import { SEED_STATE } from "@/lib/tess-logic";
import {
  characterCanPrivatelyReconsider,
  characterPrivateRomanticOutlook,
  characterMindPossibility,
} from "@/lib/romantic-outlook";
import { mindSummary } from "@/lib/character-mind-insights";

const matureConnection = {
  ...SEED_STATE,
  comfort: 90, trust: 85, emotional_intimacy: 80,
  romantic_attraction: 77, physical_attraction: 70,
  romantic_intent: 55, perceived_pressure: 1,
  irritation: 0,
};
const friendshipBoundary = [
  { sender: "user", body: "I'd love to go climbing together." },
  { sender: "tess", body: "I'd like that. We agreed to be friends for now." },
];
const romanticCast: CharacterKey[] = ["tess", "maya", "claire", "jordan", "riley", "sienna", "kendra"];

describe("private relationship possibilities for the full romantic cast", () => {
  it("offers every romance-capable character an individual private outlook when earned", () => {
    for (const key of romanticCast) {
      expect(CHARACTERS[key].romanticCapable).toBe(true);
      expect(characterCanPrivatelyReconsider(key, matureConnection)).toBe(true);
      const content = characterPrivateRomanticOutlook(key, matureConnection, "Mutual romantic curiosity", friendshipBoundary, []);
      expect(content).not.toBe("");
      expect(content.toLowerCase()).toContain("private");
      expect(content).toContain("friend");
      expect(characterMindPossibility(key, matureConnection, "Mutual romantic curiosity")).toContain("Possible private thought");
      expect(mindSummary(matureConnection, "Mutual romantic curiosity", key).notes[0]).toContain("Possible private thought");
    }
    expect(characterCanPrivatelyReconsider("ben", matureConnection)).toBe(false);
    expect(characterPrivateRomanticOutlook("ben", matureConnection, "Friendly connection", [], [])).toBe("");
    expect(characterMindPossibility("ben", matureConnection, "Friendly connection")).toBeNull();
  });

  it("Jordan processes attraction quietly and remembers friends-only boundaries", () => {
    const outlook = characterPrivateRomanticOutlook("jordan", matureConnection, "Flirty friendship", friendshipBoundary, []);
    expect(outlook).toContain("I've been thinking about him more than I planned");
    expect(outlook).toContain("inviting him climbing");
    expect(outlook).toContain("friends");
    expect(outlook).toContain("remains the outward agreement");
    expect(outlook).toContain("Never silently revoke");
    expect(outlook).toContain("She may choose to remain friends");
    expect(outlook).not.toContain("They are dating");
    expect(characterPrivateRomanticOutlook("jordan", matureConnection, "Flirty friendship", [], []))
      .not.toContain("She has previously stated a friendship boundary");
  });

  it("Maya, Tess, Sienna and Kendra retain different inner voices", () => {
    const voices = romanticCast.map(key => characterMindPossibility(key, matureConnection, "Mutual romantic curiosity") ?? "");
    expect(new Set(voices).size).toBe(romanticCast.length);
    expect(characterPrivateRomanticOutlook("maya", matureConnection, "Mutual romantic curiosity", [], []))
      .toContain("unhurried date");
    expect(characterPrivateRomanticOutlook("tess", matureConnection, "Mutual romantic curiosity", [], []))
      .toContain("guarded humor");
    expect(characterPrivateRomanticOutlook("sienna", matureConnection, "Mutual romantic curiosity", [], []))
      .toContain("spontaneous shared outing");
    expect(characterPrivateRomanticOutlook("kendra", matureConnection, "Mutual romantic curiosity", [], []))
      .toContain("genuine emotional curiosity");
  });

  it("does not question whether Riley is more than friends when already dating", () => {
    const outlook = characterPrivateRomanticOutlook("riley", matureConnection, "Established relationship", [], []);
    expect(outlook).toContain("relationship she already has");
    expect(outlook).toContain("how the relationship she already has might deepen");
    expect(outlook).not.toContain("Maybe there could be more here someday");
    const diagnostic = characterMindPossibility("riley", matureConnection, "Established relationship");
    expect(diagnostic).toContain("existing relationship");
    expect(diagnostic).toContain("NOT a saved reflection");
  });

  it("does not force new feelings when romance is absent, or in a pressuring situation", () => {
    for (const key of romanticCast) {
      for (const state of [
        { ...matureConnection, romantic_attraction: 0 },
        { ...matureConnection, romantic_intent: 0 },
        { ...matureConnection, perceived_pressure: 30 },
        { ...matureConnection, irritation: 40 },
      ]) {
        expect(characterCanPrivatelyReconsider(key, state)).toBe(false);
        expect(characterPrivateRomanticOutlook(key, state, "Friendly connection", [], [])).toBe("");
        expect(characterMindPossibility(key, state, "Friendly connection")).toBeNull();
      }
    }
  });

  it("wires reflection guidance into both Tess and contact reply generators", () => {
    const source = readFileSync("src/lib/tess.server.ts", "utf8");
    expect(source).toContain('characterPrivateRomanticOutlook("tess", args.state, args.stage, args.messages, args.memories)');
    expect(source).toContain("characterPrivateRomanticOutlook(c.key, args.state, args.stage, args.messages, args.memories)");
    expect(source).not.toContain("state.romantic_intent = 55");
  });
});
