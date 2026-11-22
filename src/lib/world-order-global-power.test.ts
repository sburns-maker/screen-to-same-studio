import {describe,it,expect} from "vitest";
import {newGlobalPower,restoreGlobalPower,nationalAction,publicStrategyStatement,FOREIGN_LEADERS,canMessageOfficial} from "./world-order-global-power";
const ctx={president:true,influence:70,cash:250000,day:60};
describe("World Order confidential ambition and international power",()=>{
 it("keeps conquest ambition private until player explicitly declares it",()=>{
  const secret=newGlobalPower();
  expect(secret.strategy).toBe("private");
  expect(publicStrategyStatement(secret)).toBeNull();
  expect(restoreGlobalPower(undefined).strategy).toBe("private");
  const declared=nationalAction(secret,{type:"strategy",mode:"disclosed"},ctx)!;
  expect(publicStrategyStatement(declared.state)).toContain("publicly stated");
  expect(nationalAction(declared.state,{type:"strategy",mode:"private"},ctx)).toBeNull();
  expect(secret.strategy).toBe("private");
 });
 it("includes distinct heads of state",()=>{
  expect(Object.keys(FOREIGN_LEADERS).length).toBeGreaterThanOrEqual(6);
  expect(new Set(Object.values(FOREIGN_LEADERS).map(x=>x.name)).size).toBe(Object.keys(FOREIGN_LEADERS).length);
 });
 it("does not give presidents unsolicited direct contact before diplomacy",()=>{
   const secret=newGlobalPower();
   expect(canMessageOfficial(secret,"PresidentReed")).toBe(false);
   expect(canMessageOfficial(secret,"Taylor")).toBe(true);
   const opened=nationalAction(secret,{type:"diplomacy",country:"United States",mode:"contact"},ctx)!;
   expect(canMessageOfficial(opened.state,"PresidentReed")).toBe(true);
 });
 it("offers real diplomacy with evolving trust, but treaties require established relationships",()=>{
  const first=newGlobalPower();
  expect(nationalAction(first,{type:"diplomacy",country:"Canada",mode:"treaty"},ctx)).toBeNull();
  let power=nationalAction(first,{type:"diplomacy",country:"Canada",mode:"contact"},ctx)!.state;
  power=nationalAction(power,{type:"diplomacy",country:"Canada",mode:"summit"},ctx)!.state;
  expect(power.relations.Canada.trust).toBeGreaterThanOrEqual(55);
  const treaty=nationalAction(power,{type:"diplomacy",country:"Canada",mode:"treaty"},ctx)!;
  expect(treaty.state.relations.Canada.status).toBe("partner");
  expect(treaty.cashCost).toBeGreaterThan(0);
 });
 it("requires political standing or influence, resources and defense capacity",()=>{
  const base=newGlobalPower();
  expect(nationalAction(base,{type:"diplomacy",country:"Brazil",mode:"contact"},{...ctx,president:false,influence:10})).toBeNull();
  expect(nationalAction(base,{type:"defense",mode:"training"},{...ctx,cash:0})).toBeNull();
  expect(nationalAction(base,{type:"military",country:"United States",mode:"intervene"},ctx)).toBeNull();
 });
 it("strategic escalation creates consequences without awarding an instant conquest",()=>{
  let power=newGlobalPower();
  power={...power,defense:70,capacity:60};
  const response=nationalAction(power,{type:"military",country:"United States",mode:"intervene"},ctx)!;
  expect(response.state.relations["United States"].status).toBe("crisis");
  expect(response.state.legitimacy).toBeLessThan(power.legitimacy);
  expect(response.state.defense).toBeLessThan(power.defense);
  expect(response.summary).toContain("no territory changes hands automatically");
  const peace=nationalAction(response.state,{type:"military",country:"United States",mode:"deescalate"},ctx)!;
  expect(peace.state.relations["United States"].status).toBe("dialogue");
 });
 it("restores old worlds without inventing public disclosure",()=>{
  expect(restoreGlobalPower({defense:45,relations:{Canada:{trust:92,trade:35,status:"partner",visits:3}}}).relations.Canada.trust).toBe(92);
  expect(restoreGlobalPower({defense:45}).strategy).toBe("private");
 });
});