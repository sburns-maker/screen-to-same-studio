import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const governanceSchema = z.array(z.object({
  assetKey:z.string(),handsOff:z.boolean(),
  operatingManager:z.string(),reportsTo:z.string(),independentHr:z.string(),
  conflictRecusal:z.boolean(),updatedAt:z.string(),
}));
export type GovernancePolicy = z.infer<typeof governanceSchema>[number];

export const loadGovernance = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
    const res=await db.rpc("finance_governance_snapshot" as never,{p_user:context.userId} as never);
    if(res.error)throw new Error("Governance settings unavailable. Apply migration 0084.");
    return governanceSchema.parse(res.data);
  });

export const saveGovernance = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    requestId:z.string().uuid(),assetKey:z.string().min(1).max(90),
    handsOff:z.boolean(),operatingManager:z.string().trim().min(3).max(120),
    reportsTo:z.string().trim().min(3).max(120),
    independentHr:z.string().trim().min(3).max(120),
  }).parse(input))
  .handler(async ({context,data})=>{
    const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
    const result=await db.rpc("finance_governance_save" as never,{
      p_user:context.userId,p_request:data.requestId,p_asset:data.assetKey,
      p_hands_off:data.handsOff,p_manager:data.operatingManager,
      p_reports_to:data.reportsTo,p_independent_hr:data.independentHr,
    } as never);
    if(result.error)throw new Error(
      ["Invalid governance policy","Owned operating business required"].includes(result.error.message)
      ?result.error.message:"Unable to save governance policy."
    );
    return governanceSchema.parse(result.data);
  });
