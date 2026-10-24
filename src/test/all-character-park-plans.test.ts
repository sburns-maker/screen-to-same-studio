import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {recognizePlan,easternInstant,type CalendarPlan} from "@/lib/calendar-logic";
const sql=readFileSync("drizzle/migrations/0037_all_character_calendar_proposers.sql","utf8");
const base={id:"walk1",conversation_id:"tess-thread",category:"walk",status:"proposed",date_local:"2026-10-25",time_local:"13:00",place_key:"park:local",source_message_id:"proposal",last_message_id:"proposal"} as CalendarPlan;
const msg=(body:string,sender:string,time="2026-10-24T20:25:00Z")=>({id:"reply",conversation_id:"tess-thread",character_key:"tess",created_at:time,sender,body});
describe("all characters' park walk commitments",()=>{
 it("records initial acceptance for any AI proposer, not only Tess",()=>{
  expect(sql).toContain("CASE WHEN m.sender<>'user' THEN 'accepted' ELSE 'invited' END");
  expect(sql).not.toContain("CASE WHEN m.sender='tess' THEN 'accepted'");
 });
 it("recognizes tomorrow at 1 pm Eastern as Sunday Oct 25",()=>{
  const patch=recognizePlan(msg("How about a walk through Juniper Commons tomorrow at 1pm?","tess"),[],"prior");
  expect(patch).toMatchObject({action:"invite",category:"walk",date:"2026-10-25",time:"13:00",place:"park:local"});
  expect(easternInstant("2026-10-25","13:00")).toBe("2026-10-25T17:00:00.000Z");
 });
 it("accepts Tess's invitation in normal conversation",()=>expect(recognizePlan(msg("Sounds good to me!","user"),[base],"proposal")).toMatchObject({action:"accept",planId:"walk1"}));
 it("does not turn an existing completed park walk into a new outing",()=>expect(recognizePlan(msg("See you tomorrow at one.","tess"),[{...base,status:"completed"}],"proposal").action).toBe("none"));
});
