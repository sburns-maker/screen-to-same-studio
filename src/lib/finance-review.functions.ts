import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const charKeys=["tess","maya","claire","jordan","ben","sienna","kendra","riley","carly","brooke","jade","nina"] as const;
export const reviewSchema=z.object({
  agreements:z.array(z.object({
    assetKey:z.string(),characterKey:z.enum(charKeys),policyText:z.string(),
    status:z.enum(["delivered","acknowledged","revision_requested","needs_revision"]),
    deliveredAt:z.string(),respondedAt:z.string().nullable(),
  })),
  stakes:z.array(z.object({
    assetKey:z.string(),characterKey:z.enum(charKeys),percent:z.literal(50),
    partnerBalanceCents:z.number(),finalizedAt:z.string(),
  })),
  offers:z.array(z.object({
    offerId:z.string().uuid(),assetKey:z.string(),characterKey:z.enum(charKeys),
    percentage:z.literal(50),
    status:z.enum(["pending","withdrawn","character_accepted","declined","finalized"]),
    createdAt:z.string(),
  })),
});
export type FinanceReview=z.infer<typeof reviewSchema>;

export const loadFinanceReview=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .handler(async ({context})=>{
   const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
   const {reconcileFinancialDecisions}=await import("./finance-review.server");
   await reconcileFinancialDecisions(db,context.userId);
   const result=await db.rpc("finance_review_snapshot" as never,{p_user:context.userId} as never);
   if(result.error)throw new Error("Written agreements and equity records require migration 0086.");
   return reviewSchema.parse(result.data);
 });

export const provideFinanceAgreement=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((value:unknown)=>z.object({
   requestId:z.string().uuid(),assetKey:z.string().min(1).max(90),
   characterKey:z.enum(charKeys),
 }).parse(value))
 .handler(async ({context,data})=>{
   const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
   const result=await db.rpc("finance_deliver_agreement" as never,{
     p_user:context.userId,p_request:data.requestId,
     p_asset:data.assetKey,p_character:data.characterKey,
   } as never);
   if(result.error)throw new Error(
     ["Owned operating business required","Save hands-off governance first",
       "Identify actual fictional manager and independent reviewer roles first"].includes(result.error.message)
     ? result.error.message : "Couldn't provide the written agreement.");
   return reviewSchema.parse(result.data);
 });

export const finalizeFinanceEquity=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((value:unknown)=>z.object({requestId:z.string().uuid(),offerId:z.string().uuid()}).parse(value))
 .handler(async ({context,data})=>{
   const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
   const result=await db.rpc("finance_finalize_equity" as never,{
     p_user:context.userId,p_request:data.requestId,p_offer:data.offerId,
   } as never);
   if(result.error)throw new Error(
    ["Explicit character acceptance required","Owned operating business required",
     "Business already has an equity partner","Independent written boundaries must be acknowledged",
     "Independent management must remain active"].includes(result.error.message)
    ? result.error.message:"Could not finalize the in-game equity transfer.");
   return reviewSchema.parse(result.data);
 });
