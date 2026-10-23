import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid = z.string().uuid();
export const experienceSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./living-experiences.server")).livingSnapshot(db, context.userId);
  });
export const experienceMoments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ planId: uuid }).parse(v))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./living-experiences.server")).livingHistory(
      db,
      context.userId,
      data.planId,
    );
  });
export const experienceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        planId: uuid,
        id: uuid,
        action: z.enum(["claim", "pause", "resume", "turn", "finish", "automatic", "window"]),
        revision: z.number().int().min(0).nullable(),
        text: z.string().trim().max(1500).default(""),
        hours: z.number().int().min(1).max(24).default(4),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const s = await import("./living-experiences.server");
    if (!(await s.experienceSeed(db, context.userId)))
      throw new Error("Living Experiences are not enabled");
    if (data.action === "turn" || data.action === "finish" || data.action === "automatic")
      return {
        experience: (
          await s.generateExperience(
            db,
            context.userId,
            data.planId,
            data.id,
            data.action,
            data.text,
            data.revision,
            data.action === "automatic",
          )
        ).experience,
      };
    return {
      experience: (
        await s.experienceCommand(
          db,
          context.userId,
          data.planId,
          data.id,
          data.action,
          data.revision,
          { hours: data.hours },
        )
      ).experience,
    };
  });
export const experienceDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ conversationId: uuid }).parse(v))
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer access required");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const scenes = await db
      .from("living_experiences")
      .select("*")
      .eq("user_id", context.userId)
      .eq("conversation_id", data.conversationId)
      .order("start_at", { ascending: false })
      .limit(10);
    if (scenes.error) throw new Error("Experience diagnostics unavailable");
    return Promise.all(
      (scenes.data ?? []).map(async (e) => {
        const [plan, moments] = await Promise.all([
          db
            .from("social_plans")
            .select("organizer,place_key,title")
            .eq("user_id", context.userId)
            .eq("id", e.plan_id)
            .maybeSingle(),
          db
            .from("living_experience_moments")
            .select("id", { count: "exact", head: true })
            .eq("user_id", context.userId)
            .eq("experience_id", e.id),
        ]);
        if (plan.error || moments.error) throw new Error("Experience diagnostics unavailable");
        return {
          ...e,
          character: plan.data?.organizer ?? "",
          venue: plan.data?.place_key ?? "",
          title: plan.data?.title ?? "",
          moment_count: moments.count ?? 0,
        };
      }),
    );
  });
