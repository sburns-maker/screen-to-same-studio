import {describe,it,expect} from "vitest";
import {pregnancyCharacterActionSchema,validPregnancyCharacterAction} from "./pregnancy-character-actions";
const id="11111111-1111-4111-8111-111111111111";
describe("pregnancy character action verification",()=>{
 it("requires canonical lifecycle ID and exact own visible words",()=>{
  const action=pregnancyCharacterActionSchema.parse({kind:"decision",lifecycleId:id,choice:"continue",quote:"I've decided to continue this pregnancy."});
  expect(validPregnancyCharacterAction(action,"I've decided to continue this pregnancy.",[id])).toBe(true);
  expect(validPregnancyCharacterAction(action,"I am thinking about my choices.",[id])).toBe(false);
  expect(validPregnancyCharacterAction(action,"I've decided to continue this pregnancy.",[])).toBe(false);
 });
 it("rejects invalid appointment dates and unsupported outcomes",()=>{
  expect(pregnancyCharacterActionSchema.safeParse({kind:"appointment",lifecycleId:id,appointmentKind:"ultrasound",at:"tomorrow",quote:"I booked it."}).success).toBe(false);
  expect(pregnancyCharacterActionSchema.safeParse({kind:"outcome",lifecycleId:id,outcome:"twins",quote:"The twins were born."}).success).toBe(false);
 });
});