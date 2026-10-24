import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { QUESTION_BANK } from "./game-trivia";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const gameSchema = z.object({
 conversationId:z.string().uuid(), key:z.string().min(4).max(160),
 game:z.enum(["trivia","four","words","pool"]),
 progress:z.unknown(), complete:z.boolean().default(false),
});
type Verdict={outcome:"win"|"loss"|"draw";player:number;opponent:number};
function trivia(p:unknown):Verdict|null {
 const s=p as {deck?:unknown;answers?:unknown;characterKey?:unknown};
 if(!Array.isArray(s?.deck)||s.deck.length!==10||!Array.isArray(s.answers)||s.answers.length!==10)return null;
 if(new Set(s.deck).size!==10 || s.deck.some(n=>!Number.isInteger(n)||n<0||n>=QUESTION_BANK.length))return null;
 if(s.answers.some(n=>!Number.isInteger(n)||n<0||n>3))return null;
 const key=typeof s.characterKey==="string"?s.characterKey:"";
 const player=s.answers.filter((n,i)=>n===QUESTION_BANK[s.deck[i]].correct).length;
 const opponent=s.deck.filter((n,i)=>{const q=QUESTION_BANK[n];const favored=key==="maya"?"Movies":key==="tess"?"Science":"";return (i*7+q.question.length+key.length)%10<(q.category===favored?8:6);}).length;
 return {outcome:player>opponent?"win":player<opponent?"loss":"draw",player,opponent};
}
function boardVerdict(p:unknown):Verdict|null {
 const s=p as {moves?:unknown};
 if(!Array.isArray(s?.moves)||s.moves.length<1||s.moves.length>42||s.moves.some(n=>!Number.isInteger(n)||n<0||n>6))return null;
 const b=Array(42).fill(0) as number[];
 const at=(r:number,c:number)=>r*7+c;
 const won=()=>{for(let r=0;r<6;r++)for(let c=0;c<7;c++){const v=b[at(r,c)];if(!v)continue;for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]])if(Array.from({length:4},(_,k)=>[r+k*dr,c+k*dc]).every(([rr,cc])=>rr>=0&&rr<6&&cc>=0&&cc<7&&b[at(rr,cc)]===v))return v;}return b.every(Boolean)?3:0;};
 const place=(col:number,player:number)=>{for(let r=5;r>=0;r--)if(!b[at(r,col)]){b[at(r,col)]=player;return true;}return false;};
 let end=0;
 for(let i=0;i<s.moves.length;i++){if(end!==0||!place(s.moves[i],i%2===0?1:2))return null;end=won();}
 if(!end)return null;
 return {outcome:end===3?"draw":end===1?"win":"loss",player:end===1?1:0,opponent:end===2?1:0};
}
export const saveGameMatch=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((d:unknown)=>gameSchema.parse(d))
 .handler(async ({data,context})=>{
  const {supabase,userId}=context;
  const {data:conv,error:convError}=await supabase.from("conversations").select("id,character:characters(key)").eq("id",data.conversationId).eq("user_id",userId).maybeSingle();
  if(convError||!conv)throw new Error("Conversation not found");
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("Game storage database is not configured");
  const admin=supabaseAdmin;
  const charKey=(conv.character as {key?:string}|null)?.key??"";
  const progress=data.game==="trivia" ? {...(data.progress as object),characterKey:charKey}:data.progress;
  const verdict=data.complete?(data.game==="trivia"?trivia(progress):data.game==="four"?boardVerdict(progress):null):null;
  if(data.complete && !verdict)throw new Error("Match is unfinished or cannot be verified server-side");
  const {data:existing,error:readError}=await admin.from("game_matches").select("id,status,result").eq("user_id",userId).eq("conversation_id",data.conversationId).eq("match_key",data.key).maybeSingle();
  if(readError)throw readError;
  if(existing?.status==="completed")return {completed:true,result:existing.result,alreadySaved:true};
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
    // Exact-once memory via matching unique match key stored as a metadata row is
    // migration-dependent; the match itself is always deduplicated by its unique key.
    return {completed:true,result:verdict,summary,alreadySaved:false};
  }
  return {completed:false,result:null,alreadySaved:false};
 });
export const recentGameMatches=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((d:unknown)=>z.object({conversationId:z.string().uuid()}).parse(d))
 .handler(async ({data,context})=>{
  const {data:matches,error}=await context.supabase.from("game_matches" as never).select("*").eq("conversation_id",data.conversationId).order("updated_at",{ascending:false}).limit(50);
  if(error)throw error;
  return matches??[];
 });
