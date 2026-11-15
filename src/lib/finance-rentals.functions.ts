import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rental = z.object({
 assetKey:z.string(),label:z.string(),configured:z.boolean(),
 unitCount:z.number().int().nullable(),occupiedUnits:z.number().int().nullable(),
 monthlyRentCents:z.number().nullable(),monthlyOperatingCostCents:z.number(),
 renovationLevel:z.number().int(),monthlyRevenueCents:z.number(),
 monthlyCostCents:z.number(),loanCents:z.number(),reservesCents:z.number(),
});
const snapshot = z.array(rental);
export type RentalProperty = z.infer<typeof rental>;

export const loadRentalProperties = createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .handler(async ({context}) => {
   const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
   const result=await db.rpc("finance_rental_snapshot" as never,{p_user:context.userId} as never);
   if(result.error)throw new Error("Rental property controls unavailable. Apply migration 0090.");
   return snapshot.parse(result.data);
 });

const command=z.discriminatedUnion("command",[
 z.object({command:z.literal("configure"),assetKey:z.string().min(1).max(90),
   unitCount:z.number().int().min(1).max(10000),
   occupiedUnits:z.number().int().min(0).max(10000),
   monthlyRentCents:z.number().int().min(0).max(1000000000),
   monthlyOperatingCostCents:z.number().int().min(0).max(100000000000)}),
 z.object({command:z.literal("renovate"),assetKey:z.string().min(1).max(90)}),
]);
export const updateRentalProperty = createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>z.object({requestId:z.string().uuid(),action:command}).parse(input))
 .handler(async ({context,data})=>{
   const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
   const {command,assetKey,...payload}=data.action;
   const result=await db.rpc("finance_rental_manage" as never,{
      p_user:context.userId,p_request:data.requestId,
      p_asset:assetKey,p_command:command,p_payload:payload
   } as never);
   if(result.error){
     const known=["Owned residential property required","Invalid rental configuration",
        "Complete all property fields","Configure property first","Maximum renovation level reached",
        "Insufficient funds for renovation","Unable to cover business operating deficit"];
     throw new Error(known.includes(result.error.message)?result.error.message:"Unable to update rental property.");
   }
   return snapshot.parse(result.data);
 });
