import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Api18Journal } from "./api18-image.server";
import { api18Configuration, getApi18Job } from "./api18-image.server";
type Client = SupabaseClient<Database>;
export function api18Journal(
  db: Client,
  user: string,
  conversation: string,
  character: string,
  action: string,
): Api18Journal {
  return {
    async claim(hash) {
      const c = api18Configuration();
      const r = await db.rpc(
        "api18_job_reserve" as never,
        {
          p_user: user,
          p_action: action,
          p_conversation: conversation,
          p_character: character,
          p_hash: hash,
          p_cents: c.jobCents,
          p_daily: c.dailyCents,
          p_monthly: c.monthlyCents,
        } as never,
      );
      if (r.error) throw new Error("api18_budget_or_action_unavailable");
      const data = r.data as unknown as {
        fresh: boolean;
        record: { status: string; job_id: string | null };
      };
      if (typeof data?.fresh !== "boolean" || !data.record)
        throw new Error("api18_reservation_invalid");
      return data;
    },
    async record(job) {
      const r = await db.rpc(
        "api18_job_update" as never,
        {
          p_user: user,
          p_action: action,
          p_job: job.id,
          p_status: job.status,
          p_cost: job.cost,
          p_failure: job.failure,
        } as never,
      );
      if (r.error) throw new Error("api18_ledger_update_failed");
    },
  };
}
export async function api18JobHistory(db: Client, user: string, character: string) {
  const r = await db
    .from("api18_jobs" as never)
    .select("action_id,status,job_id,cost_usd,refund_expected,failure_code,created_at,updated_at")
    .eq("user_id", user)
    .eq("character_key", character)
    .order("created_at", { ascending: false })
    .limit(5);
  if (r.error && ["42P01", "PGRST205"].includes(r.error.code)) return [];
  if (r.error) throw new Error("Api18 job history unavailable");
  const rows = r.data as unknown as {
    action_id: string;
    status: string;
    job_id: string | null;
    cost_usd: number | string | null;
    refund_expected: boolean;
    failure_code: string | null;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((row) => ({
    ...row,
    cost_usd: row.cost_usd === null ? null : Number(row.cost_usd),
  }));
}
/** Explicit status refresh: GET only; never reserves, regenerates, sends messages or revives failed chat actions. */
export async function refreshApi18Job(db: Client, user: string, action: string) {
  const r = await db
    .from("api18_jobs" as never)
    .select("*")
    .eq("user_id", user)
    .eq("action_id", action)
    .maybeSingle();
  const row = r.data as unknown as {
    job_id: string | null;
    conversation_id: string;
    character_key: string;
  };
  if (r.error || !row?.job_id) throw new Error("Owned provider job with a known ID required");
  const key = process.env["API18_KEY"];
  if (!key) throw new Error("Api18 server secret missing");
  const job = await getApi18Job(row.job_id, key);
  await api18Journal(db, user, row.conversation_id, row.character_key, action).record({
    id: job.id,
    status: job.status,
    cost: job.cost_usd ?? null,
    failure: job.status === "failed" ? "api18_generation_failed" : null,
  });
  return { status: job.status, costUsd: job.cost_usd ?? null };
}
