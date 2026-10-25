import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { activeCommitment, PENDING_CAP_HOURS, PREPARE_MINUTES, type Commitment, type CommitmentExperience, type CommitmentPlan } from "./calendar-commitment";
type Client = SupabaseClient<Database>;

/** Read-only, owner-scoped: never changes plans, scores or memories. */
async function load(db: Client, user: string, now: Date) {
  const from = new Date(now.getTime() - (PENDING_CAP_HOURS + 24) * 3_600_000).toISOString();
  const to = new Date(now.getTime() + PREPARE_MINUTES * 60_000).toISOString();
  const { data: plans, error } = await db
    .from("social_plans")
    .select("id,title,organizer,status,starts_at,ends_at,place_key")
    .eq("user_id", user)
    .in("status", ["accepted", "in_progress", "completed"])
    .gte("starts_at", from)
    .lte("starts_at", to)
    .limit(50);
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code)) return { plans: [], experiences: [] };
    throw new Error("Calendar commitments unavailable");
  }
  const ids = (plans ?? []).map((p) => p.id);
  if (!ids.length) return { plans: [] as CommitmentPlan[], experiences: [] as CommitmentExperience[] };
  const { data: experiences, error: exError } = await db
    .from("living_experiences")
    .select("*")
    .eq("user_id", user)
    .in("plan_id", ids);
  if (exError && !["42P01", "PGRST205"].includes(exError.code)) throw new Error("Outing records unavailable");
  return { plans: (plans ?? []) as CommitmentPlan[], experiences: (experiences ?? []) as CommitmentExperience[] };
}

export async function commitmentFor(db: Client, user: string, character: string, now: Date): Promise<Commitment | null> {
  const { plans, experiences } = await load(db, user, now);
  return activeCommitment(character, plans, experiences, now);
}

/** Characters who are physically committed to an outing right now. */
export async function committedCharacters(db: Client, user: string, now: Date): Promise<Set<string>> {
  const { plans, experiences } = await load(db, user, now);
  const keys = new Set(plans.map((p) => p.organizer));
  const out = new Set<string>();
  for (const k of keys) {
    const c = activeCommitment(k, plans, experiences, now);
    if (c && c.phase !== "after") out.add(k);
  }
  return out;
}
