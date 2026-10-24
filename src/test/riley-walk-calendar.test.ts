import {describe,it,expect} from "vitest";
import {recognizePlan,resolveAfternoonTime,type CalendarPlan} from "@/lib/calendar-logic";
const time="2026-10-24T20:38:00Z";
const msg=(body:string,sender:string,id:string)=>({id,conversation_id:"riley-thread",character_key:"riley",created_at:time,sender,body});
const pending={id:"walk-plan",conversation_id:"riley-thread",category:"walk",status:"proposed",date_local:"2026-10-24",time_local:"17:00",place_key:"park:local",source_message_id:"offer",last_message_id:"offer"} as CalendarPlan;
describe("Riley same-day walking date",()=>{
 it("understands 'at 5' in Eastern Saturday afternoon",()=>expect(resolveAfternoonTime("Let's do Juniper Commons at 5?",new Date(time))).toBe("17:00"));
 it("understands 'at five' in Eastern Saturday afternoon",()=>expect(resolveAfternoonTime("See you at five at the map point",new Date(time))).toBe("17:00"));
 it("creates the Juniper Commons walking invitation",()=>expect(recognizePlan(msg("Sure, let's do Juniper Commons at 5? We can meet at the virtual map point.","riley","offer"),[],"previous")).toMatchObject({action:"invite",category:"walk",date:"2026-10-24",time:"17:00",place:"park:local"}));
 it("accepts the player's conversational yes against the same existing plan",()=>expect(recognizePlan(msg("Sounds good to me!","user","player-accept"),[pending],"offer")).toMatchObject({action:"accept",planId:"walk-plan"}));
 it("recognizes Riley's explicit confirmation without creating a duplicate",()=>expect(recognizePlan(msg("See you at five at the map point 😁","riley","riley-confirm"),[pending],"player-accept")).toMatchObject({action:"accept",planId:"walk-plan",time:"17:00"}));
 it("does not revive a finished outing",()=>expect(recognizePlan(msg("See you at five at the map point","riley","another"),[{...pending,status:"completed"}],"offer").action).toBe("none"));
 it("does not assume 5 PM from a morning message",()=>expect(resolveAfternoonTime("at 5",new Date("2026-10-24T13:00:00Z"))).toBeUndefined());
});
