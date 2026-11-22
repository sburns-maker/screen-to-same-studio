import {describe,it,expect} from "vitest";
import {openBackstageScene,restoreBackstageScene,appendBackstageTurn,finishBackstageScene} from "./world-order-backstage";
describe("World Order playable backstage rescue aftermath",()=>{
 it("starts a real conversation after the rescue without advancing the day",()=>{
  const s=openBackstageScene();expect(s.status).toBe("open");expect(s.turns[0]?.speaker).toBe("Sabrina");
  expect(s.turns[0]?.text).toContain("name");
 });
 it("allows multiple player and character turns before explicit exit",()=>{
  let scene=openBackstageScene();
  for(let i=0;i<7;i++){
   scene=appendBackstageTurn(scene,"player","I answer question "+i);
   scene=appendBackstageTurn(scene,"Sabrina","She responds "+i);
  }
  expect(scene.status).toBe("open");expect(scene.turns).toHaveLength(15);
  scene=finishBackstageScene(scene);
  expect(scene.status).toBe("finished");
  expect(appendBackstageTurn(scene,"player","More").turns).toHaveLength(15);
 });
 it("upgrades existing Day-2 saves without resetting the rest of the world",()=>{
  expect(restoreBackstageScene(undefined,true,false)?.status).toBe("open");
  expect(restoreBackstageScene(undefined,true,true)).toBeNull();
  expect(restoreBackstageScene(undefined,false,false)).toBeNull();
 });
 it("restores completed scene verbatim, never replaying it",()=>{
  const scene=finishBackstageScene(appendBackstageTurn(openBackstageScene(),"player","My name is Sean"));
  const restored=restoreBackstageScene(scene,true,false)!;
  expect(restored).toEqual(scene);
  expect(restored.status).toBe("finished");
 });
});