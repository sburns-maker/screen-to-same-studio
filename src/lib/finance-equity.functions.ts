import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const character=z.enum(["tess","maya","claire","jordan","ben","sienna","kendra","riley","carly","brooke","jade","nina"]);
const offers=z.array(z.object({
  offerId:z.string().uuid(),assetKey:z.string(),characterKey:character,
  percentage:z.literal(50),status:z.enum(["pending","withdrawn"]),createdAt:z.string(),
}));
export type EquityOffer=z.infer<typeof offers>[number];

export const loadEquityOffers=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .handler(async ({context})=>{
   const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
   const result=await db.rpc("finance_equity_offers_snapshot" as never,{p_user:context.userId} as never);
   if(result.error)throw new Error("Co-ownership offers unavailable. Apply migration 0085.");
   return offers.parse(result.data);
 });

export const updateEquityOffer=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>z.discriminatedUnion("action",[
    z.object({action:z.literal("offer_half"),requestId:z.string().uuid(),assetKey:z.string().max(90).min(1),characterKey:character}),
    z.object({action:z.literal("withdraw"),requestId:z.string().uuid(),offerId:z.string().uuid()}),
 ]).parse(input))
 .handler(async ({context,data})=>{
   const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
   const result=await db.rpc("finance_equity_offer_command" as never,{
     p_user:context.userId,p_request:data.requestId,p_action:data.action,
     p_asset:data.action==="offer_half"?data.assetKey:"",
     p_character:data.action==="offer_half"?data.characterKey:"",
     p_offer:data.action==="withdraw"?data.offerId:null,
   } as never);
   if(result.error){
     const known=["Owned operating business required","Save hands-off governance before proposing co-ownership",
       "An unanswered offer already exists","No outstanding offer to withdraw","Unknown character"];
     throw new Error(known.includes(result.error.message)?result.error.message:"Co-ownership proposal could not be saved.");
   }
   return offers.parse(result.data);
 });
