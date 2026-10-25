import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { easternInstant, planEditSchema } from "./plan-edit";
import { schedulePayload } from "./calendar-coordinator.server";
export async function savePlanEdit(
  db: SupabaseClient<Database>,
  user: string,
  input: unknown,
  now = new Date(),
) {
  const data = planEditSchema.parse(input);
  easternInstant(data.date, data.time);
  const cur = await db
    .from("social_plans")
    .select("conversation_id")
    .eq("user_id", user)
    .eq("id", data.planId)
    .maybeSingle();
  if (cur.error || !cur.data?.conversation_id) throw new Error("Owned conversation plan required");
  const payload = await schedulePayload(
    db,
    user,
    cur.data.conversation_id,
    {
      action: "details",
      planId: data.planId,
      title: data.title,
      date: data.date,
      time: data.time,
      durationMinutes: data.durationMinutes,
      place: data.place,
      confirmed: data.confirmed,
    },
    now,
  );
  const result = await db.rpc(
    "calendar_edit_plan" as never,
    {
      p_user: user,
      p_plan: data.planId,
      p_action: data.id,
      p_version: data.version,
      p_payload: payload,
      p_now: now.toISOString(),
    } as never,
  );
  if (result.error) {
    if (["42883", "PGRST202"].includes(result.error.code))
      throw new Error("Safe plan editing requires reviewed migration 0040");
    throw new Error(
      "Plan edit could not be confirmed. Reload to check changes, conflicts or an active experience; your existing plan is preserved.",
    );
  }
  return result.data as unknown as {
    id: string;
    status: string;
    conversationId: string;
    replayed?: boolean;
  };
}
