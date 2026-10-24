import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { CharacterDef } from "./characters";
import {
  currentActivity,
  locationCategory,
  nextActivityAt,
  intentionDue,
} from "./world-continuity";
import { photoActionId } from "./photo-delivery.server";
import type { TessActivity } from "./tess-life";
type Admin = SupabaseClient<Database>;

export async function worldRuntimeAvailable(admin: Admin): Promise<boolean> {
  const { data, error } = await admin.rpc("world_runtime_status", {} as never);
  if (error?.code === "PGRST202" || error?.code === "42883") return false;
  if (error) throw new Error("World runtime capability check failed");
  return !!(data as { version?: number } | null)?.version;
}

export async function persistWorldCheckpoint(
  admin: Admin,
  args: {
    userId: string;
    conversationId: string;
    def: CharacterDef;
    now: Date;
    schedule: TessActivity;
    event: Json;
    chaos: number;
  },
) {
  const { data: old, error: readError } = await admin
    .from("character_world_state")
    .select("activity,availability,updated_at")
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (readError) throw new Error("World checkpoint unavailable");
  if (old && Date.parse(old.updated_at) > args.now.getTime())
    throw new Error("World clock cannot move backwards");
  const row = {
    conversation_id: args.conversationId,
    user_id: args.userId,
    character_key: args.def.key,
    activity: args.schedule.activity,
    availability: args.schedule.availability,
    location: locationCategory(args.schedule),
    current_event: args.event,
    updated_at: args.now.toISOString(),
    next_transition_at: nextActivityAt(args.def, args.now, args.chaos),
    next_check_at: new Date(args.now.getTime() + 30 * 60_000).toISOString(),
  };
  const { error } = await admin.from("character_world_state").upsert(row);
  if (error) throw new Error("World checkpoint could not be saved");
  if (!old || old.activity !== row.activity || old.availability !== row.availability) {
    const id = await photoActionId(
      `activity:${args.conversationId}:${Math.floor(args.now.getTime() / 900_000)}:${row.activity}`,
    );
    const { error: eventError } = await admin.from("world_events").upsert(
      {
        id,
        user_id: args.userId,
        conversation_id: args.conversationId,
        character_key: args.def.key,
        kind: "activity",
        summary: `${args.def.preferredName}: ${row.activity}`,
        occurs_at: args.now.toISOString(),
        processed_at: args.now.toISOString(),
        payload: {
          location: row.location,
          availability: row.availability,
          nextAt: row.next_transition_at,
        },
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (eventError) throw new Error("World activity history could not be saved");
  }
  return row;
}

export async function continuityContext(
  admin: Admin,
  userId: string,
  conversationId: string,
  now: Date,
) {
  const { data, error } = await admin
    .from("world_records")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .in("status", ["pending", "confirmed", "tentative"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Character continuity is unavailable");
  const records = data ?? [];
  return {
    due:
      records
        .filter((r) => intentionDue(r, now))
        .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""))[0] ?? null,
    lines: records.map(
      (r) =>
        `[id=${r.id}; ${r.status}; ${r.kind}${r.due_at ? `; due ${r.due_at}` : ""}] ${r.key}: ${r.summary}${r.status === "tentative" ? " — a claim, not established canon" : ""}`,
    ),
  };
}

export async function deferIntention(
  admin: Admin,
  id: string,
  userId: string,
  attempts: number,
  now: Date,
) {
  const retry = new Date(
    now.getTime() + Math.min(12 * 60, 30 * 2 ** Math.min(attempts, 5)) * 60_000,
  );
  const { error } = await admin
    .from("world_records")
    .update({
      attempts: attempts + 1,
      retry_at: retry.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error) throw new Error("Follow-up retry could not be saved");
}

export async function recordPhotoDecision(
  admin: Admin,
  args: {
    userId: string;
    conversationId: string;
    character: string;
    key: string;
    eligible: boolean;
    selected: boolean;
    reason: string;
    trigger?: string | null;
    now: Date;
  },
) {
  const id = await photoActionId(`decision:${args.key}:${Math.floor(args.now.getTime() / 1_800_000)}`);
  const { error } = await admin.from("world_events").upsert(
    {
      id,
      user_id: args.userId,
      conversation_id: args.conversationId,
      character_key: args.character,
      kind: "photo_decision",
      summary: args.reason,
      occurs_at: args.now.toISOString(),
      processed_at: args.now.toISOString(),
      payload: {
        eligible: args.eligible,
        selected: args.selected,
        trigger: args.trigger?.slice(0, 300) ?? null,
        source: "world-tick",
      },
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw new Error("Photo decision history could not be saved");
  return id;
}

/** Appends the recorded outcome of a selected opportunity; never rewrites the original decision fields. */
export async function recordPhotoDecisionOutcome(
  admin: Admin,
  args: { id: string; userId: string; outcome: "message_sent" | "not_sent" | "blocked"; reason?: string | null },
) {
  const { data } = await admin.from("world_events").select("payload").eq("id", args.id).eq("user_id", args.userId).maybeSingle();
  const prev = (data?.payload ?? {}) as Record<string, unknown>;
  if (prev["outcome"]) return;
  await admin
    .from("world_events")
    .update({ payload: { ...prev, outcome: args.outcome, outcomeReason: args.reason?.slice(0, 300) ?? null } })
    .eq("id", args.id)
    .eq("user_id", args.userId);
}

function limit(name: string, fallback: number, max: number) {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
}
export async function reserveImageBudget(
  admin: Admin,
  actionId: string,
  conversationId: string,
  userId: string,
) {
  const { data, error } = await admin.rpc("reserve_image_attempt", {
    p_action_id: actionId,
    p_conversation_id: conversationId,
    p_user_id: userId,
    p_daily: limit("IMAGE_DAILY_LIMIT", 50, 50),
    p_monthly: limit("IMAGE_MONTHLY_LIMIT", 1000, 1000),
  });
  if (error) throw new Error("Image usage limit could not be checked");
  return data === true;
}

export function previewWorld(def: CharacterDef, now: Date, hours = 6) {
  const output: { at: string; activity: string; location: string; availability: string }[] = [];
  let previous = "";
  for (let minute = 0; minute <= Math.min(hours, 24) * 60; minute += 15) {
    const at = new Date(now.getTime() + minute * 60_000);
    const schedule = currentActivity(def, at);
    const key = `${schedule.activity}:${schedule.availability}`;
    if (key !== previous)
      output.push({
        at: at.toISOString(),
        activity: schedule.activity,
        location: locationCategory(schedule),
        availability: schedule.availability,
      });
    previous = key;
  }
  return output;
}

export async function reserveWorldAi(admin: Admin, userId: string) {
  const { data, error } = await admin.rpc("reserve_world_ai", {
    p_user_id: userId,
    p_limit: limit("AUTONOMOUS_AI_DAILY_LIMIT", 12, 100),
  });
  if (error) throw new Error("Autonomous AI budget unavailable");
  return data === true;
}

export async function imageBudgetStatus(
  admin: Admin,
  userId: string,
  conversationId: string,
  now: Date,
) {
  const daily = limit("IMAGE_DAILY_LIMIT", 50, 50),
    monthly = limit("IMAGE_MONTHLY_LIMIT", 1000, 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
  const { data, error } = await admin
    .from("media_attempts")
    .select("conversation_id,created_at")
    .eq("user_id", userId)
    .gte(
      "created_at",
      new Date(Math.min(Date.parse(monthStart), now.getTime() - 86400000)).toISOString(),
    )
    .limit(3001);
  if (error) throw new Error("Image budget history unavailable");
  const rows = data ?? [],
    own = rows.filter((r) => r.conversation_id === conversationId);
  const rollingStart = new Date(now.getTime() - 86400000).toISOString();
  const monthlyRows = rows.filter((r) => r.created_at >= monthStart);
  const usedRolling = own.filter((r) => r.created_at >= rollingStart).length;
  const usedDaily = own.filter((r) => r.created_at >= dayStart).length;
  return {
    daily,
    monthly,
    usedDaily,
    usedRolling,
    usedMonthly: own.filter((r) => r.created_at >= monthStart).length,
    allowed:
      usedDaily < daily &&
      own.filter((r) => r.created_at >= monthStart).length < monthly &&
      usedRolling < daily &&
      rows.filter((r) => r.created_at >= rollingStart).length < daily * 3 &&
      rows.filter((r) => r.created_at >= dayStart).length < daily * 3 &&
      monthlyRows.length < monthly * 3,
  };
}
