import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Send, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { messagesQuery, userTz } from "@/lib/tess-queries";
import { tessRespond } from "@/lib/tess.functions";

/** Same conversation and model as Messages; no second scripted character. */
export function GameChat({ conversationId, name, game }: { conversationId: string; name: string; game: string }) {
 const [expanded,setExpanded]=useState(true),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false);
 const qc=useQueryClient(),respond=useServerFn(tessRespond);
 const messages=useQuery({...messagesQuery(conversationId),refetchInterval:5000});
 const visible=(messages.data??[]).filter(m=>new Date(m.visible_at).getTime()<=Date.now()).slice(-12);
 useEffect(()=>{ void qc.invalidateQueries({queryKey:["messages",conversationId]}); },[qc,conversationId]);
 async function send(){
   const text=draft.trim();if(!text||busy)return;setBusy(true);
   try {
     const {data:{user},error:authError}=await supabase.auth.getUser();
     if(authError||!user)throw Error("Please sign in again");
     const {error}=await supabase.from("messages").insert({conversation_id:conversationId,user_id:user.id,sender:"user",body:text,metadata:{game_chat:game}});
     if(error)throw error;
     setDraft("");
     await qc.invalidateQueries({queryKey:["messages",conversationId]});
     await respond({data:{conversationId,tz:userTz()}});
     await qc.invalidateQueries({queryKey:["messages",conversationId]});
     await qc.invalidateQueries({queryKey:["tess_state",conversationId]});
   } catch(e){ window.alert(e instanceof Error?e.message:"Message failed"); }finally{setBusy(false);}
 }
 return <section aria-label={`Chat with ${name} during the game`} className="mt-6 rounded-2xl border bg-card">
   <button type="button" onClick={()=>setExpanded(v=>!v)} className="flex min-h-12 w-full items-center justify-between px-4" aria-expanded={expanded}>
    <span className="flex items-center gap-2 font-semibold"><MessageSquare size={18}/> Chat with {name}</span>{expanded?<ChevronDown size={18}/>:<ChevronUp size={18}/>}
   </button>
   {expanded&&<div className="border-t p-3">
    <div className="max-h-64 space-y-2 overflow-y-auto" aria-live="polite">{visible.map(m=><div key={m.id} className={`max-w-[88%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.sender==="user"?"ml-auto bg-primary text-primary-foreground":"bg-muted"}`}>{m.body}</div>)}</div>
    <form className="mt-3 flex gap-2" onSubmit={e=>{e.preventDefault();void send();}}>
      <input aria-label={`Message ${name}`} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1500} placeholder={`Message ${name}…`} className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2" />
      <button type="submit" aria-label="Send message" disabled={busy||!draft.trim()} className="min-h-11 min-w-11 rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><Send size={18} className="mx-auto"/></button>
    </form>
    <p className="mt-2 text-xs text-muted-foreground">This is your real conversation. Messages and character replies also appear in Chats. Relationship effects follow the existing character-brain rules.</p>
   </div>}
 </section>;
}
