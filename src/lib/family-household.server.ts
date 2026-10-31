import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { householdActionSchema } from "./family-life";

type Db = SupabaseClient<Database>;

/** Player proposes; character decision remains a separate trusted operation. */
export async function proposeHousehold(db: Db, userId: string, characterKey: string, requestId: string, kind: "move_in" | "move_out" | "share_home" | "separate_home") {
  const table = db.from("family_household_events" as never);
  const existing = await table.select("*").eq("user_id", userId).eq("character_key", characterKey)
    .eq("source_id", requestId).eq("kind", kind).maybeSingle();
  if (existing.error) throw new Error("Household request unavailable");
  if (existing.data) return String(existing.data.id);
  const inserted = await table.insert({
    id: randomUUID(), user_id: userId, character_key: characterKey, source_id: requestId,
    kind, proposed_by: "user", user_response: "accepted", character_response: "pending",
  } as never).select("id").single();
  if (inserted.error?.code === "23505") {
    const winner = await table.select("id").eq("user_id", userId).eq("character_key", characterKey)
      .eq("source_id", requestId).eq("kind", kind).single();
    if (!winner.error && winner.data) return String(winner.data.id);
  }
  if (inserted.error || !inserted.data) throw new Error("Household proposal not saved");
  return String(inserted.data.id);
}

/** Player answers a character-authored pending proposal; cannot choose for the character. */
export async function respondToHousehold(db: Db, userId: string, characterKey: string, eventId: string, accept: boolean) {
  const table = db.from("family_household_events" as never);
  const found = await table.select("*").eq("id", eventId).eq("user_id", userId)
    .eq("character_key", characterKey).single();
  if (found.error || !found.data) throw new Error("Household proposal unavailable");
  const event = householdActionSchema.parse({
    id: found.data.id, userId: found.data.user_id, characterKey: found.data.character_key,
    kind: found.data.kind, proposedBy: found.data.proposed_by,
    userResponse: found.data.user_response, characterResponse: found.data.character_response,
    occurredAt: found.data.occurred_at, sourceId: found.data.source_id,
  });
  const desired = accept ? "accepted" : "declined";
  if (event.userResponse === desired) return event.id;
  if (event.proposedBy !== "character" || event.characterResponse !== "accepted" ||
      event.userResponse !== "pending") throw new Error("Household decision is not pending");
  const updated = await table.update({ user_response: desired } as never)
    .eq("id", event.id).eq("user_id", userId).eq("character_key", characterKey)
    .eq("user_response", "pending").select("id").maybeSingle();
  if (updated.error || !updated.data) throw new Error("Household decision changed or failed");
  return String(updated.data.id);
}
