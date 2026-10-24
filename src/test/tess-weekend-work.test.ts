import {describe,it,expect} from "vitest";
import {scheduleFor,activeLifeEvent,tessWorkException} from "@/lib/tess-life";
import {storySchedule} from "@/lib/storyline-logic";
describe("Tess weekend work continuity",()=>{
 const saturday=new Date("2026-10-24T14:00:00Z");
 it("keeps Saturday as an off-day absent explicit overtime",()=>{
  expect(scheduleFor(saturday).activity).toContain("weekend");
  expect(tessWorkException(saturday,null)).toBe(false);
  expect(tessWorkException(saturday,{id:"staffing",summary:"staffing gap",mood:"stressed",availability:"busy",days:3})).toBe(false);
 });
 it("does not convert a clinic storyline into a Saturday shift",()=>{
  const base=scheduleFor(saturday);
  const result=storySchedule(base,{id:"story:clinic_rota",summary:"clinic shift coverage is uneven",mood:"stressed",availability:"busy",days:5});
  expect(result.availability).toBe(base.availability);
  expect(result.detail).toContain("off today");
 });
 it("allows an explicit overtime exception",()=>{
  expect(tessWorkException(saturday,{id:"overtime",summary:"extra shift",mood:"stressed",availability:"busy",days:1})).toBe(true);
 });
});
