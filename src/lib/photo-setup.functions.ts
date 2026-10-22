import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkPhotoSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ checkModel: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { photoSetupStatus } = await import("./photo-setup.server");
    return photoSetupStatus(context.userId, data.checkModel);
  });
