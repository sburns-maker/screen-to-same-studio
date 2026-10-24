import {describe,it,expect} from "vitest";
import {SEED_STATE} from "@/lib/tess-logic";
import {mindSummary,recentMindChanges,datedMemories} from "@/lib/character-mind-insights";
describe("character mind diagnostics",()=>{
 it("distinguishes high comfort from romantic intent",()=>{const x=mindSummary({...SEED_STATE,comfort:97,romantic_intent:0},"Platonic friendship");expect(x.notes.join(" ")).toContain("not the same as wanting a relationship");});
 it("shows the most significant recent changes",()=>{expect(recentMindChanges({trust:2,playfulness:-3,tags:["playful"]}).map(x=>x.key)).toEqual(["playfulness","trust"]);});
 it("sorts saved memories by creation timestamp",()=>{const m=(d:string)=>({created_at:d,memory_type:"relationship",summary:"x",importance:2});expect(datedMemories([m("2026-01-01"),m("2026-02-01")])[0]!.created_at).toBe("2026-02-01");});
});
