import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REFERENCE_ROLES } from "./photo-reference-library";
const character = z.enum(["tess", "maya", "claire", "riley", "jordan", "ben", "sienna"]);
export const loadReferenceLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ character, offset: z.number().int().min(0).max(100000).default(0) })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const service = await import("./photo-reference-library.server");
    return {
      page: await service.referenceLibraryPage(db, context.userId, data.character, data.offset),
      provider: (await import("./spicy-image.server")).spicyConfiguration(data.character),
      jobs: await (
        await import("./spicy-jobs.server")
      ).spicyJobHistory(db, context.userId, data.character),
    };
  });
export const previewReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ character, message: z.string().uuid().nullable() }).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./photo-reference-library.server")).referencePreview(
      db,
      context.userId,
      data.character,
      data.message,
    );
  });
export const changeReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        character,
        action: z.enum(["approve", "reject", "remove", "undo"]),
        role: z.enum(REFERENCE_ROLES).nullable(),
        message: z.string().uuid().nullable(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        version: z.number().int().nonnegative(),
        undo: z.string().uuid().nullable(),
        visualConfirmed: z.boolean(),
        reviewedSha: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./photo-reference-library.server")).reviewReference(
      db,
      context.userId,
      data,
    );
  });

export const setReferenceProviderPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        character,
        enabled: z.boolean(),
        adult: z.boolean(),
        version: z.number().int().nonnegative(),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./photo-reference-library.server")).referenceProviderPreference(
      db,
      context.userId,
      data.character,
      data.enabled,
      data.adult,
      data.version,
    );
  });

export const checkSpicyJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ actionId: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await (await import("./spicy-jobs.server")).processSpicyPhotos(db, {user:context.userId,action:data.actionId});
    return {status:"Status refreshed; pending tasks are never resubmitted"};
  });

export const refreshPendingPhotos = createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((v:unknown)=>z.object({conversationId:z.string().uuid()}).strict().parse(v))
 .handler(async({data,context})=>{
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const owned=await db.from("conversations").select("id").eq("user_id",context.userId).eq("id",data.conversationId).maybeSingle();
  if(owned.error || !owned.data)throw new Error("Owned conversation required");
  await (await import("./spicy-jobs.server")).processSpicyPhotos(db,{user:context.userId,conversation:data.conversationId});
  return {checked:true};
 });
