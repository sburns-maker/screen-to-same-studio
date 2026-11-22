import {describe,it,expect} from "vitest";
import {createInterviewScene,restoreInterviewScene,addInterviewExchange,closeInterviewScene,classifyInterviewTone,appendInterviewExchange,appendInterviewGuests,interviewNeedsGuestReply,interviewSuggestedReplies} from "./world-order-interview";
describe("World Order live televised interview",()=>{
 it("allows player-written dialogue over multiple exchanges",()=>{
  let scene=createInterviewScene();
  for(let n=0;n<4;n++)scene=addInterviewExchange(scene,"I would like to discuss accountability "+n,"The host responds "+n);
  expect(scene.turns).toHaveLength(9);
  expect(scene.status).toBe("open");
  expect(scene.turns.filter(t=>t.speaker==="player")).toHaveLength(4);
 });
 it("keeps the interview at the current chapter until user ends it",()=>{
  const scene=createInterviewScene();expect(scene.status).toBe("open");
  expect(closeInterviewScene(scene).status).toBe("finished");
  expect(addInterviewExchange(closeInterviewScene(scene),"Another question","Reply").turns).toHaveLength(1);
 });
 it("upgrades existing Day-3 interview saves and restores prior transcripts",()=>{
  expect(restoreInterviewScene(undefined,"interview")?.status).toBe("open");
  expect(restoreInterviewScene(undefined,"cuba")).toBeNull();
  const s=addInterviewExchange(createInterviewScene(),"The president's comments are funny","The host asks why");
  expect(restoreInterviewScene(s,"interview")).toEqual(s);
 });
 it("recognizes player intent without preset option limitations",()=>{
  expect(classifyInterviewTone("Let me tell a joke")).toBe("joke");
  expect(classifyInterviewTone("I have documented evidence")).toBe("facts");
  expect(classifyInterviewTone("How are you feeling?")).toBe("question");
 });
 it("preserves a host Sabrina host exchange before the player's next turn",()=>{
  const scene=createInterviewScene();
  expect(interviewNeedsGuestReply(scene)).toBe(true);
  const answered=appendInterviewGuests(scene,[
   {speaker:"Sabrina",text:"We helped families find shelter, and their safety matters most."},
   {speaker:"host",text:"Sean, how will the remaining families be helped?"},
  ],["Explain our evacuation efforts","Discuss the shelter","Challenge Washington's response"]);
  expect(answered.turns.map(t=>t.speaker)).toEqual(["host","Sabrina","host"]);
  expect(interviewNeedsGuestReply(answered)).toBe(false);
  const continued=appendInterviewExchange(answered,"Here is what we are doing",[
   {speaker:"host",text:"That answers the question. Tell us what comes next."},
   {speaker:"Sabrina",text:"I'd add that we need volunteers to keep helping families."},
  ],["Ask about volunteers","Describe next steps","Address accountability"]);
  expect(continued.turns.map(t=>t.speaker)).toEqual(["host","Sabrina","host","player","host","Sabrina"]);
  expect(interviewSuggestedReplies(continued)).toEqual(["Ask about volunteers","Describe next steps","Address accountability"]);
  expect(restoreInterviewScene(continued,"interview")).toEqual(continued);
 });
 it("does not allow NPCs to insert player speech or append to a finished interview",()=>{
  const scene=createInterviewScene();
  const after=appendInterviewExchange(scene,"I am speaking",[
   {speaker:"player" as "host",text:"This must not be inserted"},
   {speaker:"Sabrina",text:"The shelter needs more volunteers."},
  ]);
  expect(after.turns.map(t=>t.speaker)).toEqual(["host","player","Sabrina"]);
  const done=closeInterviewScene(after);
  expect(appendInterviewGuests(done,[{speaker:"Sabrina",text:"No further dialogue"}])).toEqual(done);
  expect(interviewNeedsGuestReply(done)).toBe(false);
 });

});