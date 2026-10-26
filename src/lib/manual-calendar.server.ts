import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { scheduleActionSchema } from "./calendar-contract";
import { schedulePayload } from "./calendar-coordinator.server";
import { easternInstant } from "./plan-edit";
type Client = SupabaseClient<Database>;
export async function manualCalendarReady(db: Client) {
  const r = await db.rpc("calendar_manual_status" as never, {} as never);
  if (r.error && ["42883", "PGRST202"].includes(r.error.code)) return false;
  if (r.error) throw new Error("Calendar control status unavailable");
  return r.data === 44;
}
export async function saveManualCalendar(
  db: Client,
  user: string,
  input: {
    id: string;
    conversationId: string;
    planId?: string | null;
    version?: number | null;
    plan: unknown;
    confirmed: boolean;
  },
  now = new Date(),
) {
  if (!(await manualCalendarReady(db)))
    throw new Error("Direct calendar saving requires reviewed migration 0044");
  await (await import("./interactive-world.server")).registerInteractivePlaces(db, user);
  const plan = scheduleActionSchema.parse(input.plan);
  if (plan.date && plan.time) easternInstant(plan.date, plan.time);
  const payload = await schedulePayload(
    db,
    user,
    input.conversationId,
    {
      ...plan,
      planId: input.planId ?? null,
      confirmed: input.confirmed,
    },
    now,
    input.confirmed,
  );
  const result = await db.rpc(
    "calendar_manual_action" as never,
    {
      p_user: user,
      p_id: input.id,
      p_conversation: input.conversationId,
      p_plan: input.planId ?? null,
      p_version: input.version ?? null,
      p_payload: payload,
      p_now: now.toISOString(),
    } as never,
  );
  if (result.error)
    throw new Error(
      "Calendar change was not saved. Reload to check the plan, conflicts or an active experience. Existing plans are preserved.",
    );
  return result.data as unknown as {
    id: string;
    status: string;
    replayed?: boolean;
    conversationId: string;
  };
}
