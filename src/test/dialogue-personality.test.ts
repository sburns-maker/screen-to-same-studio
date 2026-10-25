import { describe, expect, it } from "vitest";
import { CHARACTERS } from "@/lib/characters";
import {
  DIALOGUE_PROFILES,
  dialogueRules,
  dialogueContext,
  repeatedDialogueRoutines,
  isConversationClosing,
} from "@/lib/dialogue-personality";
import { enforceTessVoice, CONTACT_VOICE, cleanContactHistoryLine } from "@/lib/tess-voice";
import { topicGuidance } from "@/lib/tess-topics";
describe("distinct delivery without a universal joke template", () => {
  it("covers every primary character with distinct tendencies and preserves explicit canon boundaries", () => {
    expect(Object.keys(DIALOGUE_PROFILES).sort()).toEqual(Object.keys(CHARACTERS).sort());
    expect(new Set(Object.values(DIALOGUE_PROFILES).map((p) => JSON.stringify(p))).size).toBe(6);
    expect(dialogueRules("tess")).toContain("understated observation");
    expect(dialogueRules("maya")).toContain("Playful shared amusement");
    expect(dialogueRules("claire")).toContain("fully platonic");
    expect(dialogueRules("jordan")).toContain("straightforward thanks");
    expect(dialogueRules("ben")).toContain("entirely platonic");
    expect(dialogueRules("riley")).toContain("sleepy fragment");
    expect(dialogueRules("future-npc")).not.toContain("Tess's composed deadpan");
  });
  it("detects repeated patterns across characters without inventing events or banning factual subjects", () => {
    const lines = ["Objection, your honor.", "Exhibit A is your coffee."];
    expect(repeatedDialogueRoutines(lines)).toContain("courtroom/legal comic routine");
    expect(dialogueContext(lines, "What happened at actual jury duty?")).toContain(
      "not a ban on answering a factual question",
    );
    expect(repeatedDialogueRoutines(["I have jury duty.", "Coffee was fine."])).toEqual([]);
    expect(
      repeatedDialogueRoutines(["I have jury duty on Monday.", "Jury duty ends at five."]),
    ).toEqual([]);
    expect(repeatedDialogueRoutines([...lines, ...Array(10).fill("An ordinary answer.")])).toEqual(
      [],
    );
  });
  it("does not turn a factual boundary or calendar readback into silence", () => {
    for (const key of Object.keys(CONTACT_VOICE)) {
      const line = "Meet me at Valley Table at seven. Thank you for checking.";
      expect(enforceTessVoice([line], { ...CONTACT_VOICE[key], recentTess: [line] })).toEqual([
        line,
      ]);
      expect(cleanContactHistoryLine("I appreciate that. That means a lot.", key)).toBe(
        "I appreciate that. That means a lot.",
      );
    }
    expect(
      enforceTessVoice(["Please stop asking me for photos."], {
        recentTess: ["Please stop asking me for photos."],
      }),
    ).toEqual(["Please stop asking me for photos."]);
  });
  it("does not make Maya, Claire or Riley inherit Tess's presenter bans", () => {
    for (const key of ["maya", "claire", "riley"])
      expect(enforceTessVoice(["Get ready for a long story."], CONTACT_VOICE[key])).toEqual([
        "Get ready for a long story.",
      ]);
    expect(enforceTessVoice(["Get ready for a long story."])).toEqual([]);
    expect(enforceTessVoice(["Thanks for remembering."], CONTACT_VOICE["jordan"])).toEqual([
      "Thanks for remembering.",
    ]);
  });
  it("permits direct sincerity and deduplicates only the same output", () => {
    expect(
      enforceTessVoice(["That means a lot. Thanks for coming."], {
        recentTess: ["That means a lot. Thanks for coming."],
      }),
    ).toEqual(["That means a lot. Thanks for coming."]);
    expect(enforceTessVoice(["Seven still works.", "Seven still works."])).toEqual([
      "Seven still works.",
    ]);
    expect(dialogueContext([], "Please stop joking. I had a rough day.")).toContain(
      "without teasing",
    );
  });
  it("allows a goodbye but prioritizes unresolved questions and invitation details", () => {
    expect(isConversationClosing("Sounds good. Goodnight!")).toBe(true);
    expect(isConversationClosing("Sounds good, what time should I meet you?")).toBe(false);
    expect(topicGuidance([], "Sounds good, send me the address.", "claire")).not.toContain(
      "natural conversation ending",
    );
    expect(topicGuidance([], "Goodnight.", "claire")).toContain("natural conversation ending");
  });
  it("covers Riley's recurring topics and preserves a directly requested callback", () => {
    expect(
      topicGuidance(["Night shift again.", "Another night shift."], "How was your shift?", "riley"),
    ).toContain("unless he directly brings it up");
    expect(dialogueRules("riley", "experience")).toContain("In person");
  });
});
