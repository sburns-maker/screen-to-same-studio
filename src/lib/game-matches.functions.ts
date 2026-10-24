import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { trivia, boardVerdict } from "./game-match-validation";
import type { SupabaseClient } from "@supabase/supabase-js";

const gameSchema = z.object({
 conversationId:z.string().uuid(), key:z.string().min(4).max(160),
 game:z.enum(["trivia","four","words","pool"]),
 progress:z.unknown(), complete:z.boolean().default(false),
});
export const saveGameMatch=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((d:unknown)=>gameSchema.parse(d))
 .handler(async ({data,context})=>{
  const {supabase,userId}=context;
  const {data:conv,error:convError}=await supabase.from("conversations").select("id,character:characters(key)").eq("id",data.conversationId).eq("user_id",userId).maybeSingle();
  if(convError||!conv)throw new Error("Conversation not found");
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("Game storage database is not configured");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as unknown as SupabaseClient<any>;
  const charKey=(conv.character as {key?:string}|null)?.key??"";
  const progress=data.game==="trivia" ? {...(data.progress as object),characterKey:charKey}:data.progress;
  const verdict=data.complete?(data.game==="trivia"?trivia(progress):data.game==="four"?boardVerdict(progress):null):null;
  if(data.complete && !verdict)throw new Error("Match is unfinished or cannot be verified server-side");
  const {data:existing,error:readError}=await admin.from("game_matches").select("id,status,result").eq("user_id",userId).eq("conversation_id",data.conversationId).eq("match_key",data.key).maybeSingle();
  if(readError)throw readError;
  if(existing?.status==="completed"){
    const {data:record}=await admin.from("game_matches").select("effects_applied").eq("id",existing.id).single();
    if(!record?.effects_applied){
      const past=existing.result as {outcome?:"win"|"loss"|"draw"}|null;
      const summary="We played "+(data.game==="trivia"?"trivia":"Four in a Row")+" together; "+(past?.outcome==="win"?"the user won":past?.outcome==="loss"?"I won":"we tied")+". It was a shared activity, not proof of romantic interest.";
      const {error:repairError}=await admin.rpc("finalize_game_match",{p_id:existing.id,p_user_id:userId,p_summary:summary});
      if(repairError)throw repairError;
    }
    return {completed:true,result:existing.result,alreadySaved:true};
  }
  const {error:writeError}=await admin.from("game_matches").upsert({
   user_id:userId,conversation_id:data.conversationId,match_key:data.key,game:data.game,
   progress:progress as import("@/integrations/supabase/types").Json,
   status:verdict?"completed":"active",
   result:verdict as unknown as import("@/integrations/supabase/types").Json,
   updated_at:new Date().toISOString()
  },{onConflict:"user_id,conversation_id,match_key"});
  if(writeError)throw writeError;
  // A completed verified match becomes canonical character-only context.
  // Never auto-award attraction or relationship points for a win or a loss.
  if(verdict){
    const summary="We played "+(data.game==="trivia"?"trivia":"Four in a Row")+" together; "+(verdict.outcome==="win"?"the user won":verdict.outcome==="loss"?"I won":"we tied")+". It was a shared activity, not proof of romantic interest.";
    const {data:stored}=await admin.from("game_matches").select("id").eq("user_id",userId).eq("conversation_id",data.conversationId).eq("match_key",data.key).single();
    if(stored){const {error:finalError}=await admin.rpc("finalize_game_match",{p_id:stored.id,p_user_id:userId,p_summary:summary});if(finalError)throw finalError;}
    return {completed:true,result:verdict,summary,alreadySaved:false};
  }
  return {completed:false,result:null,alreadySaved:false};
 });
export const recentGameMatches=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((d:unknown)=>z.object({conversationId:z.string().uuid()}).parse(d))
 .handler(async ({data,context})=>{
  const {data:matches,error}=await context.supabase.from("game_matches" as "memories").select("*").eq("conversation_id",data.conversationId).order("updated_at",{ascending:false}).limit(50);
  if(error)throw error;
  return matches??[];
 });
