import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addCompanion, respondCompanion, acceptTrip, validateTrip, type TripPlan } from "./travel-experiences";
const uuid=z.string().uuid();
const input=z.object({id:uuid,title:z.string().trim().min(1).max(120),origin:z.string().trim().min(1).max(160),destination:z.string().trim().min(1).max(160),
 mode:z.enum(["road_trip","flight","rail","local"]),purpose:z.enum(["vacation","work","family","adventure"]),
 startDate:z.string().nullable(),endDate:z.string().nullable(),venueEventId:z.string().max(120).optional()});
const getDb=async()=> (await import("@/integrations/supabase/client.server")).supabaseAdmin;
type TripRow=TripPlan & { revision?:number };
function fromRow(r:Record<string,unknown>):TripRow{
 return {id:String(r['id']),title:String(r['title']),origin:String(r['origin']),destination:String(r['destination']),
 mode:r['mode'] as TripPlan["mode"],purpose:r['purpose'] as TripPlan["purpose"],startDate:r['start_date'] as string|null,
 endDate:r['end_date'] as string|null,status:r['status'] as TripPlan["status"],companions:r['companions'] as TripPlan["companions"],
 itinerary:r['itinerary'] as TripPlan["itinerary"],notes:r['notes'] as string[],revision:Number(r['revision']||0)};
}
export const listTravelTrips=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.handler(async({context})=>{
 const db=await getDb();
 const {data,error}=await (db as any).from("travel_trips").select("*").eq("user_id",context.userId).order("updated_at",{ascending:false}).limit(100);
 if(error)throw new Error("Travel storage unavailable: "+error.message+"; apply docs/sql/20261024_travel_trips.sql");
 return ((data??[]) as Record<string,unknown>[]).map(fromRow);
});
export const createTravelTrip=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((v:unknown)=>input.parse(v)).handler(async({context,data})=>{
 const db=await getDb();
 const iceland=data.destination.trim().toLowerCase()==="iceland" && data.title.trim().toLowerCase()==="iceland in winter";
 const arenaEvent=data.venueEventId?(await import("./arena-events")).ALL_PPG_GAME_EVENTS.find(e=>e.id===data.venueEventId):null;
 if(data.venueEventId&&!arenaEvent)throw new Error("Unknown arena event");
 const itinerary=arenaEvent?[{id:crypto.randomUUID(),day:1,label:arenaEvent.title,location:"PPG Paints Arena, 1001 Fifth Avenue, Pittsburgh, PA",kind:"activity" as const,completed:false}]:iceland?(await import("./travel-experiences")).icelandTripIdea(data.origin).itinerary:[];
 const p:TripPlan={...data,status:"idea",companions:[],itinerary,notes:arenaEvent?["Arena event, confirm schedule before attending.", "Event begins "+(arenaEvent.time??"at an unconfirmed time")+" America/New_York."]:[]};
 if(arenaEvent&&(data.startDate!==arenaEvent.date||data.endDate!==arenaEvent.date))throw new Error("Event trip dates must match listing");
 const errors=validateTrip(p);if(errors.length)throw new Error(errors.join("; "));
 const {error}=await (db as any).from("travel_trips").insert({id:p.id,user_id:context.userId,title:p.title,origin:p.origin,destination:p.destination,mode:p.mode,purpose:p.purpose,start_date:p.startDate,end_date:p.endDate,itinerary:p.itinerary,notes:p.notes});
 if(error)throw new Error(error.message);
 return {id:p.id};
});
const action=z.object({id:uuid,revision:z.number().int().min(0),action:z.enum(["invite","companion_accept","companion_decline","propose","confirm","start","complete_stop","finish","cancel","add_stop","set_dates"]),
 character:z.string().regex(/^[a-z_]{2,40}$/).optional(),stopId:z.string().max(100).optional(),
 label:z.string().trim().max(180).optional(),location:z.string().trim().max(180).optional(),day:z.number().int().min(1).max(90).optional(),
 kind:z.enum(["travel","activity","lodging","meal","work","rest"]).optional(),
 body:z.string().trim().max(1500).optional(),startDate:z.string().nullable().optional(),endDate:z.string().nullable().optional()});
