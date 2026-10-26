import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { acceptsPlan } from "./calendar-contract";
import {
  recognizePlan,
  resolveDate,
  resolveTime,
  type CalendarEvidence,
  type CalendarPatch,
} from "./calendar-logic";
import { housingReady, homeFor } from "./housing.server";
/** Resolve pronouns against the speaker, never a global shared home label. */
export function mentionedHome(
  text: string,
  speaker: "user" | "character",
  homes: { user: string | null; character: string | null },
) {
  if (/\b(?:my|our) (?:home|house|apartment|place)\b/i.test(text)) return homes[speaker];
  if (/\b(?:your) (?:home|house|apartment|place)\b/i.test(text))
    return homes[speaker === "user" ? "character" : "user"];
  return null;
}
/** Current user source only: no historical sweep, cancellation inference or unrelated plan mutations. */
export async function syncResidentialUserMessage(
  db: SupabaseClient<Database>,
  user: string,
  conversation: string,
  sourceId: string,
  now: Date,
) {
  // Manual-only calendar: never mutate a plan from a chat message or experience.
  return;

  if (!(await housingReady(db))) return;
  const [source, owner] = await Promise.all([
    db
      .from("messages")
      .select("*")
      .eq("user_id", user)
      .eq("conversation_id", conversation)
      .eq("id", sourceId)
      .eq("sender", "user")
      .lte("visible_at", now.toISOString())
      .maybeSingle(),
    db
      .from("conversations")
      .select("character:characters(key)")
      .eq("user_id", user)
      .eq("id", conversation)
      .maybeSingle(),
  ]);
  if (source.error || owner.error) throw new Error("Current residential invitation unavailable");
  const m = source.data,
    key = (owner.data?.character as { key: string } | null)?.key;
  if (!m || !key) return;
  const previous = await db
    .from("messages")
    .select("id")
    .eq("user_id", user)
    .eq("conversation_id", conversation)
    .eq("sender", "tess")
    .lte("created_at", m.created_at)
    .lte("visible_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (previous.error) throw new Error("Invitation adjacency unavailable");
  return syncResidentialEvidence(
    db,
    user,
    conversation,
    key,
    m,
    "message",
    previous.data?.[0]?.id ?? null,
    now,
  );
}
export async function syncResidentialExperience(
  db: SupabaseClient<Database>,
  user: string,
  plan: string,
  now: Date,
) {
  // Manual-only calendar: never mutate a plan from a chat message or experience.
  return;

  if (!(await housingReady(db))) return;
  const scene = await db
    .from("living_experiences")
    .select("id,conversation_id,start_at")
    .eq("user_id", user)
    .eq("plan_id", plan)
    .maybeSingle();
  if (scene.error || !scene.data?.conversation_id)
    throw new Error("Residential outing source unavailable");
  const m = await db
    .from("living_experience_moments")
    .select("*")
    .eq("user_id", user)
    .eq("experience_id", scene.data.id)
    .eq("source", "user")
    .order("ordinal", { ascending: false })
    .limit(1);
  if (m.error) throw new Error("Residential contribution unavailable");
  const latest = m.data?.[0];
  if (!latest) return;
  const prior = await db
    .from("living_experience_moments")
    .select("id")
    .eq("user_id", user)
    .eq("experience_id", scene.data.id)
    .eq("source", "character")
    .lt("ordinal", latest.ordinal)
    .order("ordinal", { ascending: false })
    .limit(1);
  const owner = await db
    .from("conversations")
    .select("character:characters(key)")
    .eq("user_id", user)
    .eq("id", scene.data.conversation_id)
    .maybeSingle();
  if (prior.error || owner.error) throw new Error("Residential invitation adjacency unavailable");
  const who = (owner.data?.character as { key: string } | null)?.key;
  if (!who) return;
  const count = await db
    .from("living_experience_moments")
    .select("id")
    .eq("user_id", user)
    .eq("experience_id", scene.data.id)
    .eq("source", "user")
    .lte("ordinal", latest.ordinal);
  if (count.error) throw new Error("Fictional outing clock unavailable");
  return syncResidentialEvidence(
    db,
    user,
    scene.data.conversation_id,
    who,
    {
      ...latest,
      created_at: new Date(
        Date.parse(scene.data.start_at) + Math.min(180, (count.data?.length ?? 0) * 4) * 60000,
      ).toISOString(),
      metadata: { experience_plan: plan },
    },
    "experience",
    prior.data?.[0]?.id ?? null,
    now,
  );
}
async function syncResidentialEvidence(
  db: SupabaseClient<Database>,
  user: string,
  conversation: string,
  key: string,
  m: { id: string; body: string; created_at: string; metadata?: unknown },
  kind: "message" | "experience",
  previousId: string | null,
  now: Date,
) {
  const receipt = await db
    .from("calendar_action_receipts")
    .select("source_id")
    .eq("user_id", user)
    .eq("source_kind", kind)
    .eq("source_id", m.id)
    .eq("ordinal", 0)
    .maybeSingle();
  if (receipt.error) throw new Error("Residential calendar receipt unavailable");
  if (receipt.data) return;
  if (/\b(?:move in|moving in|live together|cohabit|rent together)\b/i.test(m.body)) return;
  const { calendarPlans } = await import("./interactive-world.server");
  const plans = await calendarPlans(db, user),
    residences = await db.rpc(
      "housing_snapshot" as never,
      { p_user: user, p_viewer: "user" } as never,
    );
  if (residences.error) throw new Error("Residential venue permissions unavailable");
  const homes = {
    user: await homeFor(db, user, "user", now),
    character: await homeFor(db, user, key, now),
  };
  const place = mentionedHome(m.body, "user", homes);
  const all = plans.filter((p) => p.conversation_id === conversation);
  const privatePlans = all.filter(
    (p) => p.place_key?.startsWith("home:") || p.place_key?.startsWith("residence:"),
  );
  let patch: CalendarPatch = recognizePlan(
    { ...m, conversation_id: conversation, sender: "user", character_key: key } as CalendarEvidence,
    privatePlans,
    previousId,
  );
  if (place) patch = { ...patch, place };
  // Cooking/movie/game invitations are home activities, not new public venue types.
  if (
    patch.action === "none" &&
    place &&
    /\b(?:cook|movie|game night|hang out|come over|dinner)\b/i.test(m.body) &&
    /\?|\b(?:let['’]s|want to|how about|would you)\b/i.test(m.body)
  ) {
    const date = resolveDate(m.body, new Date(m.created_at)),
      time = resolveTime(m.body);
    patch = {
      action: "invite",
      planId: null,
      ...(kind === "experience" && /\b(?:after|afterward|then|next)\b/i.test(m.body)
        ? { parentPlanId: (m.metadata as { experience_plan: string }).experience_plan }
        : {}),
      title: /\bcook|dinner\b/i.test(m.body) ? "Cooking together" : "Time at home",
      category: /\bcook|dinner\b/i.test(m.body) ? "dinner" : "meetup",
      place,
      ...(date ? { date } : {}),
      ...(time ? { time } : {}),
    };
  }
  if (acceptsPlan(m.body)) {
    const adjacent = privatePlans.filter(
      (p) =>
        !["completed", "cancelled", "declined", "missed"].includes(p.status) &&
        (p.last_message_id ?? p.source_message_id) === previousId,
    );
    if (adjacent.length === 1) patch = { ...patch, action: "accept", planId: adjacent[0]!.id };
  }
  if (!["invite", "accept", "details"].includes(patch.action)) return;
  const target = privatePlans.find((p) => p.id === patch.planId);
  if (!place && !target) return;
  const { schedulePayload } = await import("./calendar-coordinator.server");
  const payload = await schedulePayload(
    db,
    user,
    conversation,
    patch as unknown as Record<string, unknown>,
    now,
  );
  const r = await db.rpc(
    "calendar_event_action" as never,
    {
      p_user: user,
      p_kind: kind,
      p_source: m.id,
      p_ordinal: 0,
      p_payload: payload,
      p_now: now.toISOString(),
    } as never,
  );
  if (r.error) throw new Error("Residential agreement was not saved; existing plans are preserved");
}
