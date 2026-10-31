import {describe,expect,it} from "vitest";
import {verifyEncounterAction} from "./family-encounter-actions";
import {validPregnancyDisclosure} from "./family-pregnancy-disclosure";
const action={action:"completed" as const,quote:"We both wanted that, and it happened."};
const id="00000000-0000-4000-8000-000000000001";
describe("verified fictional encounter and privacy",()=>{
 it("accepts a completed player-authored scene and independent character acknowledgement",()=>{
  expect(verifyEncounterAction(action,action.quote,"We slept together.")).toBe(true);
  expect(verifyEncounterAction(action,action.quote,"We hooked up.")).toBe(true);
 });
 it("rejects hypothetical encounters or missing character acknowledgement",()=>{
  expect(verifyEncounterAction(action,"Maybe someday.","We slept together.")).toBe(false);
  expect(verifyEncounterAction(action,action.quote,"I wish we hooked up.")).toBe(false);
  expect(verifyEncounterAction(action,action.quote,"Maybe we could hook up later.")).toBe(false);
 });
 it("requires a due canonical event and exact visible quote for disclosure",()=>{
  const disclosure={eventId:id,quote:"I have something important to share with you."};
  expect(validPregnancyDisclosure(disclosure,disclosure.quote,[id])).toBe(true);
  expect(validPregnancyDisclosure(disclosure,disclosure.quote,[])).toBe(false);
  expect(validPregnancyDisclosure(disclosure,"Hello!",[id])).toBe(false);
 });
});
