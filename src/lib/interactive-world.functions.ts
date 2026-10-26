import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const loadInteractiveWorld = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./interactive-world.server")).interactiveSnapshot(
      db,
      context.userId,
      new Date(),
    );
  });
export const performVenueAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        place: z.string().max(80),
        action: z.enum([
          "look",
          "menu",
          "order_coffee",
          "order_food",
          "seat",
          "wait",
          "walk",
          "browse",
          "join",
          "discuss",
          "leave",
          "speak",
          "freeform", "cook", "movie", "games", "chores", "relax",
        ]),
        text: z.string().trim().max(1500).default(""),
        planId: z.string().uuid().optional(),
        character: z.enum(["tess", "maya", "claire", "jordan", "ben"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const s = await import("./interactive-world.server");
    await s.syncCalendar(db, context.userId, new Date());
    return s.actAtVenue(db, context.userId, data, new Date());
  });
export const respondToCalendarPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        planId: z.string().uuid(),
        action: z.enum(["accept", "decline", "cancel", "details", "reschedule"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const s = await import("./interactive-world.server");
    if (!(await s.interactiveAvailable(db))) throw new Error("Review migration 0019 first");
    const plans = await s.calendarPlans(db, context.userId),
      p = plans.find((p) => p.id === data.planId);
    if (!p || !p.conversation_id) throw new Error("Owned conversation invitation required");
    const manual = await import("./manual-calendar.server");
    if (await manual.manualCalendarReady(db)) {
      if (data.action === "details" || data.action === "reschedule")
        throw new Error("Edit the plan details directly; no message is required.");
      const result = await manual.saveManualCalendar(db, context.userId, {
        id: data.id,
        conversationId: p.conversation_id,
        planId: p.id,
        version: p.version,
        confirmed: data.action === "accept",
        plan: {
          action: data.action,
          planId: p.id,
          parentPlanId: null,
          title: null,
          description: null,
          category: null,
          date: null,
          time: null,
          timeHint: null,
          timeZone: null,
          place: null,
          durationMinutes: null,
          userQuote: null,
        },
      });
      return { conversationId: p.conversation_id, manual: true, status: result.status };
    }
    const bodies = {
      accept: `Yes, I accept our ${p.title} invitation.`,
      decline: `No thanks, I decline our ${p.title} invitation.`,
      cancel: `Please cancel our ${p.title} plan.`,
      details: `What time and which venue for our ${p.title}? Please use a known virtual venue or tell me which details are still undecided.`,
      reschedule: `Can we reschedule our ${p.title}? Let's discuss another time before changing the confirmed details.`,
    };
    // This is an explicit user action, delivered into the ordinary chat; never a fabricated assistant reply.
    const r = await db.from("messages").upsert(
      {
        id: data.id,
        user_id: context.userId,
        conversation_id: p.conversation_id,
        sender: "user",
        body: bodies[data.action],
        metadata: { calendar_plan: p.id, explicit_calendar_action: data.action },
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (r.error) throw new Error("Calendar response was not recorded");
    const stored = await db
      .from("messages")
      .select("*")
      .eq("user_id", context.userId)
      .eq("id", data.id)
      .eq("conversation_id", p.conversation_id)
      .maybeSingle();
    if (!stored.data || stored.data.body !== bodies[data.action])
      throw new Error("Action ID belongs to a different request");
    await s.syncCalendar(db, context.userId, new Date());
    await (
      await import("./tess.functions")
    ).runTurn(db, context.userId, p.conversation_id, "America/New_York");
    return { conversationId: p.conversation_id, manual: false, status: null };
  });
export const progressVenueExperience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        place: z.string().max(80),
        kind: z.enum(["book_club", "trivia"]),
        step: z.number().int().min(-1).max(10),
        choice: z.number().int().min(-1).max(5),
        planId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    await (await import("./interactive-world.server")).syncCalendar(db, context.userId, now);
    return (await import("./venue-experiences.server")).progressVenue(
      db,
      context.userId,
      data,
      now,
    );
  });
export const favoriteTownPlace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ place: z.string().max(80), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    if (!(await (await import("./venue-experiences.server")).experiencesAvailable(db)))
      throw new Error("Favorites need reviewed migration 0021");
    await (await import("./town.server")).initializeTown(db, context.userId);
    const r = await db.rpc("town_favorite", {
      p_user: context.userId,
      p_place: data.place,
      p_enabled: data.enabled,
    });
    if (r.error) throw new Error("Favorite could not be saved");
    return r.data;
  });
