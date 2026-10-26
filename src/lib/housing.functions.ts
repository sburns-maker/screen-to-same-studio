import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { housingInputSchema } from "./housing";
export const loadHousing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const h = await import("./housing.server");
    const available = await h.seedHousing(db, context.userId);
    return { available, ...(await h.housingSnapshot(db, context.userId)) };
  });
export const changeHousing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), action: housingInputSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const h = await import("./housing.server");
    await h.seedHousing(db, context.userId);
    return h.housingCommand(db, context.userId, data.id, data.action);
  });

export const housingDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId))
      throw new Error("Developer tools are disabled for this account");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server"),
      h = await import("./housing.server");
    if (!(await h.housingReady(db)))
      return { available: false, homes: 0, proposals: [], failures: [] };
    const r = await db.rpc("housing_diagnostics" as never, { p_user: context.userId } as never);
    if (r.error) throw new Error("Housing diagnostics unavailable");
    return r.data as unknown as {
      available: boolean;
      homes: number;
      proposals: {
        id: string;
        status: string;
        version: number;
        plan_id: string | null;
        responses: Record<string, string>;
      }[];
      failures: { source_id: string; failure: string; processed: boolean }[];
    };
  });
