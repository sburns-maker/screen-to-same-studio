import { describe, expect, it } from "vitest";
import { experienceInstructions, windowExperienceHistory, type ExperienceMoment } from "./living-experiences";

const moment = (source: string, body: string, ordinal: number): ExperienceMoment => ({
  id: `moment-${ordinal}`,
  user_id: "player",
  experience_id: "outing",
  ordinal,
  kind: "text",
  body,
  source,
  confirmed: true,
  created_at: "2026-11-06T20:00:00Z",
});

describe("commitment continuity across long experiences", () => {
  it("keeps both the player's paperwork claim and the character's refusal in long histories", () => {
    const history = [
      moment("character", "The evening starts with a walk.", 0),
      moment("user", "We talk about the thrift store.", 1),
      moment("character", "I am excited to choose outfits.", 2),
      moment("character", "I want to be your wife, but we should verify the requirements together.", 3),
      moment("user", "I have a wedding dress and a preacher. The county paperwork is approved.", 4),
      moment("character", "I am not getting legally married tonight. I want to verify it with you tomorrow.", 5),
      ...Array.from({ length: 30 }, (_, i) => moment(i % 2 ? "user" : "character", `We walk around the park and discuss the scenery ${i}.`, i + 6)),
    ];
    const promptHistory = windowExperienceHistory("turn", history);
    expect(promptHistory.some((x) => x.body.includes("county paperwork is approved"))).toBe(true);
    expect(promptHistory.some((x) => x.body.includes("not getting legally married tonight"))).toBe(true);
    expect(promptHistory.some((x) => x.body.includes("commitment evidence"))).toBe(true);
  });

  it("instructs the model not to treat a wedding proposal as acceptance or a verified marriage", () => {
    const instructions = experienceInstructions("turn", "A walk", "Juniper Commons", [
      moment("character", "I want to be your wife, but not tonight.", 0),
      moment("user", "I understand. We can wait.", 1),
    ]);
    expect(instructions).toContain("not itself acceptance");
    expect(instructions).toContain("that remains tonight's decision");
    expect(instructions).toContain("do not declare legal validity independently");
  });
});
