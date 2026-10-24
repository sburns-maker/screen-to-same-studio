import {describe,it,expect} from "vitest";
import {recognizePlan,easternInstant,resolveDate,resolveTime,type CalendarPlan} from "@/lib/calendar-logic";
const base={id:"maya-dinner",conversation_id:"maya-chat",category:"dinner",status:"proposed",date_local:"2026-10-24",time_local:"19:00",place_key:"dinner:fanellis",source_message_id:"old",last_message_id:"old"} as CalendarPlan;
const msg=(body:string,sender="tess",created_at="2026-10-24T18:00:00Z")=>({id:"reply",conversation_id:"maya-chat",character_key:"maya",created_at,sender,body});
describe("mutual calendar agreement regressions",()=>{
 it("recognizes an ordinary AI acceptance without creating duplicate",()=>expect(recognizePlan(msg("Yes, Sunday at 7 PM works for me."),[base],"old")).toMatchObject({action:"accept",planId:"maya-dinner",time:"19:00",date:"2026-10-25"}));
 it("recognizes player agreement and retains same plan",()=>expect(recognizePlan(msg("Dinner, yes. Sunday at 7 PM works!","user"),[base],"old")).toMatchObject({action:"accept",planId:"maya-dinner",date:"2026-10-25"}));
 it("maps changed details onto existing dinner",()=>expect(recognizePlan(msg("Let's have dinner at Fanelli's Sunday October 25, 2026 at 7 PM","user"),[base],"old").planId).toBe("maya-dinner"));
 it("recognizes rescheduling without a second plan",()=>expect(recognizePlan(msg("Can we move our dinner to Sunday October 25 at 7 PM?","user"),[base],"old")).toMatchObject({action:"reschedule",planId:"maya-dinner"}));
 it("will not modify completed history",()=>expect(recognizePlan(msg("Sunday at 7 PM works for me."),[{...base,status:"completed"}],null).planId).toBeNull());
 it("uses Eastern time and rejects DST ambiguous or nonexistent slots",()=>{
  expect(easternInstant("2026-10-25","19:00")).toBe("2026-10-25T23:00:00.000Z");
  expect(easternInstant("2026-11-01","01:30")).toBeNull();
  expect(easternInstant("2026-03-08","02:30")).toBeNull();
  expect(resolveDate("Sunday October 25, 2026",new Date("2026-10-24T17:00:00Z"))).toBe("2026-10-25");
  expect(resolveTime("Sunday at 7 PM")).toBe("19:00");
 });
});
