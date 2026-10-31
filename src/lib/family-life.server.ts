import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  createPendingPregnancyEvent, resolveHouseholdStatus, resolvePregnancyEvent,
  type HouseholdAction, type PregnancyEvent,
} from "./family-life";
import { householdActionSchema, pregnancyEventSchema } from "./family-life";
import { CHARACTERS, type CharacterKey } from "./characters";

type Client = SupabaseClient<Database>;
type DbRecord = Record<string, unknown>;
const table = (db: Client, name: "family_pregnancy_events" | "family_household_events") =>
  db.from(name as never);

/** Display model deliberately excludes the random outcome and probability. */
export type PublicPregnancy = {
  id: string; characterKey: string; encounterId: string; status: "pending" | "positive" | "negative";
  occurredAt: string; revealAt: string; disclosedAt: string | null;
};

function pregnancyFromRow(row: DbRecord): PregnancyEvent {
  return pregnancyEventSchema.parse({
    id: row.id, userId: row.user_id, characterKey: row.character_key,
    encounterId: row.encounter_id, adultEligible: row.adult_eligible,
    mutuallyAgreed: row.mutually_agreed, pregnancyPossible: row.pregnancy_possible,
    probability: row.probability, randomRoll: row.random_roll,
    occurredAt: row.occurred_at, revealAt: row.reveal_at,
    status: row.status, disclosedAt: row.disclosed_at,
  });
}
function publicPregnancy(event: PregnancyEvent, now: Date): PublicPregnancy {
  // The outcome is also withheld until the character has actually disclosed it.
  const revealed = resolvePregnancyEvent(event, now);
  return {
    id: event.id, characterKey: event.characterKey, encounterId: event.encounterId,
    status: event.disclosedAt && now.getTime() >= Date.parse(event.disclosedAt)
      ? revealed.status : "pending",
    occurredAt: event.occurredAt, revealAt: event.revealAt, disclosedAt: event.disclosedAt,
  };
}

/** Only authenticated server functions use this; never expose raw rows to clients. */
export async function familySnapshot(db: Client, userId: string, characterKey: string, now = new Date()) {
  if (!Object.prototype.hasOwnProperty.call(CHARACTERS, characterKey)) {
    throw new Error("Unknown contact");
  }
  const { commitmentSnapshot } = await import("./relationship-commitments.server");
  const commitments = await commitmentSnapshot(db, userId, characterKey);
  const { familyCommitmentStatus } = await import("./family-life");
  const commitment = commitments.available ? familyCommitmentStatus(commitments.events) : null;
  const [houses, pregnancies] = await Promise.all([
    table(db, "family_household_events").select("*").eq("user_id", userId)
      .eq("character_key", characterKey).order("occurred_at", { ascending: true }).limit(200),
    table(db, "family_pregnancy_events").select("*").eq("user_id", userId)
      .eq("character_key", characterKey).order("occurred_at", { ascending: false }).limit(100),
  ]);
  if (houses.error || pregnancies.error) return { available: false, household: "separate" as const, commitment, pregnancies: [] as PublicPregnancy[] };
  const home = (houses.data ?? []).map(row => householdActionSchema.parse({
    id: row.id, userId: row.user_id, characterKey: row.character_key,
    kind: row.kind, proposedBy: row.proposed_by, userResponse: row.user_response,
    characterResponse: row.character_response, occurredAt: row.occurred_at, sourceId: row.source_id,
  })) as HouseholdAction[];
  const events = (pregnancies.data ?? []).map(row => pregnancyFromRow(row as DbRecord));
  if (home.some(e => e.userId !== userId || e.characterKey !== characterKey) ||
      events.some(e => e.userId !== userId || e.characterKey !== characterKey)) {
    throw new Error("Family life scope mismatch");
  }
  return {
    available: true,
    household: resolveHouseholdStatus(home),
    commitment,
    pregnancies: events.map(e => publicPregnancy(e, now)),
  };
}

type VerifiedEncounter = {
  userId: string; characterKey: CharacterKey; encounterId: string;
  occurredAt: string; pregnancyPossible: boolean; mutuallyAgreed: boolean;
  /** Must come from trusted world-state verification, not user input or model prose. */
  adultEligible: boolean; probability: number;
};

/**
 * SERVER-ONLY ingress for future verified interactive-encounter integration.
 * Not exported through any client-callable server function.
 * Requires a verified, previously recorded encounter, and callers must
 * authenticate its ownership / adult context before invoking this function.
 */
export async function recordVerifiedPregnancyOpportunity(db: Client, encounter: VerifiedEncounter) {
  const contact = CHARACTERS[encounter.characterKey];
  if (!contact || contact.age < 18 || !encounter.adultEligible ||
      !encounter.mutuallyAgreed || !encounter.pregnancyPossible) {
    throw new Error("Encounter not eligible");
  }
  if (!Number.isFinite(encounter.probability) ||
      encounter.probability < 0 || encounter.probability > 1) {
    throw new Error("Invalid configured probability");
  }
  const existing = await table(db, "family_pregnancy_events").select("id")
    .eq("user_id", encounter.userId).eq("character_key", encounter.characterKey)
    .eq("encounter_id", encounter.encounterId).maybeSingle();
  if (existing.error) throw new Error("Pregnancy event lookup unavailable");
  if (existing.data) return { id: String(existing.data.id), created: false };
  const roll = randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  const event = createPendingPregnancyEvent({
    id: randomUUID(), ...encounter, randomRoll: roll,
  });
  const payload = {
    id: event.id, user_id: event.userId, character_key: event.characterKey,
    encounter_id: event.encounterId, adult_eligible: true, mutually_agreed: true,
    pregnancy_possible: true, probability: event.probability, random_roll: event.randomRoll,
    occurred_at: event.occurredAt, reveal_at: event.revealAt, status: "pending",
  };
  const inserted = await table(db, "family_pregnancy_events").insert(payload as never);
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const winner = await table(db, "family_pregnancy_events").select("id")
        .eq("user_id", encounter.userId).eq("character_key", encounter.characterKey)
        .eq("encounter_id", encounter.encounterId).single();
      if (!winner.error && winner.data) return { id: String(winner.data.id), created: false };
    }
    throw new Error("Could not persist pregnancy opportunity");
  }
  return { id: event.id, created: true };
}
