import {describe,it,expect} from "vitest";
import {icelandTripIdea,addCompanion,respondCompanion,acceptTrip,tripScenePrompt,validateTrip,alignIcelandItineraryToDates} from "@/lib/travel-experiences";
describe("Travel experience lifecycle",()=>{
 it("keeps Iceland an unbooked dream and offers multi-day scenes",()=>{
  const p=icelandTripIdea();
  expect(p.status).toBe("idea"); expect(p.startDate).toBeNull();
  expect(new Set(p.itinerary.map(s=>s.day)).size).toBeGreaterThan(1);
 });
 it("spaces existing Iceland stops across a seven-day trip and preserves added stops",()=>{
  const p=icelandTripIdea();
  const custom={id:"custom-stop",day:3,label:"Work meeting",location:"Reykjavík",kind:"work" as const,completed:false};
  const week=alignIcelandItineraryToDates({...p,startDate:"2026-11-23",endDate:"2026-11-29",itinerary:[...p.itinerary,custom]});
  expect(week.itinerary.find(s=>s.id==="iceland-5")?.day).toBe(7);
  expect(week.itinerary.find(s=>s.id==="iceland-4")?.day).toBe(6);
  expect(week.itinerary.find(s=>s.id==="custom-stop")).toEqual(custom);
 });
 it("requires real agreement for character travel",()=>{
  const p=addCompanion({...icelandTripIdea(),startDate:"2027-02-01",endDate:"2027-02-08",status:"proposed"},"tess");
  expect(()=>acceptTrip(p)).toThrow();
  const accepted=acceptTrip(respondCompanion(p,"tess","accepted"));
  expect(accepted.companions[0]?.response).toBe("accepted");
  expect(validateTrip(accepted)).toEqual([]);
  expect(tripScenePrompt({...accepted,status:"in_progress"},1)).toContain("tess");
 });
 it("supports work trips without assuming a romantic companion",()=>{
  const p={...icelandTripIdea(),purpose:"work" as const,companions:[],startDate:"2027-02-01",endDate:"2027-02-04"};
  expect(acceptTrip(p).purpose).toBe("work");
 });
});
