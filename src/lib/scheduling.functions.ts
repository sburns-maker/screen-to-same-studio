import { planEditSchema } from "./plan-edit";
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
        confirmed: z.boolean().default(false),
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
    const manual = await import("./manual-calendar.server");
    if (await manual.manualCalendarReady(db)) {
      const result = await manual.saveManualCalendar(db, context.userId, {
        id: data.id,
        conversationId: data.conversationId,
        plan: { ...data.plan, action: "invite", planId: null, parentPlanId: null },
        confirmed: data.confirmed,
      });
      return { ...result, replyPending: false };
    }
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
    return { conversationId: data.conversationId, replyPending, status: null };
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
        ? await db
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
    return {
      manual: agenda.manual,
      structured: agenda.structured,
      events,
      receipts: receipts?.data ?? [],
    };
  });

/** Edits are evidence-backed canonical actions, never direct table overrides. */
export const editCalendarPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => planEditSchema.parse(v))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const result = await (
      await import("./plan-edit.server")
    ).savePlanEdit(db, context.userId, data);
    let replyPending = false;
    if (!result.replayed && !result.manual) {
      try {
        await (
          await import("./tess.functions")
        ).runTurn(db, context.userId, result.conversationId, "America/New_York");
      } catch {
        replyPending = true;
      }
    }
    return { ...result, replyPending };
  });
