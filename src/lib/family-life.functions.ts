import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Read-only, privacy-redacted family-life snapshot for one current user's contact. */
export const loadFamilyLife = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    characterKey: z.enum(["tess", "maya", "claire", "jordan", "ben", "riley", "sienna", "kendra"]),
  }).parse(value))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { familySnapshot } = await import("./family-life.server");
    return familySnapshot(supabaseAdmin, context.userId, data.characterKey);
  });

/** Player can make or answer household proposals; never sets character consent. */
export const changeHousehold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    characterKey: z.enum(["tess", "maya", "riley", "sienna", "kendra"]),
    action: z.enum(["propose", "accept", "decline"]),
    requestId: z.string().uuid(),
    kind: z.enum(["move_in", "move_out", "share_home", "separate_home"]),
    eventId: z.string().uuid().nullable(),
  }).parse(value))
  .handler(async ({ context, data }) => {
    const { CHARACTERS } = await import("./characters");
    if (CHARACTERS[data.characterKey].age < 18) throw new Error("Adult contacts only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { proposeHousehold, respondToHousehold } = await import("./family-household.server");
    if (data.action === "propose") {
      if (data.eventId) throw new Error("Proposal cannot reference an existing event");
      return { id: await proposeHousehold(supabaseAdmin, context.userId, data.characterKey, data.requestId, data.kind) };
    }
    if (!data.eventId) throw new Error("Select an existing proposal");
    return { id: await respondToHousehold(supabaseAdmin, context.userId, data.characterKey, data.eventId, data.action === "accept") };
  });

/** Player can request wedding planning only after an accepted engagement.
 * Character consent and the ceremony are separate verified world actions. */
export const planWedding = createServerFn({ method:"POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((value:unknown)=>z.object({
  characterKey:z.enum(["tess","maya","riley","sienna","kendra","claire","jordan"]),
  requestId:z.string().uuid(),
  startsAt:z.string().datetime({offset:true}),
  venue:z.string().min(1).max(200),
 }).parse(value))
 .handler(async({context,data})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {proposeWeddingPlan}=await import("./family-wedding.server");
  return proposeWeddingPlan(supabaseAdmin,{
   userId:context.userId,characterKey:data.characterKey,
   requestId:data.requestId,startsAt:data.startsAt,venue:data.venue,
  });
 });

/** Read previously saved proposed wedding plans. No new approvals are inferred. */
export const loadWeddingPlans = createServerFn({ method:"POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((value:unknown)=>z.object({
   characterKey:z.enum(["tess","maya","riley","sienna","kendra","claire","jordan"]),
 }).parse(value))
 .handler(async({context,data})=>{
   const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
   const {listWeddingPlans,reconcileVisibleWeddingDecisions}=await import("./family-wedding.server");
   try{await reconcileVisibleWeddingDecisions(supabaseAdmin,context.userId,data.characterKey);}
   catch(error){console.warn("[family-wedding] readback reconciliation deferred",error);}
   try{const {reconcileCompletedWeddingCeremonies}=await import("./family-wedding.server");
     await reconcileCompletedWeddingCeremonies(supabaseAdmin,context.userId,data.characterKey);}
   catch(error){console.warn("[family-wedding] ceremony verification deferred",error);}
   return listWeddingPlans(supabaseAdmin,context.userId,data.characterKey);
 });
