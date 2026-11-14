import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const path=z.enum(["existing","lease","build"]);
const style=z.enum(["portraits","hybrid","rental"]);
const venture=z.object({
 id:z.string().uuid(),path,name:z.string(),
 stage:z.enum(["research","offer_pending","offer_accepted","buildout","operating","cancelled","exited"]),
 askingCents:z.number(),offerCents:z.number().nullable(),settlementCents:z.number().nullable(),
 revenueCents:z.number(),costCents:z.number(),inspectionFlags:z.number(),
 buildoutFlags:z.number(),marketingLevel:z.number(),
 style,financing:z.enum(["cash","finance"]),
 siennaInvolvement:z.enum(["not_discussed","invited","not_interested"]),
 assetKey:z.string().nullable(),offerDueVirtual:z.string().nullable(),
 offerExpiresVirtual:z.string().nullable(),createdAt:z.string(),openedAt:z.string().nullable(),
});
const snapshot=z.object({
 ventures:z.array(venture),
 events:z.array(z.object({
  ventureId:z.string().uuid(),type:z.string(),costCents:z.number(),
  detail:z.string(),createdAt:z.string(),
 })),
});
export type PhotographyVentureSnapshot=z.infer<typeof snapshot>;

const base=z.object({requestId:z.string().uuid(),ventureId:z.string().uuid().optional()});
const input=z.discriminatedUnion("action",[
 base.extend({action:z.literal("start"),path,name:z.string().trim().min(3).max(80)}),
 base.extend({action:z.literal("inspect"),ventureId:z.string().uuid(),check:z.enum(["books","space","permits"])}),
 base.extend({action:z.literal("offer"),ventureId:z.string().uuid(),
   offerCents:z.number().int().positive(),financing:z.enum(["cash","finance"])}),
 base.extend({action:z.literal("respond"),ventureId:z.string().uuid()}),
 base.extend({action:z.literal("close"),ventureId:z.string().uuid()}),
 base.extend({action:z.literal("upgrade"),ventureId:z.string().uuid(),
   upgrade:z.enum(["lighting","editing","interior","booking"])}),
 base.extend({action:z.literal("launch"),ventureId:z.string().uuid(),style}),
 base.extend({action:z.literal("market"),ventureId:z.string().uuid()}),
 base.extend({action:z.literal("invite_sienna"),ventureId:z.string().uuid()}),
 base.extend({action:z.literal("cancel"),ventureId:z.string().uuid()}),
]);
export type PhotographyVentureAction=z.infer<typeof input>;
export const loadPhotographyVentures=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.handler(async ({context})=>{
 const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
 const r=await db.rpc("finance_venture_snapshot" as never,{p_user:context.userId} as never);
 if(r.error)throw new Error("Photography ventures are unavailable. Lovable must apply migration 0088.");
 return snapshot.parse(r.data);
});
export const updatePhotographyVenture=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((data:unknown)=>input.parse(data))
.handler(async ({context,data})=>{
 const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
 const payload:Record<string,unknown>={};
 if(data.action==="start"){payload.path=data.path;payload.name=data.name;}
 if(data.action==="inspect")payload.check=data.check;
 if(data.action==="offer"){payload.offerCents=data.offerCents;payload.financing=data.financing;}
 if(data.action==="upgrade")payload.upgrade=data.upgrade;
 if(data.action==="launch")payload.style=data.style;
 const r=await db.rpc("finance_venture_action" as never,{
  p_user:context.userId,p_request:data.requestId,
  p_venture:"ventureId" in data?data.ventureId:null,
  p_action:data.action,p_payload:payload,
 } as never);
 if(r.error){
  const allowed=[
   "Active photography venture already exists","Choose a studio acquisition path",
   "Unknown due diligence review","Review already completed",
   "Finish all three due diligence checks before offering",
   "Offer must be between 85 and 100 percent of asking",
   "Choose cash or financing","Leases use cash deposits",
   "Seller has not responded yet","No pending offer","An accepted offer is required",
   "Insufficient fictional cash for closing and fees","Insufficient fictional cash for this stage",
   "Launch requires lighting and a booking system","Choose a business model",
   "Unknown studio upgrade","Upgrade already installed",
   "Marketing plan not available","Cannot cancel after closing",
   "Sienna invitation already recorded or venture cancelled",
  ];
  throw new Error(allowed.includes(r.error.message)?r.error.message:"Studio venture action was not completed.");
 }
 return snapshot.parse(r.data);
});
