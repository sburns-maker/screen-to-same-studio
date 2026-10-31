import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CHARACTERS } from "./characters";
import { weddingPlanSchema, mayPlanWedding, type WeddingPlan } from "./family-life";
import { commitmentSnapshot } from "./relationship-commitments.server";
type Db = SupabaseClient<Database>;
const table = (db:Db)=>db.from("family_wedding_plans" as never);

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
/** Only called by verified world actions, never directly from the player API. */
export async function recordCharacterWeddingDecision(db:Db,input:{
 userId:string;characterKey:string;planId:string;accepted:boolean;
 verifiedSourceId:string;
}) {
 if(!input.verifiedSourceId)throw new Error("Verified character decision required");
 const {data,error}=await table(db).update({character_response:input.accepted?"accepted":"declined"} as never)
  .eq("id",input.planId).eq("user_id",input.userId).eq("character_key",input.characterKey)
  .eq("character_response","pending").select("*").maybeSingle();
 if(error || !data)throw new Error("Wedding plan decision unavailable or already resolved");
 return parseWedding(data as Record<string,unknown>);
}
