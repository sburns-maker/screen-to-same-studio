import type {TripPlan} from "./travel-experiences";
import {photoActionId} from "./photo-delivery.server";
type Db=any;
/** The shared trip really happened in the simulation only when a participant
 * completes the stop. Persist a concise fact in each accompanying character's
 * ordinary memory so it can shape later conversations.
 */
export async function rememberTravelStop(db:Db,userId:string,trip:TripPlan,stopId:string,description:string){
 const stop=trip.itinerary.find(s=>s.id===stopId);
 if(!stop)return 0;
 const companions=trip.companions.filter(c=>c.response==="accepted");
 if(!companions.length)return 0;
 const {data:convs,error}=await db.from("conversations").select("id,character:characters(key)").eq("user_id",userId);
 if(error)throw new Error("Could not locate character conversations");
 let recorded=0;
 for(const person of companions){
  const conv=convs?.find((c:any)=>c.character?.key===person.characterKey);
  if(!conv)continue;
  const id=await photoActionId("travel-memory:"+trip.id+":"+stopId+":"+person.characterKey);
  const text=`Shared fictional ${trip.purpose} trip to ${trip.destination}: completed ${stop.label} at ${stop.location} (day ${stop.day}). ${description.trim().slice(0,160)}`.slice(0,300);
  const {error:write}=await db.from("memories").upsert({id,conversation_id:conv.id,user_id:userId,memory_type:"experience",importance:4,summary:text},{onConflict:"id"});
  if(write)console.warn("[travel-memory] Memory write deferred",write.message); else recorded++;
 }
 return recorded;
}
