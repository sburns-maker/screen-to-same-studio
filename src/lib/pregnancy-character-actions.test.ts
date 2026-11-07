import {describe,it,expect} from "vitest";
import {pregnancyCharacterActionSchema,validPregnancyCharacterAction,pregnancyProgressionGuidance} from "./pregnancy-character-actions";
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
describe("character-specific pregnancy progression",()=>{
 const disclosure=[{sender:"tess",body:"I got a positive pregnancy test."}];
 it("does not invent an active pregnancy from a player's speculation",()=>{
  expect(pregnancyProgressionGuidance("kendra",[{sender:"user",body:"Could you be pregnant?"}],[])).toBe("");
 });
 it("gives Tess and Kendra distinct approaches without requiring a decision",()=>{
  const own=[{sender:"user",body:"How do you feel about the pregnancy?"},{sender:"tess",body:"I'm scared and need time."},{sender:"user",body:"What next?"},{sender:"tess",body:"I don't know what I want."}];
  const tess=pregnancyProgressionGuidance("tess",own,["Canonical pregnancy test positive"]);
  const kendra=pregnancyProgressionGuidance("kendra",own,["Canonical pregnancy test positive"]);
  expect(tess).toContain("Tess tends to think carefully");
  expect(kendra).toContain("Kendra genuinely wants motherhood");
  expect(tess).toContain("STALL SIGNAL");
  expect(kendra).toContain("STALL SIGNAL");
  expect(kendra).toContain("Never force a pregnancy outcome");
 });
 it("allows disclosure to establish the subject, without inventing decisions",()=>{
  expect(pregnancyProgressionGuidance("kendra",disclosure,[])).toContain("Kendra genuinely wants motherhood");
  expect(pregnancyProgressionGuidance("kendra",[{sender:"user",body:"I'm scared"}],["unrelated work notes"])).toBe("");
 });
 it("prefers joy for Kendra's wanted confirmed pregnancy without deciding for her",()=>{
  const messages=[{sender:"kendra",body:"My pregnancy test was positive."},{sender:"user",body:"How do you feel about it?"}];
  const guidance=pregnancyProgressionGuidance("kendra",messages,["Confirmed pregnancy"]);
  const sienna=pregnancyProgressionGuidance("sienna",messages,["Confirmed pregnancy"]);
  expect(guidance).toContain("genuinely wants motherhood");
  expect(guidance).toContain("openly excited");
  expect(guidance).toContain("Do not infer or invent pregnancy");
  expect(guidance).toContain("Never force a pregnancy outcome");
  expect(sienna).not.toContain("genuinely wants motherhood");
 });
 it("breaks repeated uncompleted doctor-call loops without inventing a visit",()=>{
  const messages=[
   {sender:"kendra",body:"I haven't talked to the doctor yet."},
   {sender:"user",body:"Did you call the doctor?"},
   {sender:"kendra",body:"I still need to call the doctor."},
   {sender:"user",body:"Any updates on the pregnancy?"},
  ];
  const guidance=pregnancyProgressionGuidance("kendra",messages,["pregnancy confirmed"]);
  expect(guidance).toContain("DOCTOR LOOP DETECTED");
  expect(guidance).toContain("Do not repeat");
  expect(guidance).toContain("do not replay");
  expect(guidance).toContain("a proposed appointment as booked");
 });
 it("stays quiet when an existing pregnancy is not the current subject",()=>{
  expect(pregnancyProgressionGuidance("tess",[{sender:"user",body:"How was trivia?"}],["Pregnancy confirmed"])).toBe("");
 });
});
