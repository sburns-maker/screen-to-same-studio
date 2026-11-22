import {describe,it,expect} from "vitest";
import {createInterviewScene,restoreInterviewScene,addInterviewExchange,closeInterviewScene,classifyInterviewTone} from "./world-order-interview";
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
});