export const changeTravelTrip=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((v:unknown)=>action.parse(v)).handler(async({context,data})=>{
 const db=await getDb();const table=(db as any).from("travel_trips");
 const {data:row,error:e}=await table.select("*").eq("id",data.id).eq("user_id",context.userId).single();
 if(e||!row)throw new Error("Trip not found");
 let p=fromRow(row);
 if(p.revision!==data.revision)throw new Error("Trip changed; refresh before updating");
 switch(data.action){
 case "invite":
  if(!data.character)throw new Error("Choose a character");
  if(!["idea","proposed"].includes(p.status))throw new Error("Trip can no longer be edited");
  p=addCompanion(p,data.character);break;
 case "companion_accept":case "companion_decline":
  if(!data.character)throw new Error("Choose a character");
  // A player's button must not impersonate a character's acceptance.
  throw new Error("Character responses must come from the character conversation, not the player's planner");
 case "propose":if(p.status!=="idea")throw new Error("Cannot propose this trip");p={...p,status:"proposed"};break;
 case "confirm":
  if(!["idea","proposed"].includes(p.status))throw new Error("Cannot confirm this trip");
  p=acceptTrip(p);break;
 case "start":
  if(p.status!=="accepted")throw new Error("Trip must be confirmed first");
  p={...p,status:"in_progress"};break;
 case "set_dates":
  if(!["idea","proposed"].includes(p.status))throw new Error("Dates are locked once confirmed");
  p={...p,startDate:data.startDate??null,endDate:data.endDate??null};break;
 case "add_stop":
  if(!data.label||!data.location||!data.day||!data.kind)throw new Error("Stop needs day, title, place and type");
  if(!["idea","proposed","accepted","in_progress"].includes(p.status))throw new Error("Trip is closed");
  p={...p,itinerary:[...p.itinerary,{id:crypto.randomUUID(),day:data.day,label:data.label,location:data.location,kind:data.kind,completed:false}]};break;
 case "complete_stop":
  if(p.status!=="in_progress"||!data.stopId)throw new Error("Trip must be underway");
  if(!p.itinerary.some(s=>s.id===data.stopId))throw new Error("Stop not found");
  if(!data.body)throw new Error("Record what happened before finishing a stop");
  p={...p,itinerary:p.itinerary.map(s=>s.id===data.stopId?{...s,completed:true}:s)};
  break;
 case "finish":
  if(p.status!=="in_progress"||p.itinerary.some(s=>!s.completed))throw new Error("Finish recorded stops first");
  p={...p,status:"completed"};break;
 case "cancel":p={...p,status:"cancelled"};break;
 }
 const errs=validateTrip(p);if(errs.length)throw new Error(errs.join("; "));
 const {data:updated,error}=await (db as any).from("travel_trips").update({status:p.status,start_date:p.startDate,end_date:p.endDate,companions:p.companions,itinerary:p.itinerary,notes:p.notes,revision:data.revision+1,updated_at:new Date().toISOString()})
  .eq("id",p.id).eq("user_id",context.userId).eq("revision",data.revision).select("id").maybeSingle();
 if(error||!updated)throw new Error(error?.message??"Concurrent update; refresh and retry");
 if(data.action==="complete_stop") {
  const {error:me}=await (db as any).from("travel_trip_moments").insert({id:crypto.randomUUID(),trip_id:p.id,user_id:context.userId,stop_id:data.stopId,day:p.itinerary.find(s=>s.id===data.stopId)?.day,body:data.body});
  if(me)throw new Error("Stop marked complete, but travel journal failed: "+me.message);
  if (data.stopId && data.body) await (await import("./travel-memory.server")).rememberTravelStop(db,context.userId,p,data.stopId,data.body);
 }
 return {revision:data.revision+1,status:p.status};
});
export const listTravelMoments=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((v:unknown)=>z.object({id:uuid}).parse(v)).handler(async({context,data})=>{
 const db=await getDb();const {data:rows,error}=await (db as any).from("travel_trip_moments").select("id,stop_id,day,body,created_at,photo_path,photo_caption").eq("user_id",context.userId).eq("trip_id",data.id).order("created_at");
 if(error)throw new Error(error.message);
 return Promise.all((rows??[]).map(async (m:any)=>{
  if(!m.photo_path || !m.photo_path.startsWith(context.userId+"/"))return {...m,photoUrl:null};
  const {data:signed,error:signError}=await db.storage.from("tess-photos").createSignedUrl(m.photo_path,3600);
  return {...m,photoUrl:signError?null:(signed?.signedUrl??null)};
 }));
});

