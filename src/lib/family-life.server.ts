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

/** Display model deliberately excludes the random outcome and probability. */
export type PublicPregnancy = {
  id: string; characterKey: string; encounterId: string; status: "pending" | "positive" | "negative";
  occurredAt: string; revealAt: string; disclosedAt: string | null;
};

function pregnancyFromRow(row: DbRecord): PregnancyEvent {
  return pregnancyEventSchema.parse({
    id: row["id"], userId: row["user_id"], characterKey: row["character_key"],
    encounterId: row["encounter_id"], adultEligible: row["adult_eligible"],
    mutuallyAgreed: row["mutually_agreed"], pregnancyPossible: row["pregnancy_possible"],
    probability: row["probability"], randomRoll: row["random_roll"],
    occurredAt: row["occurred_at"], revealAt: row["reveal_at"],
    status: row["status"], disclosedAt: row["disclosed_at"],
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

/**
 * Settle due pregnancy outcomes exactly once. This changes only the server-side
 * status; the character must independently disclose through an authenticated,
 * committed conversation action before the user-facing snapshot reveals it.
 */
export async function settleDuePregnancyEvents(db: Client, userId: string, characterKey: string, now = new Date()) {
  if (!Object.prototype.hasOwnProperty.call(CHARACTERS, characterKey)) throw new Error("Unknown contact");
  const { data, error } = await db.from("family_pregnancy_events")
    .select("*").eq("user_id", userId).eq("character_key", characterKey)
    .eq("status", "pending").lte("reveal_at", now.toISOString()).limit(100);
  if (error) throw new Error("Pregnancy event settlement unavailable");
  let settled = 0;
  for (const row of data ?? []) {
    const event = pregnancyFromRow(row as DbRecord);
    const result = resolvePregnancyEvent(event, now);
    if (result.status === "pending") continue;
    const update = await db.from("family_pregnancy_events")
      .update({ status: result.status } as never).eq("id", event.id)
      .eq("user_id", userId).eq("character_key", characterKey)
      .eq("status", "pending");
    if (update.error) throw new Error("Pregnancy event settlement failed");
    settled++;
  }
  return { settled };
}

/** Server-only character knowledge: never return probability or secret roll. */
export async function dueUndisclosedPregnancyResults(db:Client,userId:string,characterKey:string,now=new Date()) {
 await settleDuePregnancyEvents(db,userId,characterKey,now);
 const {data,error}=await db.from("family_pregnancy_events").select("id,status,reveal_at")
   .eq("user_id",userId).eq("character_key",characterKey).is("disclosed_at",null)
   .lte("reveal_at",now.toISOString()).in("status",["positive","negative"]).limit(10);
 if(error)throw new Error("Private family result unavailable");
 return (data??[]).map(row=>({id:row.id,status:row.status as "positive"|"negative"}));
}
/** Reconcile an actual visible character-authored pregnancy disclosure. The
 * player never receives the private result before the message is visible.
 */
export async function reconcileVisiblePregnancyDisclosures(db:Client,userId:string,characterKey:string,now=new Date()) {
 const pending=await dueUndisclosedPregnancyResults(db,userId,characterKey,now);
 if(!pending.length)return {disclosed:0};
 const {validPregnancyDisclosure,pregnancyDisclosureActionSchema}=await import("./family-pregnancy-disclosure");
 const {data:character,error:characterError}=await db.from("characters").select("id").eq("key",characterKey).single();
 if(characterError || !character)return {disclosed:0};
 const {data:conversation,error:conversationError}=await db.from("conversations")
   .select("id").eq("user_id",userId).eq("character_id",character.id).maybeSingle();
 if(conversationError || !conversation)return {disclosed:0};
 const {data:messages,error}=await db.from("messages").select("body,metadata,visible_at")
   .eq("user_id",userId).eq("conversation_id",conversation.id)
   .eq("sender","tess").lte("visible_at",now.toISOString())
   .order("created_at",{ascending:false}).limit(100);
 if(error)throw new Error("Pregnancy disclosure messages unavailable");
 let disclosed=0;
 for(const result of pending) {
  const matched=(messages??[]).find(m=>{
   const md=m.metadata;
   const parsed=pregnancyDisclosureActionSchema.safeParse(
     md && typeof md==="object" && !Array.isArray(md)
      ? (md as Record<string,unknown>)["pregnancy_disclosure_action"]:null);
   return parsed.success && validPregnancyDisclosure(parsed.data,m.body,[result.id],result.status);
  });
  if(!matched)continue;
  const {error:updateError}=await db.from("family_pregnancy_events")
    .update({disclosed_at:matched.visible_at}).eq("id",result.id)
    .eq("user_id",userId).eq("character_key",characterKey)
    .is("disclosed_at",null).lte("reveal_at",now.toISOString());
  if(updateError)throw new Error("Character disclosure could not be recorded");
  disclosed++;
 }
 return {disclosed};
}

/** Only authenticated server functions use this; never expose raw rows to clients. */
export async function familySnapshot(db: Client, userId: string, characterKey: string, now = new Date()) {
  if (!Object.prototype.hasOwnProperty.call(CHARACTERS, characterKey)) {
    throw new Error("Unknown contact");
  }
  try { const {reconcileVisibleWeddingDecisions}=await import("./family-wedding.server"); await reconcileVisibleWeddingDecisions(db,userId,characterKey,now); }
  catch(error){ console.warn("[family-wedding] pending response reconciliation unavailable",error); }
  try { const {reconcileCompletedWeddingCeremonies}=await import("./family-wedding.server"); await reconcileCompletedWeddingCeremonies(db,userId,characterKey,now); }
  catch(error){ console.warn("[family-wedding] ceremony reconciliation deferred",error); }
  const { commitmentSnapshot } = await import("./relationship-commitments.server");
  const commitments = await commitmentSnapshot(db, userId, characterKey);
  const { familyCommitmentStatus } = await import("./family-life");
  const commitment = commitments.available ? familyCommitmentStatus(commitments.events) : null;
  await settleDuePregnancyEvents(db, userId, characterKey, now);
  try{await reconcileVisiblePregnancyDisclosures(db,userId,characterKey,now);}
  catch(error){console.warn("[family-life] disclosure reconciliation deferred",error);}
  const [houses, pregnancies] = await Promise.all([
    db.from("family_household_events").select("*").eq("user_id", userId)
      .eq("character_key", characterKey).order("occurred_at", { ascending: true }).limit(200),
    db.from("family_pregnancy_events").select("*").eq("user_id", userId)
      .eq("character_key", characterKey).order("occurred_at", { ascending: false }).limit(100),
  ]);
  if (houses.error || pregnancies.error) return { available: false, household: "separate" as const, commitment, pregnancies: [] as PublicPregnancy[] };
  const home = (houses.data ?? []).map(row => householdActionSchema.parse({
    id: row["id"], userId: row["user_id"], characterKey: row["character_key"],
    kind: row.kind, proposedBy: row.proposed_by, userResponse: row.user_response,
    characterResponse: row.character_response, occurredAt: row["occurred_at"], sourceId: row.source_id,
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
  const existing = await db.from("family_pregnancy_events").select("id")
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
  const inserted = await db.from("family_pregnancy_events").insert(payload as never);
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const winner = await db.from("family_pregnancy_events").select("id")
        .eq("user_id", encounter.userId).eq("character_key", encounter.characterKey)
        .eq("encounter_id", encounter.encounterId).single();
      if (!winner.error && winner.data) return { id: String(winner.data.id), created: false };
    }
    throw new Error("Could not persist pregnancy opportunity");
  }
  return { id: event.id, created: true };
}
