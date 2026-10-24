import { travelCharacterMoment } from "./travel-ai.server";
import { deliverTravelPhoto } from "./travel-photos.server";
import type { TripPlan } from "./travel-experiences";
import { photoActionId } from "./photo-delivery.server";
type Db=any;
/** World worker: once per destination stop, an accompanying character can
 * independently choose to send a photo. No hourly photo quota or artificial
 * gap. The work-queue marker is durable so frequent polling cannot spam.
 */
export async function runTravelMoments(db:Db,userId:string,now=new Date()):Promise<number>{
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
 const {data:rows,error}=await db.from("travel_trips").select("*").eq("user_id",userId).eq("status","in_progress").lte("start_date",day).gte("end_date",day).limit(10);
 if(error){console.warn("[travel-tick] migration unavailable:",error.message);return 0;}
 let emitted=0;
 for(const r of rows??[]){
  const trip:TripPlan={id:r.id,title:r.title,origin:r.origin,destination:r.destination,mode:r.mode,purpose:r.purpose,startDate:r.start_date,endDate:r.end_date,status:r.status,companions:r.companions??[],itinerary:r.itinerary??[],notes:r.notes??[]};
  const elapsed=Math.floor((Date.parse(day+"T12:00:00Z")-Date.parse(trip.startDate!+"T12:00:00Z"))/86400000)+1;
  const stops=trip.itinerary.filter(s=>s.day===elapsed&&!s.completed);
  const companions=trip.companions.filter(c=>c.response==="accepted");
  for(const stop of stops){
   if(!companions.length)break;
   // Each stop is its own event; different characters can react to different stops.
   const character=companions[(elapsed+stop.id.length)%companions.length]!.characterKey;
   const markerId=await photoActionId("trip:autonomous:"+trip.id+":"+stop.id+":"+character);
   const {data:already}=await db.from("travel_trip_moments").select("id").eq("id",markerId).eq("user_id",userId).maybeSingle();
   if(already)continue;
   const {error:claim}=await db.from("travel_trip_moments").insert({id:markerId,trip_id:trip.id,user_id:userId,stop_id:stop.id,day:elapsed,body:"Companion photo moment considered"});
   if(claim)continue;
   try{
    const decision=await travelCharacterMoment(trip,character,stop.id);
    const result=await deliverTravelPhoto(db,userId,trip,stop.id,markerId,character,decision);
    const summary=result?.status==="delivered" ? character+": "+decision.caption : result?.status==="failed"?"Photo opportunity passed (generation unavailable)":decision.send?"Photo opportunity passed (budget unavailable)":"No photo this time";
    await db.from("travel_trip_moments").update({body:summary}).eq("id",markerId).eq("user_id",userId);
    if(result?.status==="delivered")emitted++;
   }catch(e){
    console.warn("[travel-tick] autonomous stop photo skipped",e);
    await db.from("travel_trip_moments").update({body:"Photo opportunity passed"}).eq("id",markerId).eq("user_id",userId);
   }
  }
 }
 return emitted;
}
