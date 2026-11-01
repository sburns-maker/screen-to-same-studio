import { describe, expect, it } from "vitest";
import { CHARACTERS } from "@/lib/characters";
import { siennaMarriageReflectionGuidance } from "@/lib/sienna-marriage-reflection";

const user = (body: string) => ({ source: "user", body });
const sienna = (body: string) => ({ source: "sienna", body });
const intro = user("I show you the Wildcard Wedding casting listing on my phone. The show offers a million, but I care more about you.");
const history = [
  intro,
  sienna("I'm intrigued, but I'm not ready to promise marriage tonight."),
  user("I understand. No wedding deadline; let's just enjoy dinner."),
  sienna("Let's have a strange dessert together."),
  user("I'll follow your lead. Let's go make a memory."),
  sienna("Right, we'll head outside after dinner."),
  user("We finish the check and head out together."),
  sienna("We walk right and see what the night brings."),
];
const state = { ...CHARACTERS.sienna.seedState, perceived_pressure: 0, irritation: 0 };
const guide = (moments = history, character = "sienna", override = state) =>
  siennaMarriageReflectionGuidance({ character, moments, state: override });

describe("Sienna's independent proposal reflection in interactive scenes", () => {
  it("does not invent a wedding conversation without evidence of the shared real listing", () => {
    expect(guide(history.slice(1))).toBe("");
    expect(guide(history, "riley")).toBe("");
    expect(guide(history.slice(0, 4))).toBe("");
  });

  it("gives Sienna a way to reopen the conversation herself after her honest hesitation", () => {
    const result = guide();
    expect(result).toContain("take the lead on the unresolved idea");
    expect(result).toContain("you told him you were not ready");
    expect(result).toContain("ONE meaningful question");
    expect(result).toContain("not a forced yes");
    expect(result).toContain("not a forced yes, proposal or wedding");
  });

  it("does not create a marriage commitment, prize or magical correct answer", () => {
    const result = guide();
    expect(result).toContain("make his answer an automatic");
    expect(result).toContain("correct password");
    expect(result).toContain("million-dollar prize");
    expect(result).toContain("Never imply");
    expect(result).toContain("marital status");
  });

  it("honors pressure, firm refusals, and direct proposals rather than steering to yes", () => {
    expect(guide(history, "sienna", { ...state, perceived_pressure: 21 })).toBe("");
    expect(guide([...history, user("Come on, just say yes already!")])).toBe("");
    expect(guide([...history, sienna("I have decided not to marry you.")])).toBe("");
    expect(guide([...history, user("Sienna, will you marry me?")])).toBe("");
  });

  it("does not loop the same question; after an answer, asks her to decide in her own voice", () => {
    const question = sienna("I've been thinking about that marriage idea. If the cameras and money disappeared, would you still choose me?");
    expect(guide([...history, question])).toBe("");
    const answer = user("Yes. I'd still be there for the ordinary Tuesdays when the cameras are gone.");
    const next = guide([...history, question, answer]);
    expect(next).toContain("OWN QUESTION HAS BEEN ANSWERED");
    expect(next).toContain("automatic engagement");
    expect(guide([...history, question, answer, sienna("That means a lot to me.")])).toBe("");
  });
});
