import {describe,it,expect} from "vitest";
import {photoContextForSchedule} from "@/lib/calendar-commitment";
import {photoOpportunity} from "@/lib/photo-opportunities";
import {scheduleFor} from "@/lib/tess-life";
describe("spontaneous weekend photos",()=>{
 it("uses real weekend context instead of stale clinic storyline",()=>{
 const schedule=scheduleFor(new Date("2026-10-24T20:15:00Z"));
 expect(schedule.detail).toMatch(/weekend/);
 const visual=photoContextForSchedule(schedule,"Tess and Sam are reviewing uneven clinic shift coverage");
 expect(visual).toBe(schedule.detail);
 expect(visual).not.toMatch(/clinic|Sam/);
 });
 it("preserves an ordinary compatible visual moment",()=>{
 const schedule=scheduleFor(new Date("2026-10-24T20:15:00Z"));
 expect(photoContextForSchedule(schedule,"Mabel is curled up on the sofa")).toBe("Mabel is curled up on the sofa");
 });
});
