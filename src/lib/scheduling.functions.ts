import { placeByKey } from "./place-registry";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scheduleActionSchema } from "./calendar-contract";
export const loadSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./scheduling-agenda.server")).schedulingAgenda(db, context.userId);
  });
export const createPlanDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        conversationId: z.string().uuid(),
        plan: scheduleActionSchema.refine(
          (plan) => !!plan.title?.trim() && !!plan.category,
          "Activity title and category are required",
        ),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const owned = await db
      .from("conversations")
      .select("id")
      .eq("user_id", context.userId)
      .eq("id", data.conversationId)
      .maybeSingle();
    if (owned.error || !owned.data) throw new Error("Owned contact required");
    const coordinator = await import("./calendar-coordinator.server");
    if (!(await coordinator.calendarContractReady(db)))
      throw new Error("Manual planning needs migration 0038");
    const body = `Would you like to join me for ${data.plan.title ?? "an outing"} ${data.plan.date ?? "(date undecided)"} at ${data.plan.time ?? "(time undecided)"} ${data.plan.timeZone ?? "America/New_York"} at ${placeByKey(data.plan.place)?.label ?? "a venue to be decided"}, for ${data.plan.durationMinutes ?? 60} minutes?`;
    const payload = await coordinator.schedulePayload(
      db,
      context.userId,
      data.conversationId,
      { ...data.plan, action: "invite", planId: null, parentPlanId: null },
      new Date(),
    );
    const stored = await db.from("messages").upsert(
      {
        id: data.id,
        user_id: context.userId,
        conversation_id: data.conversationId,
        sender: "user",
        body,
        metadata: {
          calendar_draft: {
            ...data.plan,
            action: "invite",
            planId: null,
            parentPlanId: null,
          } as never,
        },
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (stored.error) throw new Error("Invitation could not be saved");
    const source = await db
      .from("messages")
      .select("body,conversation_id")
      .eq("user_id", context.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (
      !source.data ||
      source.data.body !== body ||
      source.data.conversation_id !== data.conversationId
    )
      throw new Error("Invitation ID conflict");
    const applied = await db.rpc("calendar_apply", {
      p_user: context.userId,
      p_message: data.id,
      p_payload: payload as never,
      p_now: new Date().toISOString(),
    });
    if (applied.error) throw new Error("Invitation sync deferred; your request is saved for retry");
    // A genuine manual invitation is a user message. Its receipt is durable even if the AI is unavailable.
    let replyPending = false;
    try {
      await (
        await import("./tess.functions")
      ).runTurn(db, context.userId, data.conversationId, "America/New_York");
    } catch {
      replyPending = true;
    }
    return { conversationId: data.conversationId, replyPending };
  });

export const scheduleDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ conversationId: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer access required");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const owned = await db
      .from("conversations")
      .select("id")
      .eq("id", data.conversationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (owned.error || !owned.data) throw new Error("Owned conversation required");
    const agenda = await (
      await import("./scheduling-agenda.server")
    ).schedulingAgenda(db, context.userId);
    const events = agenda.events.filter((p) => p.conversation_id === data.conversationId);
    const receipts =
      agenda.structured && events.length
        ? await (db as any)
            .from("calendar_action_receipts")
            .select("plan_id,source_kind,result,created_at")
            .eq("user_id", context.userId)
            .in(
              "plan_id",
              events.map((p) => p.id),
            )
            .order("created_at", { ascending: false })
            .limit(20)
        : null;
    if (receipts?.error) throw new Error("Calendar audit history unavailable");
    return { structured: agenda.structured, events, receipts: receipts?.data ?? [] };
  });

/** Explicit user correction of a misparsed plan. Never touches scores or memories. */
export const editCalendarPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^\d{2}:\d{2}$/),
        durationMinutes: z.number().int().min(15).max(720),
        place: z.string().max(80).nullable(),
        confirmed: z.boolean(),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { easternInstant } = await import("./plan-edit");
    const cur = await db
      .from("social_plans")
      .select("id,status,organizer,version,place_key")
      .eq("user_id", context.userId)
      .eq("id", data.planId)
      .maybeSingle();
    if (cur.error || !cur.data) throw new Error("Plan not found");
    const exp = await db
      .from("living_experiences")
      .select("state")
      .eq("user_id", context.userId)
      .eq("plan_id", data.planId)
      .maybeSingle();
    if (["interactive", "paused", "auto_running", "completed"].includes(exp.data?.state ?? ""))
      throw new Error("This outing has already started; finish it before editing");
    if (["completed"].includes(cur.data.status)) throw new Error("Completed plans can't be edited");
    const start = easternInstant(data.date, data.time);
    const end = new Date(start.getTime() + data.durationMinutes * 60000);
    const status = data.confirmed ? "accepted" : cur.data.status;
    const u = await db
      .from("social_plans")
      .update({
        title: data.title,
        date_local: data.date,
        time_local: data.time,
        time_zone: "America/New_York",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        duration_minutes: data.durationMinutes,
        place_key: data.place ?? cur.data.place_key,
        missing_details: [],
        conflicts: [],
        ...(data.confirmed
          ? { status, user_response: "accepted", character_response: "accepted" }
          : {}),
        version: cur.data.version + 1,
      })
      .eq("user_id", context.userId)
      .eq("id", data.planId);
    if (u.error) throw new Error("Plan could not be updated");
    if (data.confirmed)
      await db
        .from("social_rsvps")
        .update({ response: "accepted", reason: "Confirmed via manual plan edit", updated_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .eq("plan_id", data.planId);
    if (exp.data?.state === "scheduled")
      await db
        .from("living_experiences")
        .update({
          start_at: start.toISOString(),
          claim_deadline: new Date(start.getTime() + 4 * 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", context.userId)
        .eq("plan_id", data.planId);
    if (status !== cur.data.status)
      await db.from("calendar_transitions").insert({
        user_id: context.userId,
        id: crypto.randomUUID(),
        plan_id: data.planId,
        from_status: cur.data.status,
        to_status: status,
        reason: "manual_edit",
      });
    return { ok: true };
  });
