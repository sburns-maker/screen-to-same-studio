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
          customScene: z.string().max(400).optional(),
          confirmation: z.literal("GENERATE DEVELOPER PHOTO TEST"),
        }),
        z.object({ action: z.literal("release"), conversationId, id: z.string().uuid() }),
        z.object({ action: z.literal("deliver"), conversationId, id: z.string().uuid(), confirmation: z.literal("DELIVER DEVELOPER TEST PHOTO TO CHAT") }),
      ])
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const lab = await import("./developer-photo-lab.server");
    if (data.action === "deliver") return {snapshot:null,result:await lab.deliverPhotoLabTest(db,context.userId,data.conversationId,data.id)};
    if (data.action === "generate")
      return {
        snapshot: null,
        result: await lab.generatePhotoLabTest(
          db,
          context.userId,
          data.conversationId,
          data.requestId,
          data.category,
          data.customScene,
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


/** Server-side, no-charge SpicyAPI connectivity test for authorized developer photo testers. */
export const checkDeveloperSpicyConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ conversationId }).parse(v))
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId))
      throw new Error("Developer photo tests are disabled");
    const owned = await context.supabase.from("conversations").select("id")
      .eq("id", data.conversationId).eq("user_id", context.userId).maybeSingle();
    if (owned.error || !owned.data)
      throw new Error("Owned conversation required");
    const { spicyConnectionProbe } = await import("./spicy-image.server");
    return spicyConnectionProbe();
  });
