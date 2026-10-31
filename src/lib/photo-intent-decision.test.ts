import { describe, expect, it } from "vitest";
import { interpretPhotoIntent, photoIntentDecisionSchema } from "./photo-decision-batch.functions";

const base = { explanation: "A quiet evening", reason: "no_natural_impulse" as const,
  category: null, captionIdea: null };
describe("two-stage photo choice", () => {
  it("records genuine non-initiation, with an explicit rationale", () => {
    const d = photoIntentDecisionSchema.parse({ ...base, initiate:false, medium:"none" });
    expect(interpretPhotoIntent(d, ["object"]).action).toBe("silence");
    expect(d.explanation).toBeTruthy();
  });
  it("keeps an initiated text distinct from silence", () => {
    const d = photoIntentDecisionSchema.parse({ ...base, initiate:true, medium:"text" });
    expect(interpretPhotoIntent(d, ["object"]).action).toBe("text_only");
  });
  it("validates the selected category without forcing any photo", () => {
    const d = photoIntentDecisionSchema.parse({...base, initiate:true,medium:"photo_with_caption",category:"object"});
    expect(interpretPhotoIntent(d,["object"]).action).toBe("photo");
    expect(interpretPhotoIntent(d,["casual_selfie"]).validation).toBe("category_not_eligible");
  });
  it("separates unexplained noncommittal initiation from intentional silence", () => {
    const d = photoIntentDecisionSchema.parse({...base,initiate:true,medium:"none"});
    expect(interpretPhotoIntent(d,["object"]).action).toBe("unexplained_silence");
  });
});