import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { callHistoryLines } from "./call-history-context";
/** Read only, bounded, owner + conversation + character scoped. Never creates SMS or memories. */
export async function recentCallContext(
  db: SupabaseClient<Database>,
  user: string,
  conversation: string,
  character: string,
  now: Date,
): Promise<string[]> {
  try {
    const r = await db
      .from("phone_calls")
      .select("direction,state,offered_at,answered_at,ended_at,ring_until,reason")
      .eq("user_id", user)
      .eq("conversation_id", conversation)
      .eq("character_key", character)
      .gte("offered_at", new Date(now.getTime() - 7 * 86400000).toISOString())
      .lte("offered_at", now.toISOString())
      .order("offered_at", { ascending: false })
      .limit(16);
    if (r.error) throw new Error("unavailable");
    return callHistoryLines(r.data ?? [], now);
  } catch {
    return [
      "Recent call history is unavailable for this turn. Do not assert that you did not call or that no call occurred; no call outcome or topic can be inferred from this missing context.",
    ];
  }
}
