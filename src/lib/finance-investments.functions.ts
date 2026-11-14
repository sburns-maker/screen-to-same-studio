import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const fundSchema=z.array(z.object({key:z.enum(["broad_market","income","growth"]),label:z.string(),balanceCents:z.number().nonnegative()}));
export type VirtualFund=z.infer<typeof fundSchema>[number];

export const loadFinanceFunds=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
    const result=await db.rpc("finance_funds_snapshot" as never,{p_user:context.userId} as never);
    if(result.error)throw new Error("Investment market unavailable. Apply migration 0082.");
    return fundSchema.parse(result.data);
  });
export const tradeFinanceFund=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>z.object({
    requestId:z.string().uuid(), fund:z.enum(["broad_market","income","growth"]),
    side:z.enum(["buy","sell"]),amountCents:z.number().int().positive().max(100000000000000),
  }).parse(v))
  .handler(async ({context,data})=>{
    const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
    const result=await db.rpc("finance_trade" as never,{
      p_user:context.userId,p_request:data.requestId,p_fund:data.fund,
      p_side:data.side,p_amount:data.amountCents,
    } as never);
    if(result.error){
      const known=["Trade amount must be positive","Invalid trade side","Unknown investment fund","Insufficient cash to invest","Insufficient investment balance"];
      throw new Error(known.includes(result.error.message)?result.error.message:"Virtual trade was not completed.");
    }
    return fundSchema.parse(result.data);
  });
