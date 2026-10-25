import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PHOTO_LAB_TYPES } from "./developer-photo-lab";
const conversationId = z.string().uuid();
export const developerPhotoLab = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("list"), conversationId }),
        z.object({
          action: z.literal("generate"),
          conversationId,
          requestId: z.string().uuid(),
          category: z.enum(PHOTO_LAB_TYPES),
          confirmation: z.literal("GENERATE DEVELOPER PHOTO TEST"),
        }),
        z.object({ action: z.literal("release"), conversationId, id: z.string().uuid() }),
      ])
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const lab = await import("./developer-photo-lab.server");
    if (data.action === "generate")
      return {
        snapshot: null,
        result: await lab.generatePhotoLabTest(
          db,
          context.userId,
          data.conversationId,
          data.requestId,
          data.category,
        ),
      };
    return {
      result: null,
      snapshot:
        data.action === "release"
          ? await lab.releasePhotoLabTest(db, context.userId, data.conversationId, data.id)
          : await lab.photoLabHistory(db, context.userId, data.conversationId),
    };
  });
