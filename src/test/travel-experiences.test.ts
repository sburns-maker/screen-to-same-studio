import {describe,it,expect} from "vitest";
import {icelandTripIdea,addCompanion,respondCompanion,acceptTrip,tripScenePrompt,validateTrip} from "@/lib/travel-experiences";
describe("Travel experience lifecycle",()=>{
 it("keeps Iceland an unbooked dream and offers multi-day scenes",()=>{
  const p=icelandTripIdea();
  expect(p.status).toBe("idea"); expect(p.startDate).toBeNull();
  expect(new Set(p.itinerary.map(s=>s.day)).size).toBeGreaterThan(1);
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
