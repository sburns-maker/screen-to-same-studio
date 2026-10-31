import { describe, expect, it } from "vitest";
import { validateWeddingAction, weddingPlanActionSchema } from "./family-wedding-actions";
const id = "00000000-0000-4000-8000-000000000001";
describe("wedding plan action verification", () => {
  const accepted={action:"accept" as const,planId:id,quote:"Yes, I want to plan that ceremony with you."};
  it("permits a specific independently expressed character acceptance",()=>{
    expect(validateWeddingAction(accepted,accepted.quote,[id])).toBe(true);
  });
  it("does not infer agreement from flirtation or an unrelated plan",()=>{
    expect(validateWeddingAction(accepted,"Maybe someday!",[id])).toBe(false);
    expect(validateWeddingAction(accepted,accepted.quote,[])).toBe(false);
  });
  it("permits deferral and rejects malformed provenance",()=>{
    expect(validateWeddingAction(null,"Let's talk about dates later.",[id])).toBe(false);
    expect(weddingPlanActionSchema.safeParse({action:"accept",planId:id,quote:""}).success).toBe(false);
  });
  it("can record an actual refusal without forced acceptance",()=>{
    const decline={action:"decline" as const,planId:id,quote:"I'm not comfortable committing to that wedding date."};
    expect(validateWeddingAction(decline,decline.quote,[id])).toBe(true);
  });
});
