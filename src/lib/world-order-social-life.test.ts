import { describe,expect,it } from "vitest";
import { SOCIAL_CAST, createSocialLife, incomingSocialWave, arrangeMeetup, completeMeetup, restoreSocialLife, unreadFrom } from "./world-order-social-life";
import { createOpenWorld, applyOpenWorldAction, ventureIncome, ventureValue } from "./world-order-open-world";

describe("World Order celebrity social life",()=>{
 it("supplies more than ten celebrity and supporting contacts",()=> {
  expect(Object.keys(SOCIAL_CAST).length).toBeGreaterThanOrEqual(18);
  expect(Object.values(SOCIAL_CAST).filter(c=>c.celeb).length).toBeGreaterThanOrEqual(8);
 });
 it("generates three incoming DMs for a multi-million-follower world without paid AI",()=> {
  const first=incomingSocialWave(7,4_000_000,"cuba",[]);
  expect(first).toHaveLength(3);
  expect(new Set(first.map(m=>m.contact)).size).toBe(3);
  expect(first[0]?.contact).toBe("Sabrina");
  expect(incomingSocialWave(7,4_000_000,"cuba",first.map(m=>m.id))).toHaveLength(0);
  expect(incomingSocialWave(1,4_000_000,"rescue",[])).toHaveLength(0);
 });
 it("counts and clears unread messages based on contact-specific read state",()=> {
  const chat=[{id:1,from:"Sabrina"},{id:2,from:"Taylor"},{id:3,from:"Sabrina"}];
  expect(unreadFrom(chat,{},"Sabrina")).toBe(2);
  expect(unreadFrom(chat,{Sabrina:3},"Sabrina")).toBe(0);
  expect(unreadFrom(chat,{Sabrina:3},"Taylor")).toBe(1);
 });
 it("gives Sabrina a specific invitation and honors a completed rendezvous",()=> {
  const life=createSocialLife();
  const result=arrangeMeetup(life,"Sabrina",8,"Havana");
  expect(result.visit).toMatchObject({city:"New York",day:9,kind:"dinner",status:"planned"});
  expect(completeMeetup(result.life,"Sabrina",9,"Havana")).toBeNull();
  expect(completeMeetup(result.life,"Sabrina",8,"New York")).toBeNull();
  const done=completeMeetup(result.life,"Sabrina",9,"New York");
  expect(done?.life.visits[0]?.status).toBe("completed");
  expect(done?.life.rapport.Sabrina).toBeGreaterThan(35);
  expect(restoreSocialLife(done?.life).visits[0]?.status).toBe("completed");
 });
});
describe("World Order property, cash and travel",()=>{
 it("requires local presence and funds to purchase",()=> {
  const world=createOpenWorld();
  expect(applyOpenWorldAction(world,{type:"buy",venture:"nightclub"},2)).toBeNull();
  const owned=applyOpenWorldAction(world,{type:"buy",venture:"housing"},2);
  expect(owned?.state.ventures).toHaveLength(1);
  expect(world.ventures).toHaveLength(0);
  expect(ventureIncome(owned!.state)).toBeGreaterThan(0);
 });
 it("travels, meets people and upgrades an asset persistently",()=>{
  let world=createOpenWorld();
  world=applyOpenWorldAction(world,{type:"buy",venture:"housing"},2)!.state;
  world=applyOpenWorldAction(world,{type:"upgrade",venture:"housing"},3)!.state;
  expect(world.ventures[0]?.level).toBe(2);
  expect(ventureValue(world)).toBeGreaterThan(90000);
  world=applyOpenWorldAction(world,{type:"travel",city:"Miami"},4)!.state;
  expect(world.city).toBe("Miami");
  expect(applyOpenWorldAction(world,{type:"network",contact:"Mercer"},5)?.state.allies).toContain("Mercer");
 });
});