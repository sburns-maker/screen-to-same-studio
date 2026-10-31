import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { housingSnapshot } from "./housing.server";
import {
  homeInvitationActivity,
  homeInvitationRefused,
  sameHomeActivity,
  type CalendarResidence,
} from "./calendar-residences";
import { resolveDate, resolveTime, easternDate } from "./calendar-logic";
import { readCanonicalPlans } from "./calendar-store.server";
type Client = SupabaseClient<Database>;
export async function savedHomeInvitation(
  db: Client,
  user: string,
  conversation: string,
  place: string,
  now = new Date(),
) {
  const owner = await db
    .from("conversations")
    .select("character:characters(key)")
    .eq("user_id", user)
    .eq("id", conversation)
    .maybeSingle();
  const key = (owner.data?.character as { key?: string } | null)?.key;
  if (owner.error || !key) throw new Error("Owned home invitation required");
  const home = (await housingSnapshot(db, user)).homes.find(
    (h) => h.key === place && h.primaryFor.includes(key),
  );
  if (!home) return null;
  const membership = await db
    .from("housing_memberships" as never)
    .select("started_at")
    .eq("user_id", user)
    .eq("person_key", key)
    .eq("residence_id", home.id)
    .eq("kind", "primary")
    .is("ended_at", null)
    .maybeSingle();
  if (membership.error) throw new Error("Home invitation history unavailable");
  const started = (membership.data as { started_at: string } | null)?.started_at;
  if (!started) return null;
  const messages = await db
    .from("messages")
    .select("id,body,created_at,visible_at")
    .eq("user_id", user)
    .eq("conversation_id", conversation)
    .eq("sender", "tess")
    .gte(
      "created_at",
      // The residence may have been added to the calendar after the characters
      // agreed to visit. Use recent visible invitation evidence regardless of when
      // the housing record was registered; current residency is checked above.
      new Date(now.getTime() - 7 * 86400000).toISOString(),
    )
    .lte("visible_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(80);
  if (messages.error) throw new Error("Home invitation history unavailable");
  const plans = await readCanonicalPlans(db, user);
  for (const m of messages.data ?? []) {
    if (homeInvitationRefused(m.body)) return null;
    const activity = homeInvitationActivity(m.body);
    if (!activity) continue;
    const date = resolveDate(m.body, new Date(m.created_at));
    if (date && date < easternDate(now)) return null;
    const recorded = plans.find(
      (p) => p.conversation_id === conversation && p.source_message_id === m.id,
    );
    if (recorded && ["cancelled", "declined", "completed", "missed"].includes(recorded.status))
      return null;
    return { messageId: m.id, ...activity, date, time: resolveTime(m.body, true), character: key };
  }
  return null;
}
/** Labels only, from the already server-redacted housing directory. No permissions are granted by listing. */
export async function calendarResidences(
  db: Client,
  user: string,
  now = new Date(),
): Promise<CalendarResidence[]> {
  const snapshot = await housingSnapshot(db, user);
  if (!snapshot.homes.length) return [];
  const contacts = await db
    .from("conversations")
    .select("id,character:characters(key)")
    .eq("user_id", user);
  if (contacts.error) throw new Error("Home calendar contacts unavailable");
  return Promise.all(
    snapshot.homes.map(async (home) => {
      const characters = home.primaryFor.includes("user") ? [] : home.primaryFor;
      // Homes are universally selectable; invitations are no longer required.
      const canPlan = true;
      return {
        key: home.key,
        label: home.label,
        canPlan,
        existingPermission: true,
        characters,
      };
    }),
  );
}
/** Called only during the player's explicit calendar save. Read-time listing never creates a plan. */
export async function prepareResidentialManualSave(
  db: Client,
  user: string,
  input: {
    id: string;
    conversationId: string;
    planId?: string | null;
    version?: number | null;
    confirmed: boolean;
  },
  plan: {
    place?: string | null;
    title?: string | null;
    date?: string | null;
    time?: string | null;
  },
  now: Date,
) {
  const planId = input.planId ?? null,
    version = input.version ?? null;
  if (!/^(?:home:|residence:)/.test(plan.place ?? "")) return { planId, version };
  const replay = await db
    .from("calendar_manual_actions" as never)
    .select("plan_id,plan_version")
    .eq("user_id", user)
    .eq("id", input.id)
    .maybeSingle();
  if (replay.error) throw new Error("Calendar save history unavailable");
  if (replay.data) {
    const old = replay.data as { plan_id: string | null; plan_version: number | null };
    return { planId: old.plan_id, version: old.plan_version };
  }
  if (planId) return { planId, version };
  const homes = (await housingSnapshot(db, user)).homes;
  const home = homes.find((h) => h.key === plan.place);
  if (!home) throw new Error("Unknown private calendar location");
  const invitation = await savedHomeInvitation(db, user, input.conversationId, home.key, now);
  if (!invitation) return { planId, version };
  if (!sameHomeActivity(plan.title ?? "", invitation.title)) return { planId, version };
  if (!input.confirmed) throw new Error("Confirm that you both agreed to this home visit");
  if (
    (invitation.date && invitation.date !== plan.date) ||
    (invitation.time && invitation.time !== plan.time)
  )
    return { planId, version };
  const existing = (await readCanonicalPlans(db, user)).find(
    (p) =>
      p.conversation_id === input.conversationId &&
      p.source_message_id === invitation.messageId &&
      p.place_key === home.key,
  );
  if (existing) {
    if (["completed", "cancelled", "declined", "missed", "in_progress"].includes(existing.status))
      throw new Error("Open the existing home plan to review it");
    return { planId: existing.id, version: existing.version };
  }
  const payload = await (
    await import("./calendar-coordinator.server")
  ).schedulePayload(
    db,
    user,
    input.conversationId,
    { action: "invite", place: home.key, title: invitation.title, category: invitation.category },
    now,
  );
  const applied = await db.rpc(
    "calendar_event_action" as never,
    {
      p_user: user,
      p_kind: "message",
      p_source: invitation.messageId,
      p_ordinal: 0,
      p_payload: payload,
      p_now: now.toISOString(),
    } as never,
  );
  if (applied.error) throw new Error("The saved home invitation could not be registered");
  const id = (applied.data as { id?: string } | null)?.id;
  const created = (await readCanonicalPlans(db, user)).find(
    (p) =>
      p.id === id &&
      p.conversation_id === input.conversationId &&
      p.place_key === home.key &&
      !["completed", "cancelled", "declined", "missed", "in_progress"].includes(p.status),
  );
  if (!created) throw new Error("The invitation was already processed; review its existing plan");
  return { planId: created.id, version: created.version };
}
