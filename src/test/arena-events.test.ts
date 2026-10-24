import {describe,it,expect} from "vitest";import {PPG_ARENA,PPG_ARENA_EVENTS,eventsForVenue} from "@/lib/arena-events";import {travelPlaces} from "@/lib/travel-places";
describe("PPG Paints Arena events",()=>{
 it("registers the real Pittsburgh arena",()=>{expect(PPG_ARENA.address).toContain("1001 Fifth Avenue");expect(travelPlaces("PPG Paints Arena","pittsburgh")).toHaveLength(1)});
 it("correctly lists Monday October 26, 2026",()=>{const monday=eventsForVenue(PPG_ARENA.id,"2026-10-26").find(e=>e.date==="2026-10-26");expect(monday?.title).toContain("Jonas Brothers");expect(monday?.time).toBe("19:30")});
 it("records events as source-backed snapshots, not fictional assertions",()=>{expect(PPG_ARENA_EVENTS.length).toBeGreaterThan(10);expect(PPG_ARENA_EVENTS.every(e=>e.source==="official_calendar_snapshot"&&e.sourceUrl.startsWith("https://"))).toBe(true)});
});
