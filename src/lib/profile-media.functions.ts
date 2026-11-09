import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { referenceCharacterSchema } from "./photo-reference-library";
export const saveProfileImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: referenceCharacterSchema,
        avatar: z.string().max(5_600_000),
        reference: z.string().max(5_600_000).optional(),
        canonicalApproved: z.boolean(),
        sourceMessageId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./profile-media.server")).saveProfileMedia(db, context.userId, data);
  });
