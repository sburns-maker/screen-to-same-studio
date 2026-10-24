import {describe,it,expect} from "vitest";
import {TOWN_NPCS} from "@/lib/blair-town-npcs";
import {npcSchedule,neighborhoodSnapshot} from "@/lib/npc-schedules";
describe("Blair County NPC daily routines",()=>{
 it("is stable when evaluated repeatedly",()=>{
  const t=new Date("2026-10-24T04:00:00Z");
  const npc=TOWN_NPCS[0];
  if (!npc) throw new Error("NPC roster is empty");
  expect(npcSchedule(npc,t)).toEqual(npcSchedule(npc,t));
 });
 it("returns a valid activity and location for every NPC",()=>{
  const at=new Date("2026-10-24T04:00:00Z");
  for(const person of TOWN_NPCS){const result=npcSchedule(person,at);expect(result.npcId).toBe(person.id);expect(result.location).toContain(person.area);expect(result.activity).toMatch(/^(asleep|at_home|commuting|at_work|socializing|errands|outdoors)$/);}
 });
 it("has stable neighborhood snapshots",()=>{
  const at=new Date("2026-10-24T04:00:00Z");
  expect(neighborhoodSnapshot("Downtown Altoona",at)).toEqual(neighborhoodSnapshot("Downtown Altoona",at));
 });
});
