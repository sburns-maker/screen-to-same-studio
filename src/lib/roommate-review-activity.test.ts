import { describe, expect, it } from "vitest";
import { initialScene, transitionScene } from "./experience-scene";
import { housingInputSchema, housingDecisionGuidance } from "./housing";

describe("review roommate plan home activity", () => {
  const scene = { ...initialScene("tess", "home:user", "Player home"), area: "inside" };
  it("enters review activity for a performed budget conversation", () => {
    const next = transitionScene(scene, "We sit down and review the roommate agreement and rent.", "tess", "Tess");
    expect(next?.activity).toBe("reviewing_roommate_plan");
  });
  it("does not mark an activity from merely inviting discussion", () => {
    expect(transitionScene(scene, "Would you like to sit down and review rent tomorrow?", "tess", "Tess")).toBeNull();
  });
  it("keeps a planning meeting distinct from a move proposal", () => {
    expect(housingInputSchema.parse({
      command: "propose_move",
      payload: { place: "home:user", movers: ["user", "tess"], startsAt: null, kind: "move", purpose: "roommates" },
    }).command).toBe("propose_move");
    expect(scene.activity).not.toBe("reviewing_roommate_plan");
  });
});

describe("roommate decision follow-through", () => {
  const messages = [
    { sender: "user", body: "Would you consider moving in with me?" },
    { sender: "tess", body: "Let's talk tomorrow. I need more time." },
    { sender: "user", body: "I'd support you whether or not you keep the pregnancy. We could be roommates." },
    { sender: "tess", body: "I don't want to decide tonight. Let's talk it through tomorrow." },
  ];
  it("does not treat a scheduled future discussion as an already accepted move", () => {
    const text = housingDecisionGuidance({character:"tess",messages});
    expect(text).toContain("preserve it");
    expect(text).toContain("never treat it as a completed move");
    expect(text).toContain("concrete preference");
  });
  it("prompts a concrete position during the actual scheduled roommate meeting", () => {
    const text = housingDecisionGuidance({
      character:"tess",messages,
      experienceInstruction:"Roommate discussion and dinner at my home. Review living arrangements and rent.",
    });
    expect(text).toContain("THIS IS THE SCHEDULED HOUSING DISCUSSION");
    expect(text).toContain("Give a definite *current* position");
    expect(text).toContain("Keep pregnancy, marriage, and housing as distinct decisions");
  });
  it("leaves unrelated conversations alone", () => {
    expect(housingDecisionGuidance({character:"tess",messages:[{sender:"user",body:"How is Mabel doing?"}]})).toBe("");
  });
  it("does not force premature choice from one initial question", () => {
    expect(housingDecisionGuidance({character:"tess",messages:[{sender:"user",body:"Would you want to live together?"}]})).toBe("");
  });
});
