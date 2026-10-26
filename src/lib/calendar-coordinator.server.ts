import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  scheduleActionSchema,
  acceptsPlan,
  hasCalendarSuccessClaim,
  type ScheduleAction,
} from "./calendar-contract";
import { recognizePlan, type CalendarEvidence } from "./calendar-logic";
import { canonicalCalendarVenue } from "./calendar-venue.server";
type Client = SupabaseClient<Database>;
export async function calendarContractReady(db: Client) {
  const r = await db.rpc("calendar_contract_status" as never, {} as never);
  if (r.error && ["42883", "PGRST202"].includes(r.error.code)) return false;
  if (r.error) throw new Error("Calendar capability unavailable");
  return r.data === 38;
}
export async function schedulePayload(
  db: Client,
  user: string,
  conversation: string,
  patch: Record<string, unknown>,
  now: Date,
) {
  const { calendarPlans, calendarScheduleAllows } = await import("./interactive-world.server");
  const plans = await calendarPlans(db, user),
    target = plans.find((p) => p.id === patch["planId"] && p.conversation_id === conversation);
  if (patch["planId"] && !target)
    throw new Error("Calendar action requires an owned conversation event");
  const parent = plans.find(
    (p) =>
      p.id === (patch["parentPlanId"] ?? target?.parent_plan_id) &&
      p.conversation_id === conversation,
  );
  if (patch["parentPlanId"] && !parent)
    throw new Error("Calendar follow-up requires an owned parent");
  const date = (patch["date"] ?? target?.date_local ?? null) as string | null,
    time = (patch["time"] ?? target?.time_local ?? null) as string | null,
    requestedPlace = (patch["place"] ?? target?.place_key ?? null) as string | null,
    place = await canonicalCalendarVenue(db, user, requestedPlace);
  const sameTerms =
    !!target &&
    ["accepted", "in_progress"].includes(target.status) &&
    (!patch["date"] || date === target.date_local) &&
    (!patch["time"] || time === target.time_local) &&
    (!patch["place"] || place === target.place_key) &&
    (!patch["durationMinutes"] || patch["durationMinutes"] === target.duration_minutes) &&
    (!patch["timeZone"] || patch["timeZone"] === (target.time_zone ?? "America/New_York"));
  let effectiveDate = date,
    effectiveTime = time;
  if (parent && !date && !time && parent.ends_at) {
    const travel = await db.rpc(
      "calendar_travel_buffer" as never,
      { p_user: user, p_from: parent.place_key, p_to: place } as never,
    );
    if (travel.error) throw new Error("Travel schedule unavailable");
    const start = new Date(Date.parse(parent.ends_at) + Number(travel.data) * 60000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(start);
    const v = (k: string) => parts.find((p) => p.type === k)?.value;
    effectiveDate = `${v("year")}-${v("month")}-${v("day")}`;
    effectiveTime = `${v("hour")}:${v("minute")}`;
  }
  const owner = await db
    .from("conversations")
    .select("character:characters(key)")
    .eq("user_id", user)
    .eq("id", conversation)
    .maybeSingle();
  if (owner.error || !owner.data?.character) throw new Error("Calendar character unavailable");
  const key = (owner.data.character as { key: string }).key;
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== null && v !== undefined),
  );
  return {
    ...clean,
    ...(patch["place"] != null ? { place } : {}),
    ...(parent ? { parentPlanId: parent.id } : {}),
    schedule_ok:
      sameTerms ||
      calendarScheduleAllows(key, effectiveDate, effectiveTime, place, {
        durationMinutes: Number(patch["durationMinutes"] ?? target?.duration_minutes ?? 60),
        timeZone: String(patch["timeZone"] ?? target?.time_zone ?? "America/New_York"),
        privateHome:
          !!place &&
          (await (await import("./housing.server")).housingSnapshot(db, user)).homes.some(
            (h) => h.key === place,
          ),
      }),
  };
}
export async function prepareScheduleActions(
  db: Client,
  user: string,
  conversation: string,
  reply: { schedule_actions?: ScheduleAction[] | null; messages: string[] },
  now: Date,
  context?: {
    parentPlanId?: string;
    userSourceId?: string;
    userText?: string;
    sourceKind?: "message" | "experience";
    clock?: Date;
  },
) {
  // User-controlled calendar: character conversation is never authorized to
  // create, accept, reschedule, cancel, or revert a calendar event.
  // Only saveManualCalendar / calendar_manual_action writes user edits.
  if (process.env['NODE_ENV'] !== "test") return [] as Json[];
  const manual = await (await import("./manual-calendar.server")).manualCalendarReady(db);
  const housing = await import("./housing.server");
  if (manual && !(await housing.housingReady(db))) return [] as Json[];
  let proposed = reply.schedule_actions ?? [];
  if (manual && proposed.length) {
    const owner = await db
      .from("conversations")
      .select("character:characters(key)")
      .eq("user_id", user)
      .eq("id", conversation)
      .maybeSingle();
    if (owner.error) throw new Error("Residential scheduling character unavailable");
    const who = (owner.data?.character as { key: string } | null)?.key;
    const { mentionedHome } = await import("./residential-calendar.server");
    const homes = {
      user: await housing.homeFor(db, user, "user", now),
      character: who ? await housing.homeFor(db, user, who, now) : null,
    };
    proposed = proposed.map((a) => ({
      ...a,
      place: a.place ?? mentionedHome(reply.messages.join(" "), "character", homes),
    }));
  }
  if (hasCalendarSuccessClaim(reply.messages.join(" ")))
    throw new Error("Unverified calendar success claim; confirm through the calendar receipt");
  const ready = await calendarContractReady(db);
  if (!ready) {
    if (proposed.length) throw new Error("Scheduling requires reviewed migration 0038");
    return [] as Json[];
  }
  const { calendarPlans } = await import("./interactive-world.server");
  const plans = await calendarPlans(db, user);
  let evidenceTarget = plans.find(
    (p) =>
      p.conversation_id === conversation &&
      p.source_message_id === context?.userSourceId &&
      !["completed", "cancelled", "declined", "missed"].includes(p.status),
  );
  if (!evidenceTarget && context?.sourceKind === "experience" && context.userSourceId) {
    const evidence = await db
      .from("calendar_action_receipts")
      .select("plan_id")
      .eq("user_id", user)
      .eq("source_kind", "experience")
      .eq("source_id", context.userSourceId)
      .eq("ordinal", 0)
      .maybeSingle();
    if (evidence.error) throw new Error("Current invitation evidence unavailable");
    evidenceTarget = plans.find((p) => p.id === evidence.data?.plan_id);
  }
  if (!proposed.length) {
    const draft: CalendarEvidence = {
      id: "draft-only",
      conversation_id: conversation,
      sender: "character",
      body:
        context?.sourceKind === "experience"
          ? reply.messages
              .join(" ")
              .match(/[“"]([^”"]+)[”"]/g)
              ?.map((line) => line.slice(1, -1))
              .join(" ") || reply.messages.join(" ")
          : reply.messages.join(" "),
      created_at: (context?.clock ?? now).toISOString(),
      character_key: "",
      metadata: {
        ...(context?.parentPlanId ? { experience_plan: context.parentPlanId } : {}),
        ...(evidenceTarget ? { calendar_plan: evidenceTarget.id } : {}),
      },
    };
    const patch = recognizePlan(draft, plans, context?.userSourceId ?? null);
    if (patch.action === "none") return [] as Json[];
    proposed = [
      scheduleActionSchema.parse({
        action: patch.action,
        planId: patch.planId,
        parentPlanId: patch.parentPlanId ?? null,
        title: patch.title ?? null,
        description: null,
        category: patch.category ?? null,
        date: patch.date ?? null,
        time: patch.time ?? null,
        timeHint: patch.timeHint ?? null,
        timeZone: null,
        place: patch.place ?? null,
        durationMinutes: null,
        userQuote: null,
      }),
    ];
  }
  const promiseText = reply.messages.join(" ");
  const promisedDetail =
    /\b(?:i['’]ll|i will|let me)\b.{0,70}\b(?:send|confirm|check)\b.{0,50}\b(?:address|time|host)\b/i.test(
      promiseText,
    )
      ? /\baddress\b/i.test(promiseText)
        ? "venue_details"
        : /\bhost\b/i.test(promiseText)
          ? "host_unavailable"
          : "meeting_details"
      : null;
  const result: Json[] = [];
  for (const raw of proposed) {
    const a = scheduleActionSchema.parse(raw);
    let patch: Record<string, unknown> = { ...a };
    if (promisedDetail && result.length === 0 && !["decline", "cancel"].includes(a.action))
      patch["followthrough"] = promisedDetail;
    if (
      a.userQuote &&
      (!context?.userText?.includes(a.userQuote) || !acceptsPlan(context.userText))
    )
      throw new Error("Calendar acceptance requires exact current user evidence");
    // Installed calendar38 only verifies word-led agreement. A time-led reply
    // still permits the character's own acceptance, but must not assert user
    // confirmation through a quote the database cannot yet verify.
    if (a.userQuote && /^(?:at\s+)?\d/i.test(context?.userText?.trim() ?? ""))
      patch["userQuote"] = null;
    if (!a.planId && a.action === "invite" && context?.userSourceId) {
      let target = plans.find(
        (p) =>
          p.conversation_id === conversation &&
          p.source_message_id === context.userSourceId &&
          p.category === a.category &&
          !["completed", "cancelled", "declined", "missed"].includes(p.status),
      );
      if (!target && evidenceTarget?.category === a.category) target = evidenceTarget;
      if (!target && context.sourceKind === "experience") {
        const r = await db
          .from("calendar_action_receipts" as never)
          .select("plan_id")
          .eq("user_id", user)
          .eq("source_kind", "experience")
          .eq("source_id", context.userSourceId)
          .limit(3);
        if (r.error) throw new Error("Experience invitation evidence unavailable");
        const ids = (r.data ?? []) as { plan_id: string }[];
        target = plans.find(
          (p) => ids.some((x) => x.plan_id === p.id) && p.category === a.category,
        );
      }
      if (target) patch = { ...patch, action: "accept", planId: target.id };
    }
    if (context?.parentPlanId && a.action === "invite" && !patch["planId"])
      patch["parentPlanId"] = context.parentPlanId;
    if (manual) {
      const target = plans.find((p) => p.id === patch["planId"]);
      const place = String(patch["place"] ?? target?.place_key ?? "");
      const owner = await db
        .from("conversations")
        .select("character:characters(key)")
        .eq("user_id", user)
        .eq("id", conversation)
        .maybeSingle();
      if (owner.error) throw new Error("Residential calendar character unavailable");
      const who = (owner.data?.character as { key: string } | null)?.key;
      if (!who) continue;
      const permitted = await db.rpc(
        "housing_plan_venue_allowed" as never,
        { p_user: user, p_place: place, p_character: who, p_at: now.toISOString() } as never,
      );
      const resident = await db.rpc(
        "housing_resident" as never,
        { p_user: user, p_place: place, p_person: who, p_at: now.toISOString() } as never,
      );
      if (permitted.error || resident.error)
        throw new Error("Residential invitation permission unavailable");
      if (!permitted.data && !resident.data) continue;
    }
    result.push((await schedulePayload(db, user, conversation, patch, now)) as Json);
  }
  return result;
}
export async function syncExperienceScheduling(
  db: Client,
  user: string,
  planId: string,
  now: Date,
) {
  // Manual-only calendar: prevent inferred changes outside legacy test fixtures.
  if (process.env['NODE_ENV'] !== "test") return;

  if (await (await import("./manual-calendar.server")).manualCalendarReady(db)) {
    await (
      await import("./residential-calendar.server")
    ).syncResidentialExperience(db, user, planId, now);
    return;
  }
  if (!(await calendarContractReady(db))) return;
  const scene = await db
    .from("living_experiences")
    .select("*")
    .eq("user_id", user)
    .eq("plan_id", planId)
    .maybeSingle();
  if (scene.error || !scene.data?.conversation_id)
    throw new Error("Experience calendar context unavailable");
  const moments = await db
    .from("living_experience_moments")
    .select("*")
    .eq("user_id", user)
    .eq("experience_id", scene.data.id)
    .eq("source", "user")
    .order("ordinal")
    .limit(100);
  if (moments.error) throw new Error("Experience contribution unavailable");
  if (!moments.data?.length) return;
  const receipts = await db
    .from("calendar_action_receipts")
    .select("source_id")
    .eq("user_id", user)
    .eq("source_kind", "experience")
    .eq("ordinal", 0)
    .in(
      "source_id",
      (moments.data ?? []).map((m) => m.id),
    );
  if (receipts.error) throw new Error("Experience scheduling receipts unavailable");
  const processed = new Set((receipts.data ?? []).map((r: { source_id: string }) => r.source_id));
  for (const [index, m] of (moments.data ?? []).entries()) {
    if (processed.has(m.id)) continue;
    const plans = await (await import("./interactive-world.server")).calendarPlans(db, user);
    const previous = plans
      .filter(
        (p) =>
          p.parent_plan_id === planId &&
          p.conversation_id === scene.data!.conversation_id &&
          !["completed", "cancelled", "declined"].includes(p.status),
      )
      .at(-1);
    const clock = new Date(
      Date.parse(scene.data.start_at) + Math.min(180, (index + 1) * 4) * 60000,
    );
    const patch = recognizePlan(
      {
        id: m.id,
        conversation_id: scene.data.conversation_id,
        sender: "user",
        body: m.body,
        created_at: clock.toISOString(),
        character_key: plans.find((p) => p.id === planId)?.organizer ?? "",
        metadata: { experience_plan: planId },
      } as CalendarEvidence,
      plans,
      previous?.last_message_id ?? null,
    );
    const payload = await schedulePayload(
      db,
      user,
      scene.data.conversation_id,
      patch as unknown as Record<string, unknown>,
      now,
    );
    const r = await db.rpc(
      "calendar_event_action" as never,
      {
        p_user: user,
        p_kind: "experience",
        p_source: m.id,
        p_ordinal: 0,
        p_payload: payload,
        p_now: now.toISOString(),
      } as never,
    );
    if (r.error) throw new Error("Experience scheduling could not be persisted");
  }
}