const momentInput=z.object({id:uuid,stopId:z.string().min(1).max(100),day:z.number().int().min(1).max(90),text:z.string().trim().min(1).max(1500),character:z.enum(["tess","maya","claire","jordan","ben","riley","sienna","kendra"]).optional()});
export const travelSceneTurn=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((v:unknown)=>momentInput.parse(v)).handler(async({context,data})=>{
 const db=await getDb();
 const {data:row,error}=await (db as any).from("travel_trips").select("*").eq("id",data.id).eq("user_id",context.userId).single();
 if(error||!row)throw new Error("Trip not found");
 const trip=fromRow(row);
 if(trip.status!=="in_progress"||!trip.itinerary.some(s=>s.id===data.stopId&&s.day===data.day&&!s.completed))throw new Error("Active stop not found");
 const {data:prior}=await (db as any).from("travel_trip_moments").select("body").eq("user_id",context.userId).eq("trip_id",trip.id).eq("stop_id",data.stopId).order("created_at",{ascending:false}).limit(8);
 const ai=await (await import("./travel-ai.server")).generateTravelScene(trip,data.day,data.stopId,data.text,(prior??[]).map((m:{body:string})=>m.body).reverse(),data.character);
 const body="You: "+data.text+"\nScene: "+ai.narration+(ai.dialogue?"\n"+(data.character??"Guide")+": "+ai.dialogue:"");
 const travelTurnId=crypto.randomUUID();
 const {error:write}=await (db as any).from("travel_trip_moments").insert({id:travelTurnId,trip_id:trip.id,user_id:context.userId,stop_id:data.stopId,day:data.day,body});
 if(write)throw new Error("Scene could not be saved: "+write.message);
 const photo=await (await import("./travel-photos.server")).deliverTravelPhoto(db,context.userId,trip,data.stopId,travelTurnId,data.character,ai.photo);
 return {body,detail:ai.newDetail,photo};
});
const askInput=z.object({followUp:z.string().trim().max(1500).optional(),id:uuid,character:z.enum(["tess","maya","claire","jordan","ben","riley","sienna","kendra"])});
export const inviteTravelCompanion=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((v:unknown)=>askInput.parse(v)).handler(async({context,data})=>{
 const db=await getDb();const {data:row,error}=await (db as any).from("travel_trips").select("*").eq("id",data.id).eq("user_id",context.userId).single();
 if(error||!row)throw new Error("Trip not found");let trip=fromRow(row);
 if(!["idea","proposed"].includes(trip.status))throw new Error("Trip not open for invitations");
 const existing=trip.companions.find(c=>c.characterKey===data.character);
 if(existing && existing.response!=="invited")throw new Error("Character has already decided about this trip");
 if(existing && !data.followUp)throw new Error("They are still considering it. Add details to continue the discussion.");
 if(!existing && data.followUp)throw new Error("Send the initial invitation first");
 const {data:convRows}=await db.from("conversations").select("id,relationship_stage,character:characters(key)").eq("user_id",context.userId);
 const conv=convRows?.find(c=>(c.character as {key?:string}|null)?.key===data.character);
 const {data:state}=conv?await db.from("tess_state").select("comfort,trust,emotional_intimacy,romantic_intent").eq("user_id",context.userId).eq("conversation_id",conv.id).maybeSingle():{data:null};
 const result=await (await import("./travel-ai.server")).characterTripDecision(data.character,trip,{stage:conv?.relationship_stage,stats:state??null},data.followUp);
 const companion={characterKey:data.character,response:result.decision==="accept"?"accepted":result.decision==="decline"?"declined":"invited"};
 const {data:updated,error:write}=await (db as any).from("travel_trips").update({companions:[...trip.companions.filter(c=>c.characterKey!==data.character),companion],revision:(trip.revision??0)+1,updated_at:new Date().toISOString()})
 .eq("user_id",context.userId).eq("id",data.id).eq("revision",trip.revision).select("id").maybeSingle();
 if(write||!updated)throw new Error(write?.message??"Concurrent update; retry");
 // Write the actual invitation exchange to the normal per-character conversation.
 // Do not fabricate acceptance: 'discuss' remains invited in both places.
 let chatSynced=false;
 if(conv?.id){
  const when=new Date(),invitationId=crypto.randomUUID(),replyId=crypto.randomUUID();
  const details=[trip.title,trip.destination,trip.startDate??"dates to discuss"].join(" · ");
  const {error:chatError}=await db.from("messages").insert([
   {id:invitationId,user_id:context.userId,conversation_id:conv.id,sender:"user",body:data.followUp??("Want to go with me? "+details+" (fictional trip)"),created_at:when.toISOString(),visible_at:when.toISOString(),metadata:{travel_invitation:true,trip_id:trip.id,decision:"invited"}},
   {id:replyId,user_id:context.userId,conversation_id:conv.id,sender:"tess",body:result.reply,created_at:new Date(when.getTime()+1).toISOString(),visible_at:new Date(when.getTime()+1).toISOString(),metadata:{travel_invitation:true,trip_id:trip.id,decision:result.decision}}
  ] as never);
  chatSynced=!chatError;
 }
 return {decision:result.decision,reply:result.reply,chatSynced};

});
