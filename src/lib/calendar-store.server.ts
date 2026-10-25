import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CalendarPlan } from "./calendar-logic";
/** No silent 100-row cutoff: read canonical records in bounded PostgREST pages. */
export async function readCanonicalPlans(db: SupabaseClient<Database>, user: string) {
  const rows: CalendarPlan[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const r = await db
      .from("social_plans")
      .select("*")
      .eq("user_id", user)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 499);
    if (r.error) throw new Error("Canonical calendar unavailable");
    rows.push(...((r.data ?? []) as unknown as CalendarPlan[]));
    if ((r.data?.length ?? 0) < 500) return rows;
  }
  throw new Error(
    "Calendar history exceeds the safe page limit; narrow the history range before loading",
  );
}
