import { describe, expect, it } from "vitest";
import { CHARACTERS, characterFor, characterAvailability } from "@/lib/characters";
import { supportsRelationshipCommitment, canShareCommitmentWithCharacter } from "@/lib/relationship-commitments";
import { photographyProfile } from "@/lib/photo-personality";
import { VOICE_DESIGN_KEYS } from "@/lib/live-voice-design";
import { CHARACTER_VOICE_PRESETS } from "@/lib/voice-audition-modes";
import { CANON_NPCS, CANON_LINKS } from "@/lib/social-logic";
import { WORKPLACES, workplaceShiftLikely } from "@/lib/workplaces";

describe("Sienna Hayes independent adult cast integration", () => {
  it("registers Sienna Hayes, age 29, in Altoona rather than falling back to Tess", () => {
    expect(characterFor("sienna")).toMatchObject({key:"sienna",fullName:"Sienna Hayes",age:29,zip:"16602",pronouns:"she/her"});
    expect(characterFor("sienna")).not.toBe(CHARACTERS.tess);
  });
  it("allows romance without granting immediate commitment or sharing another character's decisions", () => {
    expect(CHARACTERS.sienna.romanticCapable).toBe(true);
    expect(CHARACTERS.sienna.seedState.romantic_intent).toBe(0);
    expect(supportsRelationshipCommitment("sienna")).toBe(true);
    expect(canShareCommitmentWithCharacter("sienna", "riley")).toBe(false);
    expect(canShareCommitmentWithCharacter("sienna", "sienna")).toBe(true);
  });
  it("keeps second shift separate from daytime sleep and independent free time", () => {
    const shift = new Date("2026-10-28T22:00:00Z");
    expect(workplaceShiftLikely("sienna", shift)).toBe(true);
    expect(characterAvailability(CHARACTERS.sienna, shift).availability).toBe("limited");
    expect(characterAvailability(CHARACTERS.sienna, new Date("2026-10-28T08:00:00Z")).availability).toBe("asleep");
    expect(workplaceShiftLikely("sienna", new Date("2026-10-28T17:00:00Z"))).toBe(false);
    expect(WORKPLACES.sienna.character).toBe("sienna");
  });
  it("uses her own photography and voice profiles without activating paid sessions", () => {
    expect(photographyProfile("sienna").key).toBe("sienna");
    expect(VOICE_DESIGN_KEYS).toContain("sienna");
    expect(CHARACTER_VOICE_PRESETS.sienna.prompt.length).toBeGreaterThan(40);
    expect(CHARACTERS.sienna.photosEnabled).toBe(true);
  });
  it("gives her an independent friend and coworker without cross-character knowledge links", () => {
    expect(CANON_NPCS.filter(n=>n.characterKey==="sienna").map(n=>n.category)).toEqual(["friend","coworker"]);
    expect(CANON_LINKS.filter(n=>n.characterKey==="sienna").every(n=>n.otherType==="npc")).toBe(true);
  });
});