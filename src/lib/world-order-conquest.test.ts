import {describe,it,expect} from "vitest";
import {newConquestWorld,restoreConquestWorld,beginConquestCampaign,campaignMove,activeCampaign} from "./world-order-conquest";
const ready={president:true,influence:90,cash:1_000_000,trust:80,militaryCapacity:80};
const moveCtx={cash:1_000_000,defense:80,trust:80,legitimacy:80};
describe("World Order multi-stage world expansion",()=>{
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