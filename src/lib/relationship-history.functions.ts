import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import type {TessState} from "./tess-logic";
export type Evaluation={id:string;evaluated_at:string;message_id:string;context_summary:string|null;state_before:TessState;state_after:TessState;delta:Record<string,number>;stage_before:string;stage_after:string;observed_tone:string|null;event_tags:string[];character_perspective:string|null;source_kind:string};
const filter=z.object({conversationId:z.string().uuid(),day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()});
export const relationshipHistory=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>filter.parse(v))
 .handler(async({context,data})=>{
 const {supabase,userId}=context;
 const {data:conv}=await supabase.from("conversations").select("id").eq("id",data.conversationId).eq("user_id",userId).maybeSingle();
 if(!conv)throw new Error("Conversation unavailable");
 const [{data:events,error:eventsError},{data:plans,error:plansError},{data:evaluations,error:evaluationsError}]=await Promise.all([
 supabase.from("world_events").select("id,kind,summary,occurs_at,processed_at,payload").eq("user_id",userId).eq("conversation_id",data.conversationId).order("occurs_at",{ascending:false}).limit(80),
 supabase.from("social_plans").select("id,title,status,date_local,starts_at,ends_at,place_key,followthrough").eq("user_id",userId).eq("conversation_id",data.conversationId).order("created_at",{ascending:false}).limit(60),
 supabase.from("relationship_evaluations" as "memories").select("*").eq("user_id",userId).eq("conversation_id",data.conversationId).order("evaluated_at",{ascending:false}).limit(250),
 ]);
 // Old installations may not have applied the append-only table migration yet.
 const historyUnavailable=!!evaluationsError;
 if(eventsError)throw eventsError;
 if(plansError)throw plansError;
 return {evaluations:historyUnavailable?[]:evaluations as unknown as Evaluation[],events:events??[],plans:plans??[],historyUnavailable};
 });
