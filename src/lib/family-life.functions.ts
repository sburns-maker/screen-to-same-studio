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
