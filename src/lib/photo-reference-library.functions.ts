import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REFERENCE_ROLES } from "./api18-reference-library";
const character = z.enum(["tess", "maya", "claire", "riley", "jordan", "ben"]);
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
      provider: (await import("./api18-image.server")).api18Configuration(),
      jobs: await (
        await import("./api18-jobs.server")
      ).api18JobHistory(db, context.userId, data.character),
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

export const checkApi18Job = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ actionId: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./api18-jobs.server")).refreshApi18Job(db, context.userId, data.actionId);
  });
