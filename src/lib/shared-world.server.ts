import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { sharedRsvpDecision, scheduleAllows, type SharedPlan } from "./shared-world";
import { type CharacterKey } from "./characters";
type Client = SupabaseClient<Database>;
export async function sharedWorldAvailable(db: Client) {
  const { data, error } = await db.rpc("shared_world_status", {} as never);
  if (error && ["PGRST202", "42883"].includes(error.code)) return false;
  if (error) throw new Error("Shared world capability unavailable");
  return !!(data as { version?: number } | null)?.version;
}
export async function sharedCommand(
  db: Client,
  user: string,
  id: string,
  command: string,
  payload: Json,
  now: Date,
  version: number,
) {
  const { data, error } = await db.rpc("shared_world_command", {
    p_user_id: user,
    p_plan_id: id,
    p_command: command,
    p_payload: payload,
    p_now: now.toISOString(),
    p_expected_version: version,
  });
  if (error)
    throw new Error(
      error.message === "invitee schedule conflict"
        ? "shared_plan_schedule_conflict"
        : "Shared plan transition rejected; reload its state before retrying",
    );
  return data as unknown as SharedPlan;
}
/** No paid calls. Per-user transaction + expected version protects concurrent workers. */
export async function runSharedWorldTick(db: Client, user: string, now: Date) {
  if (!(await sharedWorldAvailable(db))) return { checked: 0, transitions: 0 };
  const interactive = await (await import("./interactive-world.server")).interactiveAvailable(db);
  let queue = db
    .from("social_plans")
    .select("*")
    .eq("user_id", user)
    .in("status", ["proposed", "active"]);
  if (interactive) queue = queue.eq("origin", "legacy");
  const { data: plans, error } = await queue.order("starts_at").limit(8);
  if (error) throw new Error("Shared plan queue unavailable");
  let transitions = 0;
  for (let plan of (plans ?? []).filter(
    (p) => p.origin !== "conversation" && p.starts_at && p.ends_at && p.place_key,
  ) as SharedPlan[]) {
    const { data: invites, error } = await db
      .from("social_rsvps")
      .select("*")
      .eq("user_id", user)
      .eq("plan_id", plan.id);
    if (error) throw new Error("Shared invitations unavailable");
    for (const invite of (invites ?? []).slice(0, 5)) {
      if (invite.response === "invited") {
        const decision = sharedRsvpDecision(
          plan,
          invite.character_key as CharacterKey,
          invite.channel,
          now,
        );
        try {
          plan = await sharedCommand(
            db,
            user,
            plan.id,
            "respond",
            { character: invite.character_key, ...decision },
            now,
            plan.version,
          );
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "shared_plan_schedule_conflict")
            throw error;
          plan = await sharedCommand(
            db,
            user,
            plan.id,
            "respond",
            {
              character: invite.character_key,
              response: "declined",
              reason: "schedule_or_travel_conflict",
            },
            now,
            plan.version,
          );
        }
        transitions++;
      } else if (
        invite.response === "accepted" &&
        plan.status === "proposed" &&
        !scheduleAllows(invite.character_key as CharacterKey, plan.starts_at, plan.ends_at)
      ) {
        plan = await sharedCommand(
          db,
          user,
          plan.id,
          "respond",
          {
            character: invite.character_key,
            response: "declined",
            reason: "schedule_or_travel_conflict",
          },
          now,
          plan.version,
        );
        transitions++;
      }
    }
    if (now.getTime() >= Date.parse(plan.starts_at)) {
      const result = await sharedCommand(db, user, plan.id, "advance", {}, now, plan.version);
      if (result.version !== plan.version) transitions++;
    }
  }
  return { checked: plans?.length ?? 0, transitions };
}
/** A character may see only their own presence/knowledge. No unrelated plan or chat injection. */
export async function sharedPlanContext(db: Client, user: string, character: string, now: Date) {
  const { data, error } = await db
    .from("social_presence")
    .select("*")
    .eq("user_id", user)
    .eq("character_key", character)
    .gt("until_at", now.toISOString())
    .maybeSingle();
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code)) return null;
    throw new Error("Shared presence unavailable");
  }
  if (!data) return (await import("./calendar-commitment.server")).commitmentFor(db, user, character, now);
  const { data: plan, error: planError } = await db
    .from("social_plans")
    .select("*")
    .eq("user_id", user)
    .eq("id", data.plan_id)
    .in("status", ["active", "in_progress"])
    .maybeSingle();
  if (planError) throw new Error("Shared plan context unavailable");
  return plan
    ? {
        activity: `at ${plan.place_key}`,
        availability: "limited" as const,
        detail: `Attending ${plan.title} at ${plan.place_key}. User attendance: ${plan.user_attendance}. Do not invent additional user actions.`,
        summary: `${plan.title} is currently happening at ${plan.place_key}. ${plan.user_attendance === "not_reported" ? "Do not assume the user is present." : `User attendance is ${plan.user_attendance}; do not invent additional actions.`}`,
      }
    : null;
}
