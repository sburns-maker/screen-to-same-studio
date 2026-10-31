import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CHARACTERS } from "./characters";
import { weddingPlanSchema, mayPlanWedding, type WeddingPlan } from "./family-life";
import { commitmentSnapshot } from "./relationship-commitments.server";
import { weddingPlanActionSchema, validateWeddingAction } from "./family-wedding-actions";
type Db = SupabaseClient<Database>;
const table = (db:Db)=>db.from("family_wedding_plans");

function parseWedding(row:Record<string,unknown>):WeddingPlan {
 return weddingPlanSchema.parse({
  id:row["id"],userId:row["user_id"],characterKey:row["character_key"],
  calendarEventId:row["calendar_event_id"],startsAt:row["starts_at"],venue:row["venue"],
  userResponse:row["user_response"],characterResponse:row["character_response"],
  ceremonyCompletedAt:row["ceremony_completed_at"],
 });
}
async function eligible(db:Db,userId:string,characterKey:string) {
 const character=CHARACTERS[characterKey as keyof typeof CHARACTERS];
 if(!character || character.age<18 || !character.romanticCapable) throw new Error("Adult romantic contact required");
 const snapshot=await commitmentSnapshot(db,userId,characterKey);
 if(!snapshot.available || !mayPlanWedding(snapshot.events)) throw new Error("Mutual engagement must be recorded first");
}
export async function listWeddingPlans(db:Db,userId:string,characterKey:string) {
 const {data,error}=await table(db).select("*").eq("user_id",userId).eq("character_key",characterKey)
  .order("starts_at",{ascending:false}).limit(30);
 if(error)throw new Error("Wedding plan history unavailable");
 return (data??[]).map(row=>parseWedding(row as Record<string,unknown>));
}
/** The player may invite an engaged character to discuss a ceremony.
 * Never sets the character response or marks a ceremony complete. */
export async function proposeWeddingPlan(db:Db,input:{
 userId:string;characterKey:string;requestId:string;startsAt:string;venue:string;
}) {
 await eligible(db,input.userId,input.characterKey);
 const start=new Date(input.startsAt);
 if(!Number.isFinite(start.getTime()) || start.getTime()<Date.now()) throw new Error("Choose a future ceremony date");
 const venue=input.venue.trim();
 if(!venue || venue.length>200)throw new Error("A valid venue is required");
 const existing=await table(db).select("*").eq("user_id",input.userId)
  .eq("character_key",input.characterKey).eq("request_id",input.requestId).maybeSingle();
 if(existing.error)throw new Error("Wedding plan lookup unavailable");
 if(existing.data) return parseWedding(existing.data as Record<string,unknown>);
 const {data,error}=await table(db).insert({
  id:randomUUID(),user_id:input.userId,character_key:input.characterKey,
  request_id:input.requestId,starts_at:start.toISOString(),venue,
  user_response:"accepted",character_response:"pending",
 } as never).select("*").single();
 if(error?.code==="23505") {
  const race=await table(db).select("*").eq("user_id",input.userId)
   .eq("character_key",input.characterKey).eq("request_id",input.requestId).single();
  if(!race.error && race.data)return parseWedding(race.data as Record<string,unknown>);
 }
 if(error || !data)throw new Error("Wedding plan could not be saved");
 return parseWedding(data as Record<string,unknown>);
}
/**
 * Trusted character wedding-plan decision. An actual, visible message from
 * this same conversation is required; a source ID supplied by model prose or
 * the player is never sufficient. The caller must invoke this only after
 * extracting a genuine unambiguous character decision.
 */
