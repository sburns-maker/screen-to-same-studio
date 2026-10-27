import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { commitmentEventSchema, type CommitmentEvent } from "./relationship-commitments";

type Client = SupabaseClient<Database>;

/** Until 0046 has been applied, this capability is deliberately unavailable. */
export async function commitmentReady(db: Client): Promise<boolean> {
  const { error } = await db.from("relationship_commitment_events" as never)
    .select("id", { head: true, count: "exact" }).limit(1);
  return !error;
}

export async function commitmentSnapshot(db: Client, userId: string, characterKey: string):
  Promise<{ available: boolean; events: CommitmentEvent[] }> {
  if (!(await commitmentReady(db))) return { available: false, events: [] };
  if (characterKey === "tess") {
    const synced = await db.rpc("relationship_sync_tess" as never, { p_user: userId } as never);
    if (synced.error) throw new Error("Relationship synchronization unavailable");
  }
  const { data, error } = await db.from("relationship_commitment_events" as never)
    .select("*")
    .eq("user_id", userId)
    .eq("character_key", characterKey)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Relationship history unavailable");
  const rows = (data ?? []) as Record<string, unknown>[];
  // The pilot must never expose a commitment belonging to another character,
  // even if upstream query construction or a future refactor changes.
  if (rows.some((row) => row["user_id"] !== userId || row["character_key"] !== characterKey))
    throw new Error("Relationship scope mismatch");
  return {
    available: true,
    events: rows.map((row) => commitmentEventSchema.parse({
      id: row["id"],
      userId: row["user_id"],
      characterKey: row["character_key"],
      kind: row["kind"],
      proposedBy: row["proposed_by"],
      status: row["status"],
      userResponse: row["user_response"],
      characterResponse: row["character_response"],
      occurredAt: row["occurred_at"],
      sourceId: row["source_id"],
      sourceType: row["source_type"],
      note: row["note"],
    })),
  };
}
