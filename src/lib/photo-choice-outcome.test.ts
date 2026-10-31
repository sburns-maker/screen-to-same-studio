import { describe,expect,it } from "vitest";
import { classifyPhotoChoice, summarizePhotoDecisionBatch } from "./spontaneous-photo-flow";
describe("photo decision diagnostic classification",()=>{
 it("distinguishes voluntary silence and text from generation failures",()=>{
  expect(classifyPhotoChoice({evaluated:true,eligible:true,photoSelected:false,hasText:false})).toBe("silence");
  expect(classifyPhotoChoice({evaluated:true,eligible:true,photoSelected:false,hasText:true})).toBe("text_only");
  expect(classifyPhotoChoice({evaluated:false,eligible:true,photoSelected:false,hasText:false})).toBe("ineligible");
  expect(classifyPhotoChoice({evaluated:true,eligible:true,photoSelected:true,hasText:false,generationAttempted:true,generationSucceeded:false})).toBe("generation_failed");
  expect(classifyPhotoChoice({evaluated:true,eligible:true,photoSelected:true,hasText:false,deliveryAttempted:true,deliverySucceeded:false})).toBe("delivery_failed");
 });
 it("counts outcomes without guaranteeing a photo",()=>{
  const result=summarizePhotoDecisionBatch(["silence","text_only","photo","silence"]);
  expect(result.total).toBe(4);
  expect(result.counts.silence).toBe(2);
  expect(result.counts.photo).toBe(1);
  expect(result.photoChoiceRate).toBe(.25);
  expect(summarizePhotoDecisionBatch([]).photoChoiceRate).toBe(0);
 });
});
