import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const loadTown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./town.server")).townSnapshot(db, context.userId, new Date());
  });
export const actInTown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.enum(["visit", "speak", "contact", "read"]),
        id: z.string().uuid(),
        place: z.string().max(80).default(""),
        npc: z.string().max(80).default(""),
        text: z.string().trim().max(1500).default(""),
        mode: z.enum(["scene", "message"]).default("scene"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { initializeTown, visitTown, encounterTurn, townCommand } = await import("./town.server");
    await initializeTown(db, context.userId);
    const now = new Date();
    if (data.action === "visit") return visitTown(db, context.userId, data.place, now);
    if (data.action === "speak") {
      if (!data.text) throw new Error("Write a message first");
      return encounterTurn(db, context.userId, data.id, data.npc, data.text, data.mode, now);
    }
    return townCommand(db, context.userId, data.id, data.action, { npc: data.npc }, now);
  });
export const suggestGathering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        organizer: z.enum(["tess", "maya", "claire", "jordan", "ben"]),
        invitee: z.enum(["tess", "maya", "claire", "jordan", "ben"]),
        place: z.enum(["coffee:local", "park:local"]),
        title: z.string().trim().min(1).max(120),
        startsAt: z.string().datetime({ offset: true }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.organizer === data.invitee) throw new Error("Choose two different people");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await (await import("./town.server")).initializeTown(db, context.userId);
    const now = new Date(),
      endsAt = new Date(Date.parse(data.startsAt) + 60 * 60_000).toISOString();
    const { TOWN_PLACES, placeOpen } = await import("./town");
    const venue = TOWN_PLACES.find((p) => p.key === data.place)!;
    if (
      !placeOpen(venue, new Date(data.startsAt)) ||
      !placeOpen(venue, new Date(Date.parse(endsAt) - 1))
    )
      throw new Error("The venue is closed during this proposed gathering (Eastern time)");
    const { sharedRsvpDecision } = await import("./shared-world");
    const decision = sharedRsvpDecision(
      {
        id: `${context.userId}:${data.organizer}:${data.startsAt.slice(0, 13)}:${data.place}`,
        starts_at: data.startsAt,
        ends_at: endsAt,
      },
      data.organizer,
      "user_relay",
      now,
    );
    if (decision.response !== "accepted") return { accepted: false, reason: decision.reason };
    const r = await db.rpc("town_propose_plan", {
      p_user: context.userId,
      p_id: data.id,
      p_payload: {
        organizer: data.organizer,
        place: data.place,
        title: data.title,
        startsAt: data.startsAt,
        endsAt,
        invitees: [data.invitee],
      },
      p_now: now.toISOString(),
    });
    if (r.error)
      throw new Error(
        "Proposal could not be recorded. Both contacts need Real-Time mode, an available time 30 minutes–14 days ahead, and no conflicting plans. Daily limit: four.",
      );
    return {
      accepted: true,
      reason:
        "Organizer is interested; the other person will decide independently. Your attendance is not assumed.",
    };
  });
export const townDirector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId))
      throw new Error("Developer tools are disabled for this account");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    if (!(await (await import("./town.server")).townAvailable(db)))
      return { available: false, actions: [], people: [], presence: null, dailyAiLimit: 0 };
    const [actions, people, presence] = await Promise.all([
      db
        .from("town_actions")
        .select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("town_people").select("*").eq("user_id", context.userId),
      db.from("town_presence").select("*").eq("user_id", context.userId).maybeSingle(),
    ]);
    if (actions.error || people.error || presence.error)
      throw new Error("Exploration diagnostics unavailable");
    return {
      available: true,
      actions: (actions.data ?? []).map((a) => ({
        id: a.id,
        npc: a.npc_key,
        mode: a.mode,
        status: a.status,
        at: a.created_at,
      })),
      people: (people.data ?? []).map((p) => p.key),
      presence: presence.data,
      dailyAiLimit: Math.min(
        40,
        Math.max(0, Number(process.env["TOWN_DAILY_AI_LIMIT"] ?? 40) || 0),
      ),
    };
  });