export async function recordCharacterWeddingDecision(db:Db,input:{
 userId:string;characterKey:string;planId:string;accepted:boolean;
 verifiedSourceId:string;
}) {
 const {data:plan,error:planError}=await table(db).select("*")
  .eq("id",input.planId).eq("user_id",input.userId)
  .eq("character_key",input.characterKey).maybeSingle();
 if(planError || !plan) throw new Error("Wedding proposal unavailable");
 if(plan.character_response!=="pending")throw new Error("Wedding proposal already resolved");
 const {data:conversation,error:conversationError}=await db.from("conversations")
  .select("id,character:characters(key)").eq("user_id",input.userId)
  .eq("character_id", await characterDatabaseId(db,input.characterKey)).maybeSingle();
 if(conversationError || !conversation)throw new Error("Character conversation unavailable");
 const {data:source,error:sourceError}=await db.from("messages").select("id,sender,visible_at,created_at,body,metadata")
  .eq("id",input.verifiedSourceId).eq("conversation_id",conversation.id)
  .eq("user_id",input.userId).eq("sender","tess").maybeSingle();
 const parsed = weddingPlanActionSchema.safeParse((source?.metadata as Record<string,unknown>|null)?.["wedding_plan_action"]);
 if(sourceError || !source || Date.parse(source.visible_at)>Date.now() ||
    Date.parse(source.created_at)<Date.parse(plan.created_at) || !parsed.success ||
    !validateWeddingAction(parsed.data,source.body,[input.planId]) ||
    parsed.data?.action !== (input.accepted ? "accept" : "decline"))
   throw new Error("Wedding response must originate from a visible, later character message");
 const {data,error}=await table(db).update({character_response:input.accepted?"accepted":"declined"})
  .eq("id",input.planId).eq("user_id",input.userId).eq("character_key",input.characterKey)
  .eq("character_response","pending").select("*").maybeSingle();
 if(error || !data)throw new Error("Wedding decision changed or already resolved");
 return parseWedding(data as Record<string,unknown>);
}
async function characterDatabaseId(db:Db,key:string) {
 const {data,error}=await db.from("characters").select("id").eq("key",key).single();
 if(error || !data)throw new Error("Unknown character");
 return data.id;
}

/** Reconcile actual visible, structured character replies against their own
 * pending wedding plans. Never infer agreement from message sentiment or jokes.
 */
export async function reconcileVisibleWeddingDecisions(
 db:Db,userId:string,characterKey:string,now=new Date(),
) {
 const plans=(await listWeddingPlans(db,userId,characterKey)).filter(p=>p.characterResponse==="pending");
 if(!plans.length)return {accepted:0,declined:0};
 const cid=await characterDatabaseId(db,characterKey);
 const {data:conversation,error:conversationError}=await db.from("conversations")
  .select("id").eq("user_id",userId).eq("character_id",cid).maybeSingle();
 if(conversationError || !conversation)return {accepted:0,declined:0};
 const {data:messages,error}=await db.from("messages").select("id,body,metadata,created_at")
  .eq("user_id",userId).eq("conversation_id",conversation.id).eq("sender","tess")
  .lte("visible_at",now.toISOString()).order("created_at",{ascending:false}).limit(100);
 if(error)throw new Error("Wedding decision messages unavailable");
 let accepted=0,declined=0;
 for(const plan of plans){
  const source=(messages??[]).find(message=>{
   if(Date.parse(message.created_at)<Date.parse(plan.startsAt)-365*24*3600*1000)return false;
   const md=message.metadata;
   const parsed=weddingPlanActionSchema.safeParse(md && typeof md==="object" && !Array.isArray(md)
     ? (md as Record<string,unknown>)["wedding_plan_action"] : null);
   return parsed.success && validateWeddingAction(parsed.data,message.body,[plan.id]);
  });
  if(!source)continue;
  const md=source.metadata as Record<string,unknown>;
  const action=weddingPlanActionSchema.parse(md["wedding_plan_action"]);
  if(!action?.action)continue;
  try {
   await recordCharacterWeddingDecision(db,{
    userId,characterKey,planId:plan.id,accepted:action.action==="accept",verifiedSourceId:source.id,
   });
   if(action.action==="accept")accepted++;else declined++;
  }catch(e){console.warn("[family-wedding] pending decision could not be saved",e);}
 }
 return {accepted,declined};
}
