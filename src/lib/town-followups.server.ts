import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { expansionAvailable } from "./visual-profiles.server";
import { TOWN_NPCS, npcPresent } from "./town";
import { reserveWorldAi } from "./world-runtime.server";
import { encounterTurn } from "./town.server";
/** Optional, at most one grounded follow-up per selected user/tick; never submits an uncertain action twice. */
export async function runTownFollowups(
  db: SupabaseClient<Database>,
  user: string,
  now: Date,
  canCall: boolean,
) {
  if (process.env["ENABLE_NPC_FOLLOWUPS"] !== "true" || !(await expansionAvailable(db)))
    return { calls: 0, sent: 0 };
  const expiry = await db
    .from("town_intentions")
    .update({ status: "expired" })
    .eq("user_id", user)
    .eq("status", "pending")
    .lte("expires_at", now.toISOString());
  if (expiry.error) throw new Error("NPC intention expiry unavailable");
  if (!canCall) return { calls: 0, sent: 0 };
  const realtime = await db
    .from("conversations")
    .select("id")
    .eq("user_id", user)
    .eq("real_time_mode", true)
    .limit(1);
  if (realtime.error) throw new Error("World time mode unavailable");
  if (!realtime.data?.length) return { calls: 0, sent: 0 };
  const due = await db
    .from("town_intentions")
    .select("*")
    .eq("user_id", user)
    .eq("status", "pending")
    .lte("due_at", now.toISOString())
    .gt("expires_at", now.toISOString())
    .order("due_at")
    .limit(5);
  if (due.error) throw new Error("NPC follow-up queue unavailable");
  for (const intention of due.data ?? []) {
    const npc = TOWN_NPCS.find((n) => n.key === intention.npc_key);
    if (!npc || !npcPresent(npc, now)) continue;
    const c = await db
      .from("town_connections")
      .select("*")
      .eq("user_id", user)
      .eq("npc_key", npc.key)
      .maybeSingle();
    if (c.error) throw new Error("NPC contact preferences unavailable");
    if (
      !c.data?.contact ||
      !c.data.followups_enabled ||
      (c.data.last_followup_at && now.getTime() - Date.parse(c.data.last_followup_at) < 86400000)
    )
      continue;
    const [recent, busy] = await Promise.all([
      db
        .from("town_messages")
        .select("created_at")
        .eq("user_id", user)
        .eq("npc_key", npc.key)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("town_actions")
        .select("id")
        .eq("user_id", user)
        .eq("status", "reserved")
        .gte("created_at", new Date(now.getTime() - 120000).toISOString())
        .limit(1),
    ]);
    if (recent.error || busy.error) throw new Error("NPC conversation pacing unavailable");
    if (
      busy.data?.length ||
      (recent.data && now.getTime() - Date.parse(recent.data.created_at) < 30 * 60000)
    )
      continue;
    const existing = await db
      .from("town_actions")
      .select("*")
      .eq("user_id", user)
      .eq("id", intention.id)
      .maybeSingle();
    if (existing.error) throw new Error("NPC action status unavailable");
    if (existing.data) {
      await db
        .from("town_intentions")
        .update({ status: existing.data.status === "completed" ? "completed" : "failed" })
        .eq("user_id", user)
        .eq("id", intention.id);
      continue;
    }
    if (!(await reserveWorldAi(db, user))) return { calls: 0, sent: 0 };
    let status = "failed",
      sent = 0;
    try {
      const result = await encounterTurn(
        db,
        user,
        intention.id,
        npc.key,
        `Follow through only if you still want to: ${intention.summary}. Your earlier promise: ${intention.source_quote}. Do not invent user actions.`,
        "autonomous",
        now,
      );
      status =
        result.status === "completed"
          ? "completed"
          : result.status === "declined"
            ? "declined"
            : "failed";
      sent = status === "completed" ? 1 : 0;
    } catch {
      status = "failed";
    }
    const r = await db
      .from("town_intentions")
      .update({ status })
      .eq("user_id", user)
      .eq("id", intention.id);
    if (r.error) throw new Error("NPC outcome unavailable");
    return { calls: 1, sent };
  }
  return { calls: 0, sent: 0 };
}
