import { describe, expect, it } from "vitest";
import { adjudicate, initialRules, type ShotEvents } from "@/lib/eight-ball-rules";
const event=(override:Partial<ShotEvents>={}):ShotEvents=>({firstContact:1,pocketed:[],cueScratch:false,railAfterContact:true,breakRails:4,railBalls:[1,2,3,4],pocketEvents:[],...override});
describe("8 Ball rules",()=>{
 it("ends the break and leaves an open table",()=>{const r=adjudicate(initialRules(),event({pocketed:[2]}),[1,2,3,8]);expect(r.breakShot).toBe(false);expect(r.groups[1]).toBeNull();});
 it("assigns solids/stripes on a legal pocket after the break",()=>{const a=adjudicate(initialRules(),event({pocketed:[]}),[1,2,8]);const b=adjudicate({...a,},event({pocketed:[1],pocketEvents:[{ball:1,pocket:0}]}),[1,2,8]);expect(b.groups[2]).toBe("solids");expect(b.groups[1]).toBe("stripes");});
 it("gives ball in hand after a scratch",()=>{const r=adjudicate({...initialRules(),breakShot:false},event({cueScratch:true}),[1,8]);expect(r.ballInHand).toBe(true);expect(r.turn).toBe(2);});
 it("rejects an early eight ball and awards win to opponent",()=>{const r=adjudicate({...initialRules(),breakShot:false,groups:{1:"solids",2:"stripes"}},event({firstContact:8,pocketed:[8]}),[1,8]);expect(r.winner).toBe(2);});
 it("allows a legal eight ball after clearing the group",()=>{const r=adjudicate({...initialRules(),breakShot:false,groups:{1:"solids",2:"stripes"},},event({firstContact:8,pocketed:[8],pocketEvents:[{ball:8,pocket:0}]}),[8,9]);expect(r.winner).toBe(1);});
 it("penalizes wrong first contact",()=>{const r=adjudicate({...initialRules(),breakShot:false,groups:{1:"solids",2:"stripes"}},event({firstContact:10}),[1,8,10]);expect(r.ballInHand).toBe(true);});
 it("allows continuation without called pockets",()=>{
 const start={...initialRules(),breakShot:false,groups:{1:"solids" as const,2:"stripes" as const},};
 const result=adjudicate(start,event({pocketed:[1],pocketEvents:[{ball:1,pocket:2}]}),[1,8]);
 expect(result.turn).toBe(1);expect(result.ballInHand).toBe(false);
 });
 it("passes turn on a declared safety even when a ball is made",()=>{
 const start={...initialRules(),breakShot:false,groups:{1:"solids" as const,2:"stripes" as const},safety:true};
 const result=adjudicate(start,event({pocketed:[1],pocketEvents:[{ball:1,pocket:0}]}),[1,8]);
 expect(result.turn).toBe(2);
 });
 it("does not allow eight ball as first contact while table is open",()=>{
 const result=adjudicate({...initialRules(),breakShot:false},event({firstContact:8}),[8,2]);
 expect(result.ballInHand).toBe(true);
 });
 it("allows eight ball in any pocket after clearing group",()=>{
 const result=adjudicate({...initialRules(),breakShot:false,groups:{1:"solids",2:"stripes"},},event({firstContact:8,pocketed:[8],pocketEvents:[{ball:8,pocket:1}]}),[8,9]);
 expect(result.winner).toBe(1);
 });
});
