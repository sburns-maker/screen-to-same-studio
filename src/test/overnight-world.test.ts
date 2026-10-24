import { describe,it,expect } from "vitest";
import { overnightWake } from "@/lib/overnight-wake";
import { altoonaContext,ALTOONA_PLACES } from "@/lib/altoona-places";
import { characterFor,characterAvailability } from "@/lib/characters";
describe("overnight world",()=>{
 it("keeps wake windows stable on repeated checks",()=>{
  const t=new Date("2026-10-24T06:00:00Z");
  expect(overnightWake("tess",t)).toEqual(overnightWake("tess",t));
 });
 it("never invents spontaneous wakefulness during daytime",()=>{
  expect(overnightWake("tess",new Date("2026-10-24T17:00:00Z"))).toBeNull();
 });
 it("offers a true third-shift friend with independent availability",()=>{
  const r=characterFor("riley");
  expect(r.romanticCapable).toBe(false);
  expect(characterAvailability(r,new Date("2026-10-24T03:00:00Z")).availability).not.toBe("asleep");
  expect(characterAvailability(r,new Date("2026-10-24T17:00:00Z")).availability).toBe("asleep");
 });
 it("preserves Altoona PA geography and location variety",()=>{
  expect(ALTOONA_PLACES.length).toBeGreaterThanOrEqual(15);
  expect(altoonaContext("tess",new Date("2026-10-24T08:00:00Z"))[0]).toContain("Pennsylvania");
 });
});
