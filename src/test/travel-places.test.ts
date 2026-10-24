import {describe,it,expect} from "vitest";
import {TRAVEL_PLACES,TRAVEL_REGIONS,travelPlaces,realWorldMapSearchUrl} from "@/lib/travel-places";
describe("curated world destinations",()=>{
 it("covers central PA, Iceland, major US cities and Canada",()=>{
  expect(TRAVEL_REGIONS.map(r=>r.id)).toEqual(expect.arrayContaining(["central-pa","iceland","pittsburgh","new-york","toronto","montreal"]));
  expect(TRAVEL_PLACES.length).toBeGreaterThan(50);
  expect(new Set(TRAVEL_PLACES.map(p=>p.id)).size).toBe(TRAVEL_PLACES.length);
 });
 it("supports filtered travel discovery",()=>{
  expect(travelPlaces("waterfall","iceland").some(p=>p.name==="Skógafoss")).toBe(true);
  expect(travelPlaces("lake","central-pa").length).toBeGreaterThan(0);
 });
 it("opens an external Google Maps search without scraping or embedded Google data",()=>{
  const url=realWorldMapSearchUrl(TRAVEL_PLACES[0]!);
  expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
 });
});
