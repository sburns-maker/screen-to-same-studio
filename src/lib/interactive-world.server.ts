import { scheduleActionSchema } from "./calendar-contract";
import { zonedInstant } from "./calendar-time";
import { experiencesAvailable } from "./venue-experiences.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  PLACE_REGISTRY,
  placeByKey,
  placeKnowledge,
  interpretVenueAction,
  type VenueAction,
} from "./place-registry";
import { TOWN_PLACES, placeOpen } from "./town";
import { characterFor, type CharacterKey } from "./characters";
import { currentActivity } from "./world-continuity";
import { scheduleFor } from "./tess-life";
import {
  recognizePlan,
  easternInstant,
  type CalendarEvidence,
  type CalendarPlan,
} from "./calendar-logic";
type Client = SupabaseClient<Database>;
export async function interactiveAvailable(db: Client) {
  const r = await db.rpc("interactive_world_status", {} as never);
  if (r.error && ["42883", "PGRST202"].includes(r.error.code)) return false;
  if (r.error) throw new Error("Interactive world unavailable");
  return r.data === 19;
}
/** Explicit user-confirmed plans override fictional character routine, not venue hours. */
export function calendarVenueAllows(
  date: string | null,
  time: string | null,
  place: string | null,
  options: { durationMinutes?: number; timeZone?: string; privateHome?: boolean } = {},
) {
  const start = zonedInstant(date, time, options.timeZone);
  const venue = placeByKey(place) ?? (options.privateHome ? { opens: 0, closes: 24 } : null);
  if (!start || !venue) return false;
  const from = new Date(start);
  const end = new Date(from.getTime() + (options.durationMinutes ?? 60) * 60000 - 1);
  return placeOpen(venue, from) && placeOpen(venue, end);
}
export function calendarScheduleAllows(
  character: string,
  date: string | null,
  time: string | null,
  place: string | null,
  options: { durationMinutes?: number; timeZone?: string; privateHome?: boolean } = {},
) {
  const start = zonedInstant(date, time, options.timeZone),
    p = placeByKey(place) ?? (options.privateHome ? {opens:0,closes:24} : null);
  if (!start || !p) return false;
  const at = new Date(start),
    end = new Date(at.getTime() + (options.durationMinutes ?? 60) * 60000);
  if (!placeOpen(p, at) || !placeOpen(p, new Date(end.getTime() - 1))) return false;
  const c = characterFor(character),
    s = c.schedule;
  for (let t = at.getTime() - 30 * 60000; t <= end.getTime() + 30 * 60000; t += 15 * 60000) {
    const now = new Date(t),
      a = currentActivity(c, now);
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "numeric",
        hourCycle: "h23",
      }).formatToParts(now),
      day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        parts.find((x) => x.type === "weekday")!.value,
      ),
      hour = Number(parts.find((x) => x.type === "hour")!.value);
    if (
      a.availability === "busy" ||
      a.availability === "asleep" ||
      (c.key !== "tess" && /at work/i.test(a.detail)) ||
      (c.key === "tess" && ["busy", "asleep"].includes(scheduleFor(now).availability)) ||
      (s.workDays.includes(day) && hour >= s.workStart && hour < s.workEnd)
    )
      return false;
  }
  return true;
}
export async function registerInteractivePlaces(db: Client, user: string) {
  const r = await db.from("world_places").upsert(
    PLACE_REGISTRY.map((p) => ({
      user_id: user,
      key: p.key,
      label: p.label,
      kind: p.kind,
      metadata: JSON.parse(JSON.stringify({ ...p, fictional: true })) as Json,
    })),
    { onConflict: "user_id,key", ignoreDuplicates: true },
  );
  if (r.error) throw new Error("Venue registry unavailable");
  // Merge newly added public activity fields without overwriting established names, descriptions or authored metadata.
  const existing = await db
    .from("world_places")
    .select("*")
    .eq("user_id", user)
    .in(
      "key",
      PLACE_REGISTRY.map((p) => p.key),
    );
  if (existing.error) throw new Error("Venue metadata unavailable");
  for (const row of existing.data ?? []) {
    const p = placeByKey(row.key);
    if (!p) continue;
    const md = row.metadata as Record<string, Json>;
    if (!md["activities"] || !md["experience_templates"]) {
      const w = await db
        .from("world_places")
        .update({
          metadata: {
            ...p,
            ...md,
            activities: [...p.activities],
            experience_templates: p.experience_templates,
          } as unknown as Json,
        })
        .eq("user_id", user)
        .eq("key", p.key);
      if (w.error) throw new Error("Venue activities unavailable");
    }
  }
}
export async function calendarPlans(db: Client, user: string) {
  return (await (await import("./calendar-store.server")).readCanonicalPlans(db, user)).filter(
    (p) => p.origin === "conversation" && p.conversation_id !== null,
  );
}
export async function syncCalendar(db: Client, user: string, now: Date) {
  // Read-only calendar synchronization: background ticks must never create,
  // revert, accept, or change a user-managed event.
  if (!(await interactiveAvailable(db))) return { processed: 0, updated: 0 };
  if (process.env['NODE_ENV'] !== "test") return { processed: 0, updated: 0 };
  await registerInteractivePlaces(db, user);
  if (await (await import("./manual-calendar.server")).manualCalendarReady(db)) {
    const blocked = ["tess", "maya", "claire", "jordan", "ben", "riley"].filter((key) =>
      ["busy", "asleep"].includes(currentActivity(characterFor(key), now).availability),
    );
    const presence = await db.rpc("calendar_advance", {
      p_user: user,
      p_now: now.toISOString(),
      p_blocked: blocked,
    });
    if (presence.error) throw new Error("Calendar presence unavailable; saved plans are unchanged");
    return { processed: 0, updated: 0 };
  }
  if (await experiencesAvailable(db)) {
    const departures = await db.rpc("venue_reconcile_departures", {
      p_user: user,
      p_now: now.toISOString(),
    });
    if (departures.error) throw new Error("Departure recovery deferred; travel evidence retained");
  }
  const pending = await db.rpc("calendar_pending", { p_user: user, p_now: now.toISOString() });
  if (pending.error) throw new Error("Calendar queue unavailable");
  let updated = 0,
    processed = 0;
  // A user line and its reply may share the same millisecond (notably voice playback).
  // UUID order is not causal order. Prefer the proposal, then its response.
  const evidence = [...((pending.data as unknown as CalendarEvidence[]) ?? [])].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      a.conversation_id.localeCompare(b.conversation_id) ||
      Number(a.sender !== "user") - Number(b.sender !== "user") ||
      a.id.localeCompare(b.id),
  );
  const previousInBatch = new Map<string, string>();
  for (const m of evidence) {
    const plans = await calendarPlans(db, user);
    const before = await db
      .from("messages")
      .select("id")
      .eq("user_id", user)
      .eq("conversation_id", m.conversation_id)
      .lt("created_at", m.created_at)
      .lte("visible_at", now.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (before.error) throw new Error("Invitation context unavailable");
    const draft =
      m.sender === "user"
        ? (m.metadata as { calendar_draft?: Record<string, unknown> } | null)?.calendar_draft
        : null;
    const validatedDraft = scheduleActionSchema.safeParse(draft);
    const patch = validatedDraft.success
        ? validatedDraft.data
        : recognizePlan(
            m,
            plans,
            previousInBatch.get(m.conversation_id) ?? before.data?.id ?? null,
          ),
      target = plans.find((p) => p.id === patch.planId);
    const date = patch.date ?? target?.date_local ?? null,
      time = patch.time ?? target?.time_local ?? null,
      place = patch.place ?? target?.place_key ?? null;
    const contract = await import("./calendar-coordinator.server");
    const payload = (await contract.calendarContractReady(db))
      ? await contract.schedulePayload(
          db,
          user,
          m.conversation_id,
          patch as unknown as Record<string, unknown>,
          now,
        )
      : { ...patch, schedule_ok: calendarScheduleAllows(m.character_key, date, time, place) };
    const r = await db.rpc("calendar_apply", {
      p_user: user,
      p_message: m.id,
      p_payload: payload as unknown as Json,
      p_now: now.toISOString(),
    });
    if (r.error) throw new Error("Calendar sync deferred; source evidence is retained for retry");
    previousInBatch.set(m.conversation_id, m.id);
    processed++;
    if (patch.action !== "none") updated++;
  }
  const blocked = ["tess", "maya", "claire", "jordan", "ben"].filter((key) => {
    const a = currentActivity(characterFor(key), now);
    return (
      a.availability === "busy" ||
      a.availability === "asleep" ||
      (key === "tess" && ["busy", "asleep"].includes(scheduleFor(now).availability))
    );
  });
  const advanced = await db.rpc("calendar_advance", {
    p_user: user,
    p_now: now.toISOString(),
    p_blocked: blocked,
  });
  if (advanced.error) throw new Error("Calendar progression deferred");
  return { processed, updated };
}
export async function interactiveSnapshot(db: Client, user: string, now: Date) {
  if (!(await interactiveAvailable(db)))
    return {
      available: false,
      experiencesEnabled: false,
      recentVisits: [] as {
        id: string;
        place_key: string;
        arrived_at: string;
        departed_at: string | null;
        state: Json;
      }[],
      plans: [] as CalendarPlan[],
      session: null as null | {
        id: string;
        place_key: string;
        state: Json;
        arrived_at: string;
        departed_at: string | null;
      },
      actions: [] as {
        id: string;
        action: string;
        detail: string;
        created_at: string;
        result: Json;
      }[],
      transitions: [] as {
        plan_id: string;
        from_status: string | null;
        to_status: string;
        reason: string;
        created_at: string;
      }[],
      companions: [] as { character_key: string; plan_id: string; place_key: string }[],
    };
  await syncCalendar(db, user, now);
  const [plans, session, actions, transitions, companions, recentVisits, experiencesEnabled] =
    await Promise.all([
      calendarPlans(db, user),
      db.rpc("venue_session", { p_user: user, p_now: now.toISOString() }),
      db
        .from("venue_actions")
        .select("*")
        .eq("user_id", user)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("calendar_transitions")
        .select("*")
        .eq("user_id", user)
        .order("created_at", { ascending: false })
        .limit(40),
      db.from("social_presence").select("*").eq("user_id", user).gt("until_at", now.toISOString()),
      db
        .from("venue_sessions")
        .select("*")
        .eq("user_id", user)
        .order("arrived_at", { ascending: false })
        .limit(12),
      experiencesAvailable(db),
    ]);
  if (session.error || actions.error || transitions.error || companions.error || recentVisits.error)
    throw new Error("Venue state unavailable");
  // Expose only companions whose accepted event includes this user; other characters' private whereabouts stay private.
  return {
    available: true,
    experiencesEnabled,
    recentVisits: recentVisits.data ?? [],
    plans,
    session: session.data as {
      id: string;
      place_key: string;
      state: Json;
      arrived_at: string;
      departed_at: string | null;
    } | null,
    actions: actions.data ?? [],
    transitions: transitions.data ?? [],
    companions: (companions.data ?? [])
      .filter((p) =>
        plans.some(
          (plan) =>
            plan.id === p.plan_id &&
            plan.user_response === "accepted" &&
            plan.character_response === "accepted" &&
            plan.status === "in_progress",
        ),
      )
      .map((p) => ({ character_key: p.character_key, plan_id: p.plan_id, place_key: p.place_key })),
  };
}
export async function calendarContext(
  db: Client,
  user: string,
  conversation: string,
  character: string,
  now: Date,
) {
  if (!(await interactiveAvailable(db))) return [] as string[];
  const canonical = await calendarPlans(db, user);
  const plans = canonical.filter(
    (p) =>
      p.conversation_id === conversation &&
      p.organizer === character &&
      !["completed", "cancelled", "declined", "missed"].includes(p.status),
  );
  const lines = [
    ...((await (await import("./manual-calendar.server")).manualCalendarReady(db))
      ? [
          "USER-CONTROLLED PUBLIC CALENDAR: Discuss and agree to public outings naturally, but return schedule_actions=null for public venues. If the private housing capability below is available, structured schedule_actions can record explicit residential agreements only. The player explicitly adds or edits agreed arrangements in Plans. Never say you updated, canceled or saved the calendar, and never require an extra confirmation message to save an already agreed plan.",
        ]
      : []),
    placeKnowledge(),
    await (await import("./housing.server")).housingContext(db,user,character,now),
    ...canonical
      .filter(
        (p) =>
          p.conversation_id === conversation &&
          p.organizer === character &&
          ["completed", "cancelled", "declined", "missed"].includes(p.status),
      )
      .slice(0, 6)
      .map(
        (p) =>
          `RESOLVED CANONICAL PLAN ${p.id}: ${p.title}; status ${p.status}; ${p.starts_at ?? "time undecided"}; attendance ${p.user_attendance}. This current record takes precedence over older planning memories. Do not revive a canceled or declined appointment or infer attendance from an elapsed date.`,
      ),
    "An accepted or active plan with THIS user is your existing commitment, not a competing booking. Active Living Experiences own their outcomes until explicitly finished. Never use the baseline weekly schedule to deny being at a confirmed outing. Other user commitments below reveal only busy times, not private conversations or participants.",
    ...canonical
      .filter(
        (p) =>
          p.conversation_id !== conversation &&
          p.user_response === "accepted" &&
          p.character_response === "accepted" &&
          ["accepted", "in_progress"].includes(p.status) &&
          p.starts_at &&
          Date.parse(p.ends_at ?? p.starts_at) >= now.getTime(),
      )
      .slice(0, 20)
      .map(
        (p) =>
          `USER BUSY (details private): ${p.starts_at} to ${p.ends_at}; include travel time if proposing another plan.`,
      ),
    ...plans.map(
      (p) =>
        `YOUR CONVERSATION PLAN ${p.id}: ${p.title}; ${p.status}; date ${p.date_local ?? "undecided"}, time ${p.time_local ?? p.time_hint ?? "undecided"} ${p.time_zone ?? "America/New_York"}; parent ${p.parent_plan_id ?? "none"}; venue ${placeByKey(p.place_key)?.label ?? (/^(home:|residence:)/.test(p.place_key??"")?`private home ${p.place_key} (address not implied)`:"undecided")}; user ${p.user_response}, you ${p.character_response}; missing ${p.missing_details.join(", ")}; conflicts ${JSON.stringify(p.conflicts)}; followthrough ${JSON.stringify(p.followthrough)}. Choose known venue/time details explicitly if appropriate. A map meeting point is available for fictional places, NOT a verified street address. No host/email/reservation tools exist. Do not claim user attendance.`,
    ),
  ];
  const active = await db
    .from("living_experiences")
    .select("plan_id,state,start_at")
    .eq("user_id", user)
    .eq("conversation_id", conversation)
    .in("state", ["interactive", "paused"])
    .limit(10);
  if (active.error && !["42P01", "PGRST205"].includes(active.error.code))
    throw new Error("Active outing context unavailable");
  for (const scene of active.data ?? [])
    lines.push(
      `YOUR PROTECTED EXPERIENCE ${scene.plan_id}: ${scene.state}; fictional start ${scene.start_at}. This is an existing outing with this user. Propose a separate linked follow-up rather than rescheduling or replacing it; never claim it completed from elapsed clock time.`,
    );
  const presence = await db.from("town_presence").select("*").eq("user_id", user).maybeSingle();
  const here = plans.find(
    (p) =>
      p.status === "in_progress" &&
      p.place_key === presence.data?.place_key &&
      Date.parse(presence.data.arrives_at) <= now.getTime(),
  );
  if (here) {
    lines.push(
      `The user has actually arrived virtually at your accepted ${here.title}. Their recorded attendance state is ${here.user_attendance}. Respond naturally to their explicit scene actions; do not invent actions or private attendee facts.`,
    );
    const visit = await db
      .from("venue_sessions")
      .select("state")
      .eq("user_id", user)
      .eq("place_key", here.place_key!)
      .is("departed_at", null)
      .maybeSingle();
    if (visit.error) throw new Error("Shared activity context unavailable");
    const experience = (
      visit.data?.state as
        { experiences?: Record<string, { summary?: string; answers?: Json }> } | undefined
    )?.experiences?.[here.id];
    if (experience)
      lines.push(
        `YOUR CURRENT SHARED ACTIVITY: ${experience.summary ?? "In progress"}. Only recorded user contributions: ${JSON.stringify(experience.answers ?? [])}. These are the user's choices, not other attendees' dialogue, opinions or consent.`,
      );
  }
  return lines;
}
export async function actAtVenue(
  db: Client,
  user: string,
  data: {
    id: string;
    place: string;
    action: VenueAction | "speak" | "freeform";
    text: string;
    planId?: string | undefined;
    character?: CharacterKey | undefined;
  },
  now: Date,
) {
  if (!(await interactiveAvailable(db)))
    throw new Error("Review migration 0019 before venue interactions");
  const home = (await (await import("./housing.server")).housingSnapshot(db,user)).homes.find(h=>h.key===data.place&&h.canVisit);
  const p = placeByKey(data.place) ?? home;
  if (!p) throw new Error("Unknown or unauthorized virtual place");
  let action = data.action,
    quantity = 1;
  if (action === "freeform") {
    const interpreted = interpretVenueAction(data.text);
    if (!interpreted)
      throw new Error(
        "This action needs a conversation. Use Talk to a present companion or introduce yourself to an available NPC.",
      );
    action = interpreted.action;
    quantity = interpreted.quantity;
  }
  const r = await db.rpc("venue_act", {
    p_user: user,
    p_id: data.id,
    p_place: p.key,
    p_action: action,
    p_detail: data.text,
    p_now: now.toISOString(),
    ...(data.planId ? { p_plan: data.planId } : {}),
    ...(data.character ? { p_character: data.character } : {}),
    p_quantity: quantity,
  });
  if (r.error) {
    const safe = [
      "Arrive before interacting",
      "Activity not available at this venue",
      "The fictional venue is closed",
      "A current accepted event here is required",
      "Your companion has not arrived",
      "Confirmed companion required",
      "Action ID belongs to a different request",
    ];
    throw new Error(
      safe.includes(r.error.message)
        ? r.error.message
        : "Venue action could not be confirmed. Refresh before retrying; the action ID prevents duplicates.",
    );
  }
  const result = r.data as { conversationId?: string | null; replayed?: boolean };
  if (action === "speak" && result.conversationId) {
    const { runTurn } = await import("./tess.functions");
    await runTurn(db, user, result.conversationId, "America/New_York");
  }
  return r.data;
}
