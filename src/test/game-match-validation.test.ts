import { describe, expect, it } from "vitest";
import { QUESTION_BANK } from "@/lib/game-trivia";
import { trivia, boardVerdict } from "@/lib/game-match-validation";
describe("server game validation",()=>{
 it("rejects forged trivia outcomes and repeated questions",()=>{
  expect(trivia({deck:Array(10).fill(0),answers:Array(10).fill(0)})).toBeNull();
  expect(trivia({deck:Array.from({length:10},(_,i)=>i),answers:Array(9).fill(0)})).toBeNull();
 });
 it("grades answers from the canonical question bank",()=>{
  const deck=Array.from({length:10},(_,i)=>i);
  const result=trivia({deck,answers:deck.map(i=>QUESTION_BANK[i].correct),characterKey:"tess"});
  expect(result?.player).toBe(10);
  expect(result?.outcome).not.toBe("loss");
 });
 it("rejects unfinished or impossible four-in-a-row matches",()=>{
  expect(boardVerdict({moves:[3,2,3]})).toBeNull();
  expect(boardVerdict({moves:[7]})).toBeNull();
  expect(boardVerdict({moves:Array(43).fill(0)})).toBeNull();
 });
 it("only accepts a match after an actual four-in-a-row",()=>{
  // The AI selects center or blocks, so fabricated alternating moves cannot certify a win.
  expect(boardVerdict({moves:[0,0,1,1,2,2,3]})).toBeNull();
 });
});
