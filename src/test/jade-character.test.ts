import { describe, expect, it } from "vitest";
import { CHARACTERS, characterFor } from "@/lib/characters";
import { supportsRelationshipCommitment, canShareCommitmentWithCharacter } from "@/lib/relationship-commitments";
import { characterInitiativeOpportunity } from "@/lib/character-initiative";
import { photographyProfile } from "@/lib/photo-personality";
import { PHOTO_INTENSITY_PROFILES } from "@/lib/photo-mature-personality";
import { eligiblePhotoCategories, suggestivePhotoEligible } from "@/lib/photo-policy";
import { WORKPLACES } from "@/lib/workplaces";
import { VOICE_DESIGN_KEYS } from "@/lib/live-voice-design";
import { CHARACTER_VOICE_PRESETS } from "@/lib/voice-audition-modes";
import { CANON_NPCS, CANON_LINKS } from "@/lib/social-logic";
import { SPICY_CAST } from "@/lib/spicy-image.server";

describe("Jade Monroe — independent adult character", () => {
  it("registers her own age, identity and storyline", () => {
    expect(characterFor("jade")).toMatchObject({key:"jade",fullName:"Jade Monroe",age:25,romanticCapable:true,photosEnabled:true});
    expect(CHARACTERS.jade.appearance).toMatch(/auburn|red/i);
    expect(CHARACTERS.jade.bible).toMatch(/marriage/i);
    expect(CHARACTERS.jade.opener).toMatch(/work meetings/i);
    expect(CHARACTERS.jade.opener).toMatch(/propose marriage/i);
    expect(CHARACTERS.jade.bible).toMatch(/ESTABLISHED WORK ACQUAINTANCE/);
    expect(CHARACTERS.jade.bible).toMatch(/PROFESSIONAL BOUNDARIES/);
    expect(supportsRelationshipCommitment("jade")).toBe(true);
    expect(canShareCommitmentWithCharacter("jade","kendra")).toBe(false);
  });
  it("has a separate workplace, real schedule, social circle and voice", () => {
    expect(WORKPLACES.jade.character).toBe("jade");
    expect(WORKPLACES.jade.label).toBe("Harbor Point Recovery Center");
    expect(WORKPLACES.jade.publicAccess).toBe("by_invitation");
    expect(CHARACTERS.jade.schedule).toMatchObject({workDays:[1,2,3,4,5],workStart:9,workEnd:17});
    expect(CANON_NPCS.filter(x=>x.characterKey==="jade")).toHaveLength(3);
    expect(CANON_LINKS.filter(x=>x.characterKey==="jade")).toHaveLength(3);
    expect(VOICE_DESIGN_KEYS).toContain("jade");
    expect(CHARACTER_VOICE_PRESETS.jade.prompt.length).toBeGreaterThan(40);
  });
  it("chooses private photo opportunities without turning every photo suggestive", () => {
    expect(photographyProfile("jade").key).toBe("jade");
    expect(PHOTO_INTENSITY_PROFILES.jade.maxCategory).toBe("suggestive");
    expect(SPICY_CAST).toContain("jade");
    const context = {character:"jade",age:25,romanticCapable:true,enabled:true,supported:CHARACTERS.jade.photoTypes,matureEnabled:true,boundary:"none" as const};
    expect(suggestivePhotoEligible(CHARACTERS.jade.seedState,context)).toBe(true);
    expect(eligiblePhotoCategories(CHARACTERS.jade.seedState,context)).toContain("suggestive");
    expect(eligiblePhotoCategories(CHARACTERS.jade.seedState,{...context,matureEnabled:false})).not.toContain("suggestive");
    expect(eligiblePhotoCategories(CHARACTERS.jade.seedState,{...context,boundary:"mature"})).not.toContain("suggestive");
  });
  it("treats a real yes to her marriage joke as follow-through, not an automatic wedding", () => {
    const base={key:"jade" as const,channel:"text" as const,state:CHARACTERS.jade.seedState,turnCount:5,availabilityDetail:"at home",latestCharacterMessage:"You know what? We should just get married 😂"};
    const serious=characterInitiativeOpportunity({...base,latestPlayerMessage:"Yes, I mean it."});
    expect(serious?.instruction).toMatch(/ENGAGEMENT|engagement/);
    expect(serious?.instruction).toMatch(/player.*explicit/i);
    expect(serious?.instruction).not.toMatch(/automatically married/);
    const ordinary=characterInitiativeOpportunity({...base,latestPlayerMessage:"What movie is on?"});
    expect(ordinary?.instruction).not.toMatch(/Her marriage comment was answered positively/);
  });
});