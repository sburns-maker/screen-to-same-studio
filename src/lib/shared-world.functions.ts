import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const developerSharedWorld = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.enum(["inspect", "preview", "create", "invite", "cancel", "reschedule"]),
        planId: z.string().uuid(),
        startsAt: z.string().datetime({ offset: true }),
        title: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId))
      throw new Error("Developer shared-world actions disabled");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { sharedWorldAvailable, sharedCommand } = await import("./shared-world.server");
    const { previewSharedPlan, scheduleAllows } = await import("./shared-world");
    if (!(await sharedWorldAvailable(db)))
      throw new Error("Review and install shared-world migration 0011 first");
    const now = new Date(),
      endsAt = new Date(Date.parse(data.startsAt) + 2 * 3_600_000).toISOString();
    const base = {
      user_id: context.userId,
      id: data.planId,
      organizer: "ben",
      place_key: "home:ben",
      title: data.title,
      starts_at: data.startsAt,
      ends_at: endsAt,
      status: "proposed",
      version: 0,
      user_attendance: "not_reported" as const,
      created_at: now.toISOString(),
    };
    if (data.action === "preview")
      return { preview: previewSharedPlan(base, "claire", now, 7), writes: false };
    if (data.action === "create") {
      if (!scheduleAllows("ben", data.startsAt, endsAt))
        throw new Error("Ben's schedule/travel conflicts with this time");
      await sharedCommand(
        db,
        context.userId,
        data.planId,
        "create",
        { organizer: "ben", place: "home:ben", title: data.title, startsAt: data.startsAt, endsAt },
        now,
        0,
      );
    } else if (["invite", "cancel", "reschedule"].includes(data.action)) {
      const { data: plan, error } = await db
        .from("social_plans")
        .select("*")
        .eq("user_id", context.userId)
        .eq("id", data.planId)
        .maybeSingle();
      if (error || !plan) throw new Error("Owned shared plan not found");
      const payload =
        data.action === "invite"
          ? { actor: plan.organizer, character: "claire", channel: "user_relay" }
          : data.action === "reschedule"
            ? { startsAt: data.startsAt, endsAt }
            : {};
      if (
        data.action === "reschedule" &&
        !scheduleAllows(plan.organizer as "ben", data.startsAt, endsAt)
      )
        throw new Error("Organizer schedule conflict");
      await sharedCommand(db, context.userId, data.planId, data.action, payload, now, plan.version);
    }
    const [
      { data: plans, error: planError },
      { data: invitations, error: inviteError },
      { data: exchanges, error: exchangeError },
      { data: presence, error: presenceError },
    ] = await Promise.all([
      db
        .from("social_plans")
        .select("*")
        .eq("user_id", context.userId)
        .order("starts_at", { ascending: false })
        .limit(20),
      db.from("social_rsvps").select("*").eq("user_id", context.userId).limit(100),
      db
        .from("social_exchanges")
        .select("*")
        .eq("user_id", context.userId)
        .order("occurred_at", { ascending: false })
        .limit(20),
      db.from("social_presence").select("*").eq("user_id", context.userId),
    ]);
    if (planError || inviteError || exchangeError || presenceError)
      throw new Error("Shared-world inspection unavailable; no empty success is inferred");
    return {
      plans: plans ?? [],
      invitations: invitations ?? [],
      exchanges: exchanges ?? [],
      presence: presence ?? [],
      writes: data.action !== "inspect",
    };
  });
