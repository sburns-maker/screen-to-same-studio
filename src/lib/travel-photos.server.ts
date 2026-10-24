import type { TripPlan } from "./travel-experiences";
import type { CharacterKey } from "./characters";
import { CHARACTERS } from "./characters";
type PhotoMoment={send:boolean;scene:string;caption:string;kind:"selfie"|"scenery"|"moment"};
type Db=any;
/** A character can take a picture at any meaningful moment: no interval timers.
 * Real image budget, canonical identity, screening and failure handling still apply.
 */
export async function deliverTravelPhoto(db:Db,userId:string,trip:TripPlan,stopId:string,turnId:string,character:string|undefined,photo:PhotoMoment|null){
 if(!photo?.send || !photo.scene.trim())return null;
 const accepted=character && trip.companions.some(c=>c.characterKey===character&&c.response==="accepted");
 const def=accepted?CHARACTERS[character as CharacterKey]:null;
 // Without an accepted companion the player does not receive invented character selfies.
 if(!def)return null;
 const {data:convs}=await db.from("conversations").select("id,character:characters(key)").eq("user_id",userId);
 const conv=convs?.find((c:any)=>c.character?.key===character);
 if(!conv)return null;
 const actionId=turnId;
 const {reserveImageBudget}=await import("./world-runtime.server");
 const allowed=await reserveImageBudget(db,actionId,conv.id,userId);
 if(!allowed)return {status:"budget_exhausted" as const};
 try{
  const {createGeneratedPhoto}=await import("./tess.functions");
  const scene=`FICTIONAL VACATION PHOTO in ${trip.destination}, at ${trip.itinerary.find(s=>s.id===stopId)?.location??trip.destination}: ${photo.scene}. Natural spontaneous travel photography, plausible outfits and weather. Only ${def.fullName} is an established character.`;
  const generated=await createGeneratedPhoto(db,userId,photo.kind==="scenery"?"object":"casual_selfie",scene,"happy",null,def,actionId);
  const messageId=crypto.randomUUID();
  const {error:msgError}=await db.from("messages").insert({id:messageId,user_id:userId,conversation_id:conv.id,sender:"tess",body:photo.caption||"Had to show you this 😂",metadata:{generated_path:generated.path,photo_type:generated.type,photo_source:"travel",travel_trip_id:trip.id,travel_stop_id:stopId,travel_turn_id:turnId,photo_identity:generated.diagnostics},visible_at:new Date().toISOString()});
  if(msgError)throw new Error("Image created but message not saved: "+msgError.message);
  const {data:state}=await db.from("tess_state").select("*").eq("conversation_id",conv.id).eq("user_id",userId).maybeSingle();
  const {data:conversation}=await db.from("conversations").select("relationship_stage").eq("id",conv.id).eq("user_id",userId).maybeSingle();
  const {error:galleryError}=await db.from("generated_images").insert({
    id:crypto.randomUUID(),user_id:userId,conversation_id:conv.id,message_id:messageId,photo_type:generated.type,
    scene:generated.scene,includes_tess:generated.tess,is_selfie:generated.selfie,
    provider:generated.provider,model:generated.model,storage_path:generated.path,
    relationship_stage:conversation?.relationship_stage??null,state_snapshot:state??{},
    identity_reference_used:generated.identityReferenceUsed,
  });
  if(galleryError)console.warn("[travel-photo] Saved message but photo gallery index is pending",galleryError.message);
  await db.from("media_attempts").update({status:"generated",storage_path:generated.path}).eq("action_id",actionId);
  const {error:journalPhotoError}=await db.from("travel_trip_moments")
   .update({photo_path:generated.path,photo_caption:photo.caption})
   .eq("id",turnId).eq("user_id",userId).eq("trip_id",trip.id);
  if(journalPhotoError)console.warn("[travel-photo] Message sent but journal image reference pending",journalPhotoError.message);
  return {status:"delivered" as const,path:generated.path,caption:photo.caption,messageId};
 }catch(e){
  await db.from("media_attempts").update({status:"failed"}).eq("action_id",actionId).eq("status","reserved");
  console.warn("[travel-photo] Photo withheld (no invented message):",e);
  return {status:"failed" as const};
 }
}
