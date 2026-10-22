import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const prepareUserVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        conversationId: z.string().uuid(),
        mime: z.enum(["video/mp4", "video/webm"]),
        bytes: z.number().int().min(1).max(25_000_000),
        duration: z.number().positive().max(60),
        caption: z.string().max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./user-video.server")).prepareVideo(db, context.userId, data);
  });
export const finishUserVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./user-video.server")).finishVideo(db, context.userId, data.id);
  });
export const pendingUserVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("user_video_uploads")
      .select("id,caption,created_at")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(10);
    if (error && ["42P01", "PGRST205"].includes(error.code)) return [];
    if (error) throw new Error("Pending video uploads unavailable");
    return rows ?? [];
  });
