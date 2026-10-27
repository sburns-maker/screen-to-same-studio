import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const loadRelationshipCommitments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ characterKey: z.string().min(1).max(80) }).parse(value))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { commitmentSnapshot } = await import("./relationship-commitments.server");
    return commitmentSnapshot(supabaseAdmin, context.userId, data.characterKey);
  });
