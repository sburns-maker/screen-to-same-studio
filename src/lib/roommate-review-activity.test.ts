import { describe, expect, it } from "vitest";
import { initialScene, transitionScene } from "./experience-scene";
import { housingInputSchema } from "./housing";

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
