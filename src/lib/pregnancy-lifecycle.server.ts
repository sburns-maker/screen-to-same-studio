import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { pregnancyProgress, pregnancyMilestones, type PregnancyResolution } from "./pregnancy-lifecycle";

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
    calendarEventId?:string|null;sourceMessageId?:string},
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
    status:"proposed",calendar_event_id:args.calendarEventId??null,created_by:"character",
    source_message_id:args.sourceMessageId??null,
  } as never);
  if(result.error) throw new Error("Could not schedule pregnancy appointment");
  return {created:true};
}

/** Public-safe progress only for pregnancies already disclosed to the player.
 * No hidden pregnancy or secret decision is exposed to client views.
 */
export async function disclosedPregnancyProgress(
 db: SupabaseClient<Database>, userId:string, characterKey:string, now=new Date(),
) {
 const query=await db.from("family_pregnancy_events")
  .select("id,disclosed_at,status").eq("user_id",userId)
  .eq("character_key",characterKey).eq("status","positive").not("disclosed_at","is",null)
  .lte("disclosed_at",now.toISOString());
 if(query.error) throw new Error("Disclosed pregnancy lookup failed");
 const results: Array<{pregnancyEventId:string;gestationalWeek:number;trimester:number;
  dueAt:string;status:string}> = [];
 for(const event of query.data??[]) {
  const lifecycleQuery=await db.from("family_pregnancy_lifecycles" as never)
   .select("*").eq("pregnancy_event_id",event.id).eq("user_id",userId)
   .eq("character_key",characterKey).maybeSingle();
  if(lifecycleQuery.error) throw new Error("Pregnancy progress unavailable");
  if(!lifecycleQuery.data) continue;
  const life=lifecycleQuery.data as unknown as {started_at:string;status:string};
  const progress=pregnancyProgress(life.started_at,now);
  results.push({pregnancyEventId:event.id,gestationalWeek:progress.gestationalWeek,
   trimester:progress.trimester,dueAt:progress.dueAt,status:life.status});
 }
 return results;
}

/** Trusted character/medical resolution. Caller must validate the authoritative
 * in-world event before invoking this server-only function.
 * No delivery or pregnancy-loss result is determined by a mere elapsed timer.
 */
export async function resolveVerifiedPregnancyOutcome(
  db: SupabaseClient<Database>,
  args: {userId:string;characterKey:string;lifecycleId:string;
    outcome:PregnancyResolution;verifiedEventId:string;occurredAt:Date;
    childName?:string|null},
) {
  if (!args.verifiedEventId.trim() || !Number.isFinite(args.occurredAt.getTime()))
    throw new Error("Verified event and timestamp required");
  const result=await db.rpc("finalize_family_pregnancy" as never,{
    p_user_id:args.userId,p_character_key:args.characterKey,
    p_lifecycle_id:args.lifecycleId,p_outcome:args.outcome,
    p_source_id:args.verifiedEventId,p_occurred_at:args.occurredAt.toISOString(),
    p_child_name:args.childName??null,
  } as never);
  if(result.error) throw new Error("Atomic pregnancy outcome finalization failed");
  return {changed:result.data===true};

}

/** Reconcile only committed, visible character messages with an explicit structured
 * pregnancy action. This cannot infer actions from conversational keywords.
 */
export async function reconcileCharacterPregnancyActions(
 db:SupabaseClient<Database>,userId:string,characterKey:string,now=new Date(),
) {
 const {pregnancyCharacterActionSchema,validPregnancyCharacterAction}=await import("./pregnancy-character-actions");
 const {data:char,error:charError}=await db.from("characters").select("id").eq("key",characterKey).maybeSingle();
 if(charError||!char)return {processed:0};
 const {data:conv,error:convError}=await db.from("conversations").select("id").eq("user_id",userId).eq("character_id",char.id).maybeSingle();
 if(convError||!conv)return {processed:0};
 const {data:rows,error:messageError}=await db.from("messages")
  .select("id,body,metadata,visible_at,sender").eq("user_id",userId)
  .eq("conversation_id",conv.id).eq("sender",characterKey)
  .lte("visible_at",now.toISOString()).order("created_at",{ascending:false}).limit(100);
 if(messageError) throw new Error("Pregnancy message reconciliation unavailable");
 const {data:lifecycles,error:lifeError}=await db.from("family_pregnancy_lifecycles" as never)
  .select("id,status").eq("user_id",userId).eq("character_key",characterKey).eq("status","pregnant");
 if(lifeError) throw new Error("Pregnancy action lifecycle lookup failed");
 const eligible=(lifecycles??[] as unknown as Array<{id:string}>).map(row=>row.id);
 let processed=0;
 for(const message of [...(rows??[])].reverse()) {
  const md=message.metadata;
  const action=pregnancyCharacterActionSchema.safeParse(
    md && typeof md==="object"&&!Array.isArray(md)
     ? (md as Record<string,unknown>)["pregnancy_character_action"]:null);
  if(!action.success||!validPregnancyCharacterAction(action.data,message.body,eligible)||!action.data)continue;
  const value=action.data;
  if(value.kind==="decision") {
   await recordCharacterPregnancyChoice(db,{
    userId,characterKey,lifecycleId:value.lifecycleId,choice:value.choice,
    sourceMessageId:message.id,decidedAt:new Date(message.visible_at)});
   processed++;
  } else if(value.kind==="appointment") {
   // The medical appointment is recorded only; never claim a calendar booking
   // until the existing scheduling system supplies an actual calendar event id.
   await schedulePregnancyAppointment(db,{userId,characterKey,lifecycleId:value.lifecycleId,
     kind:value.appointmentKind,at:new Date(value.at),sourceMessageId:message.id});
   processed++;
  }
  // Labor and final outcomes need verified interactive experience/medical-event
  // provenance, not chat-only claims, so they are intentionally not reconciled here.
 }
 return {processed};
}
