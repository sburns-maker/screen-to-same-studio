import { describe,expect,it } from "vitest";
import { isExplicitVow,hasMutualVows } from "./family-wedding-ceremony";
const at=new Date("2026-11-02T18:00:00Z");
const now="2026-11-02T17:00:00Z";
describe("recorded wedding ceremony verification",()=>{
 it("recognizes both actors' explicit vows in the completed interactive scene",()=>{
  expect(hasMutualVows([
   {source:"user",confirmed:true,body:"I do.",created_at:now},
   {source:"character",confirmed:false,body:"I do, too.",created_at:now},
  ],at)).toBe(true);
 });
 it("does not marry based on one participant, simulation narration or future events",()=>{
  expect(hasMutualVows([{source:"user",confirmed:true,body:"I do",created_at:now}],at)).toBe(false);
  expect(hasMutualVows([
   {source:"user",confirmed:true,body:"I do",created_at:now},
   {source:"simulation",confirmed:false,body:"They say I do",created_at:now},
  ],at)).toBe(false);
  expect(hasMutualVows([
   {source:"user",confirmed:true,body:"I do",created_at:now},
   {source:"character",confirmed:false,body:"I do",created_at:"2026-11-03T17:00:00Z"},
  ],at)).toBe(false);
 });
 it("does not treat a refusal or hypothetical as a vow",()=>{
  for(const phrase of ["I don't.","I do not.","I would say I do someday.","Just kidding, I do."]){
   expect(isExplicitVow(phrase)).toBe(false);
  }
 });
});
