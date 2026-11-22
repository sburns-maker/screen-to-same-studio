import {COUNTRY_NAMES,COUNTRY_REGIONS,COUNTRY_RECORDS} from "./world-order-countries";
import {describe,it,expect} from "vitest";
import {newConquestWorld,restoreConquestWorld,beginConquestCampaign,campaignMove,consolidateControl,governOccupation,activeCampaign} from "./world-order-conquest";
const ready={president:true,influence:90,cash:1_000_000,trust:80,militaryCapacity:80};
const moveCtx={cash:1_000_000,defense:80,trust:80,legitimacy:80};
describe("World Order multi-stage world expansion",()=>{
 it("supports at least 75 unique playable nations across major regions",()=>{
  expect(COUNTRY_NAMES.length).toBeGreaterThanOrEqual(75);
  expect(new Set(COUNTRY_NAMES).size).toBe(COUNTRY_NAMES.length);
  expect(COUNTRY_REGIONS.length).toBeGreaterThanOrEqual(6);
  const initial=newConquestWorld();
  for(const name of COUNTRY_NAMES) {
    expect(initial.territory[name]).toBe("independent");
    expect(COUNTRY_RECORDS[name].resistance).toBeGreaterThan(0);
  }
  expect(Object.keys(initial.territory)).toHaveLength(COUNTRY_NAMES.length);
 });
 it("accepts a country beyond the initial featured six and retains its save",()=>{
  const created=beginConquestCampaign(newConquestWorld(),"New Zealand","economic",51,ready)!;
  expect(created.state.campaigns[0]?.country).toBe("New Zealand");
  const restored=restoreConquestWorld(created.state);
  expect(activeCampaign(restored,"New Zealand")?.method).toBe("economic");
  expect(restored.territory["New Zealand"]).toBe("independent");
 });
 it("can turn an earned partner into a directly controlled nation only later",()=>{
  let world=beginConquestCampaign(newConquestWorld(),"Ghana","diplomacy",10,ready)!.state;
  const id=activeCampaign(world,"Ghana")!.id;
  for(let day=11;day<23&&activeCampaign(world,"Ghana");day++){
    world=campaignMove(world,id,"negotiate",day,moveCtx)!.state;
  }
  expect(world.territory["Ghana"]).toBe("partner");
  const won=world.campaigns.find(c=>c.id===id)!;
  expect(consolidateControl(world,"Ghana",won.lastDecisionDay+1,{president:true,cash:999999,legitimacy:70})).toBeNull();
  expect(consolidateControl(world,"Ghana",won.lastDecisionDay+2,{president:false,cash:999999,legitimacy:70})).toBeNull();
  const result=consolidateControl(world,"Ghana",won.lastDecisionDay+2,{president:true,cash:999999,legitimacy:70})!;
  expect(result.state.territory["Ghana"]).toBe("controlled");
  expect(restoreConquestWorld(result.state).territory["Ghana"]).toBe("controlled");
  expect(consolidateControl(result.state,"Ghana",won.lastDecisionDay+3,{president:true,cash:999999,legitimacy:70})).toBeNull();
 });
 it("starts all countries independent, and keeps older saves compatible",()=>{
  expect(newConquestWorld().territory["Canada"]).toBe("independent");
  expect(restoreConquestWorld(undefined)).toEqual(newConquestWorld());
  expect(restoreConquestWorld({worldTension:200}).worldTension).toBe(100);
 });
 it("keeps state ambitions secret outside the global power disclosure workflow",()=>{
  const c=beginConquestCampaign(newConquestWorld(),"Canada","diplomacy",61,ready)!;
  expect(c.state.campaigns[0]?.stage).toBe(0);
  expect(c.state.territory["Canada"]).toBe("independent");
  expect(c.summary).not.toMatch(/world domination|take over the world/i);
 });
 it("gates campaigns behind presidency, resources and relevant diplomatic capabilities",()=>{
  expect(beginConquestCampaign(newConquestWorld(),"France","diplomacy",3,{...ready,president:false})).toBeNull();
  expect(beginConquestCampaign(newConquestWorld(),"France","diplomacy",3,{...ready,trust:12})).toBeNull();
  expect(beginConquestCampaign(newConquestWorld(),"Brazil","economic",3,{...ready,influence:12})).toBeNull();
  expect(beginConquestCampaign(newConquestWorld(),"Mexico","military",3,{...ready,militaryCapacity:10})).toBeNull();
 });
 it("requires multiple actual decisions and gives alliances instead of instantaneous annexation",()=>{
  let world=beginConquestCampaign(newConquestWorld(),"Brazil","diplomacy",10,ready)!.state;
  const id=activeCampaign(world,"Brazil")!.id;
  for(let day=11;day<24&&activeCampaign(world,"Brazil");day++) {
   const decision=campaignMove(world,id,"negotiate",day,moveCtx);
   expect(decision).not.toBeNull();
   world=decision!.state;
  }
  expect(world.territory["Brazil"]).toBe("partner");
  expect(world.campaigns.find(c=>c.id===id)?.stage).toBeGreaterThanOrEqual(4);
 });
 it("rejects double decisions within one day and rejects duplicate active campaigns",()=>{
  let world=beginConquestCampaign(newConquestWorld(),"Mexico","economic",3,ready)!.state;
  expect(beginConquestCampaign(world,"Mexico","diplomacy",4,ready)).toBeNull();
  const id=activeCampaign(world,"Mexico")!.id;
  world=campaignMove(world,id,"invest",4,moveCtx)!.state;
  expect(campaignMove(world,id,"invest",4,moveCtx)).toBeNull();
 });
 it("a military conflict generates international repercussions without awarding conquest",()=>{
  let world=beginConquestCampaign(newConquestWorld(),"United States","military",30,ready)!.state;
  expect(world.worldTension).toBeGreaterThan(8);
  const id=activeCampaign(world,"United States")!.id;
  const move=campaignMove(world,id,"pressure",31,moveCtx)!;
  expect(move.state.worldTension).toBeGreaterThan(world.worldTension);
  expect(move.state.territory["United States"]).toBe("independent");
  expect(move.supportDelta).toBeLessThan(0);
 });
 it("can earn contested protectorate status only after a long conflict and negotiated settlement",()=>{
  let world=beginConquestCampaign(newConquestWorld(),"Brazil","military",5,ready)!.state;
  const id=activeCampaign(world,"Brazil")!.id;
  for(let day=6; day<=15 && activeCampaign(world,"Brazil");day++){
   const action=day===15?"compromise":"negotiate";
   const result=campaignMove(world,id,action,day,moveCtx)!;
   world=result.state;
  }
  expect(world.territory["Brazil"]).toBe("protectorate");
  expect(world.campaigns[0]?.stage).toBeGreaterThanOrEqual(8);
 });
 it("does not force a loss at 100% momentum when resistance prevents ratification",()=>{
  let world=beginConquestCampaign(newConquestWorld(),"Belize","economic",10,ready)!.state;
  const id=activeCampaign(world,"Belize")!.id;
  for(let day=11;day<=22 && activeCampaign(world,"Belize");day++){
   // Strong investment progress paired with political resistance deliberately prevents a deal.
   const current=world.campaigns.find(c=>c.id===id)!;
   world={...world,campaigns:world.campaigns.map(c=>c.id===id?{...c,resistance:85,progress:100}:c)};
   const result=campaignMove(world,id,"persuade",day,moveCtx)!;
   world=result.state;
   expect(result.state.campaigns.find(c=>c.id===id)!.progress).toBe(100);
  }
  expect(world.campaigns.find(c=>c.id===id)!.stage).toBeGreaterThanOrEqual(12);
  expect(world.campaigns.find(c=>c.id===id)!.status).toBe("active");
  // The player can still negotiate after the old 12-turn cutoff.
  expect(campaignMove(world,id,"compromise",23,moveCtx)).not.toBeNull();
 });
 it("surprise offensive can end in occupation and later direct rule after rebuilding",()=>{
  let world=beginConquestCampaign(newConquestWorld(),"Guatemala","military",10,ready)!.state;
  const id=activeCampaign(world,"Guatemala")!.id;
  world=campaignMove(world,id,"surprise",11,moveCtx)!.state;
  expect(campaignMove(world,id,"surprise",12,moveCtx)).toBeNull();
  for(let d=12;d<=18&&activeCampaign(world,"Guatemala");d++){
    world=campaignMove(world,id,"negotiate",d,moveCtx)!.state;
  }
  expect(world.territory["Guatemala"]).toBe("occupied");
  expect(restoreConquestWorld(world).territory["Guatemala"]).toBe("occupied");
  let won=world.campaigns.find(c=>c.id===id)!;
  expect(consolidateControl(world,"Guatemala",won.lastDecisionDay+2,{president:true,cash:999999,legitimacy:80})).toBeNull();
  let day=won.lastDecisionDay+1;
  while(world.campaigns.find(c=>c.id===id)!.resistance>40){
    world=governOccupation(world,"Guatemala",day++,"autonomy",{cash:100000})!.state;
  }
  won=world.campaigns.find(c=>c.id===id)!;
  expect(consolidateControl(world,"Guatemala",won.lastDecisionDay+2,{president:true,cash:999999,legitimacy:80})!.state.territory["Guatemala"]).toBe("controlled");
 });
 it("financing an uprising produces a contested protectorate, not instantaneous annexation",()=>{
  let world=beginConquestCampaign(newConquestWorld(),"Guatemala","uprising",20,ready)!.state;
  const id=activeCampaign(world,"Guatemala")!.id;
  world=campaignMove(world,id,"fund",21,moveCtx)!.state;
  world=campaignMove(world,id,"fund",22,moveCtx)!.state;
  for(let d=23;d<34&&activeCampaign(world,"Guatemala");d++){
    world=campaignMove(world,id,"persuade",d,moveCtx)!.state;
  }
  expect(world.territory["Guatemala"]).toBe("protectorate");
  expect(world.campaigns.find(c=>c.id===id)?.uprisingSupport).toBe(2);
 });
 it("can withdraw and preserve completed campaign history",()=>{
  let world=beginConquestCampaign(newConquestWorld(),"France","economic",60,ready)!.state;
  const id=activeCampaign(world,"France")!.id;
  const result=campaignMove(world,id,"withdraw",61,moveCtx)!;
  expect(result.ended).toBe(true);
  expect(result.state.campaigns.find(c=>c.id===id)?.status).toBe("withdrawn");
  expect(result.state.territory["France"]).toBe("independent");
  expect(restoreConquestWorld(result.state).campaigns[0]?.log.length).toBe(1);
 });
});