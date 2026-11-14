import { describe, expect, it } from "vitest";
import { financeCharacterContext } from "../lib/finance-context.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";

type Query = { eq:(key:string,value:string)=>Query; select:(fields:string)=>Query; order:(field:string,options:unknown)=>Query; limit:(count:number)=>Promise<{data:unknown[];error:null}>; maybeSingle:()=>Promise<{data:unknown;error:null}>; in:(key:string,values:string[])=>Promise<{data:unknown[];error:null}> };
function fakeDb() {
  const calls: { table:string; filters:Record<string,string> }[]=[];
  const admin={
    from:(table:string)=>{
      const filters:Record<string,string>={};
      calls.push({table,filters});
      const q:Query={
        select:()=>q,
        eq:(key,value)=>{filters[key]=value;return q;},
        order:()=>q,
        limit:async()=>{
          if(table!=="finance_disclosures"||filters['character_key']!=="kendra")return {data:[],error:null};
          return {data:[{subject_key:"work:northlight",disclosed_at:"2026-11-14T12:00:00.000Z"}],error:null};
        },
        maybeSingle:async()=>({data:{company_name:"Northline Group",job_title:"Director of Special Projects"},error:null}),
        in:async()=>({data:[{asset_key:"work:northlight",label:"Northlight Studio",owned:true}],error:null}),
      };
      return q;
    },
  } as unknown as SupabaseClient<Database>;
  return {admin,calls};
}
describe("explicit private financial knowledge",()=>{
  it("shares only the selected character's disclosed acquisition",async()=>{
    const {admin,calls}=fakeDb();
    const known=await financeCharacterContext(admin,"player-one","kendra");
    expect(known).toContain("Northlight Studio");
    expect(known).toContain("fictional game world");
    expect(known).not.toContain("$5");
    expect(calls.every(c=>c.filters['user_id']==="player-one")).toBe(true);
    expect(calls[0]?.filters['character_key']).toBe("kendra");
  });
  it("reveals nothing to another character",async()=>{
    const {admin,calls}=fakeDb();
    expect(await financeCharacterContext(admin,"player-one","riley")).toBe("");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.filters['character_key']).toBe("riley");
  });
});
