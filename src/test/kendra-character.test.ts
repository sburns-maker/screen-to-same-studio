import { describe, expect, it } from "vitest";
import { CHARACTERS, characterFor, characterAvailability } from "@/lib/characters";
import { supportsRelationshipCommitment, canShareCommitmentWithCharacter } from "@/lib/relationship-commitments";
import { photographyProfile } from "@/lib/photo-personality";
import { VOICE_DESIGN_KEYS } from "@/lib/live-voice-design";
import { CHARACTER_VOICE_PRESETS } from "@/lib/voice-audition-modes";
import { CANON_NPCS, CANON_LINKS } from "@/lib/social-logic";
import { WORKPLACES, workplaceShiftLikely } from "@/lib/workplaces";

describe("Kendra Blake independent adult cast integration", () => {
  it("registers Kendra Blake, age 26, in Altoona rather than falling back to Tess", () => {
    expect(characterFor("kendra")).toMatchObject({ key: "kendra", fullName: "Kendra Blake", age: 26, zip: "16602", pronouns: "she/her" });
    expect(characterFor("kendra")).not.toBe(CHARACTERS.tess);
  });
  it("allows romance with no predetermined commitment", () => {
    expect(CHARACTERS.kendra.romanticCapable).toBe(true);
    expect(CHARACTERS.kendra.seedState.romantic_intent).toBe(0);
    expect(supportsRelationshipCommitment("kendra")).toBe(true);
    expect(canShareCommitmentWithCharacter("kendra", "ben")).toBe(false);
  });
  it("keeps daytime shoots separate from overnight sleep", () => {
    expect(workplaceShiftLikely("kendra", new Date("2026-10-28T18:00:00Z"))).toBe(true);
    expect(characterAvailability(CHARACTERS.kendra, new Date("2026-10-28T10:00:00Z")).availability).toBe("asleep");
    expect(workplaceShiftLikely("kendra", new Date("2026-10-29T00:00:00Z"))).toBe(false);
    expect(WORKPLACES.kendra.character).toBe("kendra");
  });
  it("uses her own photography and voice profiles", () => {
    expect(photographyProfile("kendra").key).toBe("kendra");
    expect(VOICE_DESIGN_KEYS).toContain("kendra");
    expect(CHARACTER_VOICE_PRESETS.kendra.prompt.length).toBeGreaterThan(40);
  });
  it("has her own friends plus a platonic friendship with Ben only", () => {
    expect(CANON_NPCS.filter(n => n.characterKey === "kendra").map(n => n.category)).toEqual(["friend", "coworker"]);
    const cross = CANON_LINKS.filter(n => n.characterKey === "kendra" && n.otherType === "character");
    expect(cross.map(l => [l.otherKey, l.level])).toEqual([["ben", "friend"]]);
    expect(CHARACTERS.ben.romanticCapable).toBe(false);
  });
});
