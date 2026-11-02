import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { pregnancyProgress, pregnancyMilestones } from "./pregnancy-lifecycle";

/**
 * Idempotent lifecycle synchronization for a character's positive pregnancies.
 * Never changes the 12-hour resolution, secret roll, awareness or disclosure.
 * Use a privileged server-side client only; tables remain RLS default-deny.
 */
export async function syncPregnancyLifecycles(
  db: SupabaseClient<Database>, userId: string, characterKey: string, now = new Date(),
) {
  const eventsQuery = await db.from("family_pregnancy_events")
    .select("id,occurred_at,status").eq("user_id",userId)
    .eq("character_key",characterKey).eq("status","positive");
  if (eventsQuery.error) throw new Error("Pregnancy lifecycle source unavailable");
  const events = eventsQuery.data ?? [];
  let created = 0, scheduled = 0;
  for(const event of events) {
    const base = {
      pregnancy_event_id: event.id, user_id: userId, character_key: characterKey,
      started_at: event.occurred_at, choice: "undecided", status: "pregnant",
    };
    const insert = await db.from("family_pregnancy_lifecycles" as never)
      .upsert(base as never, {onConflict:"pregnancy_event_id", ignoreDuplicates:true});
    if(insert.error) throw new Error("Pregnancy lifecycle initialization failed");
    const lifecycleQuery = await db.from("family_pregnancy_lifecycles" as never)
      .select("*").eq("pregnancy_event_id",event.id).eq("user_id",userId)
      .eq("character_key",characterKey).maybeSingle();
    if(lifecycleQuery.error || !lifecycleQuery.data) throw new Error("Pregnancy lifecycle lookup failed");
    const lifecycle = lifecycleQuery.data as unknown as {id:string;started_at:string;status:string};
    if(lifecycle.status !== "pregnant") continue;
    const progress = pregnancyProgress(lifecycle.started_at,now);
    // Pre-schedule milestone records, without treating milestone dates as completed events.
    for(const milestone of pregnancyMilestones) {
      const ms = Date.parse(lifecycle.started_at) +
        ((milestone.gestationalDay-14)/(280-14))*60*86400000;
      const result = await db.from("family_pregnancy_milestones" as never)
        .upsert({lifecycle_id:lifecycle.id,key:milestone.key,due_at:new Date(ms).toISOString()} as never,
          {onConflict:"lifecycle_id,key",ignoreDuplicates:true});
      if(result.error) throw new Error("Pregnancy milestone scheduling failed");
      scheduled++;
    }
    if(progress.due) {
      // Term does NOT automatically equal childbirth; character and narrative events resolve birth.
    }
    created++;
  }
  return {active:created,milestonesChecked:scheduled};
}

/** Trusted character-authored actions only. This is intentionally not a client callable route. */
export async function recordCharacterPregnancyChoice(
  db: SupabaseClient<Database>,
  args: { userId:string; characterKey:string; lifecycleId:string;
    choice:"continue"|"abortion"|"adoption"; sourceMessageId:string; decidedAt:Date },
) {
  if(!args.sourceMessageId.trim()) throw new Error("Character decision source required");
  const query=await db.from("family_pregnancy_lifecycles" as never).select("*")
    .eq("id",args.lifecycleId).eq("user_id",args.userId)
    .eq("character_key",args.characterKey).maybeSingle();
  if(query.error || !query.data) throw new Error("Pregnancy lifecycle unavailable");
  const row=query.data as unknown as {choice:string;status:string};
  if(row.status!=="pregnant") return {changed:false,reason:"already-ended"};
  if(row.choice===args.choice) return {changed:false,reason:"already-recorded"};
  // A player text cannot call this function; caller must authenticate character-authored decision.
  const result=await db.from("family_pregnancy_lifecycles" as never)
    .update({choice:args.choice,choice_at:args.decidedAt.toISOString()} as never)
    .eq("id",args.lifecycleId).eq("user_id",args.userId)
    .eq("character_key",args.characterKey).eq("status","pregnant").eq("choice",row.choice);
  if(result.error) throw new Error("Pregnancy decision persistence failed");
  return {changed:true};
}

export async function schedulePregnancyAppointment(
  db: SupabaseClient<Database>,
  args:{userId:string;characterKey:string;lifecycleId:string;kind:string;at:Date;
    calendarEventId?:string|null},
) {
  if(!Number.isFinite(args.at.getTime()) || !args.kind.trim()) throw new Error("Invalid appointment");
  const query=await db.from("family_pregnancy_lifecycles" as never)
    .select("id,status").eq("id",args.lifecycleId).eq("user_id",args.userId)
    .eq("character_key",args.characterKey).maybeSingle();
  const lifecycle=query.data as unknown as {id:string;status:string}|null;
  if(query.error || !lifecycle || lifecycle.status!=="pregnant")
    throw new Error("Active pregnancy required for appointment");
  const result=await db.from("family_pregnancy_appointments" as never).insert({
    lifecycle_id:args.lifecycleId,kind:args.kind,scheduled_at:args.at.toISOString(),
    status:"scheduled",calendar_event_id:args.calendarEventId??null,created_by:"character",
  } as never);
  if(result.error) throw new Error("Could not schedule pregnancy appointment");
  return {created:true};
}
