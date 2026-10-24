import {createFileRoute,Link} from "@tanstack/react-router";
import {useServerFn} from "@tanstack/react-start";
import {useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {toast} from "sonner";
import {Screen,ScreenHeader} from "@/components/ScreenHeader";
import {PPG_ARENA,ALL_PPG_GAME_EVENTS,type ArenaEvent} from "@/lib/arena-events";
import {createTravelTrip,inviteTravelCompanion} from "@/lib/travel.functions";

export const Route=createFileRoute("/_authenticated/ppg-arena")({component:ArenaCalendar});
const CHARACTERS=["maya","tess","riley","claire","jordan","ben"] as const;
type Character=typeof CHARACTERS[number];
const charactersLabel=(c:Character)=>c.charAt(0).toUpperCase()+c.slice(1);
function ArenaCalendar(){
 const create=useServerFn(createTravelTrip);
 const invite=useServerFn(inviteTravelCompanion);
 const queryClient=useQueryClient();
 const [companion,setCompanion]=useState<Character>("maya");
 const [selected,setSelected]=useState("");
 const [busy,setBusy]=useState(false);
 const [invitation,setInvitation]=useState<{eventId:string;decision:string;reply:string}|null>(null);
 const upcoming=[...ALL_PPG_GAME_EVENTS].sort((a,b)=>a.date.localeCompare(b.date)||String(a.time).localeCompare(String(b.time)));
 async function createInvitation(event:ArenaEvent){
  setBusy(true);setSelected(event.id);setInvitation(null);
  try{
   const id=crypto.randomUUID();
   await create({data:{id,title:event.title+" at PPG Paints Arena",origin:"Altoona, PA",destination:"Pittsburgh, PA",mode:"road_trip",purpose:"adventure",startDate:event.date,endDate:event.date,venueEventId:event.id}});
   await queryClient.invalidateQueries({queryKey:["travel-trips"]});
   try{
    const answer=await invite({data:{id,character:companion}});
    setInvitation({eventId:event.id,decision:answer.decision,reply:answer.reply});
    toast.success("Event saved and invitation discussed");
   }catch(e){
    setInvitation({eventId:event.id,decision:"pending",reply:"The event was saved to Travel, but the character invitation didn't finish. Open Travel to invite again. "+(e instanceof Error?e.message:"")});
    toast.error("Event saved; invitation still pending");
   }
  }catch(e){toast.error(e instanceof Error?e.message:"Couldn't create event");}
  finally{setBusy(false)}
 }
 return <Screen><ScreenHeader title="PPG Paints Arena" subtitle="Pittsburgh · concerts, hockey and more"/>
  <main className="mx-auto max-w-3xl space-y-5 px-4 pb-28 pt-4">
   <p className="text-sm text-muted-foreground">{PPG_ARENA.address}</p>
   <p className="text-sm">Select a show, create its fictional calendar outing and ask a character to go with you. Their answer isn't guaranteed.</p>
   <div className="flex flex-wrap items-center gap-3">
    <label htmlFor="arena-invite-character" className="text-sm font-medium">Invite</label>
    <select id="arena-invite-character" className="rounded-xl border bg-background px-3 py-2" value={companion} onChange={e=>setCompanion(e.target.value as Character)}>
     {CHARACTERS.map(c=><option key={c} value={c}>{charactersLabel(c)}</option>)}
    </select>
    <a className="text-sm underline" href={PPG_ARENA.calendarUrl} target="_blank" rel="noopener noreferrer">Official venue schedule ↗</a>
   </div>
   <p className="text-xs text-muted-foreground">Real events are a manually verified snapshot from {PPG_ARENA.verifiedOn}. Fictional listings exist only inside this game; verify real dates and times with the venue.</p>
   <div className="space-y-3">{upcoming.map(event=><article key={event.id} className="space-y-2 rounded-2xl border p-4">
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
     <span>{event.date} · {event.time??"Time unconfirmed"} ET</span>
     <span>· {event.kind}</span>
     <span>· {event.source==="fictional_game_event"?"Fictional game event":"Real calendar snapshot"}</span>
    </div>
    <h2 className="font-semibold">{event.title}</h2>
    <button className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" type="button" disabled={busy} onClick={()=>void createInvitation(event)}>
     {busy&&selected===event.id?"Sending invitation…":"Add to Travel and invite "+charactersLabel(companion)}
    </button>
    {invitation?.eventId===event.id&&<div role="status" className="space-y-2 rounded-xl bg-muted p-3 text-sm"><p><strong>Character response: {invitation.decision}</strong></p><p>{invitation.reply}</p><Link to="/travel" className="underline">Open saved outing in Travel →</Link></div>}
   </article>)}</div>
   <Link to="/travel" className="text-sm underline">Back to Travel</Link>
  </main>
 </Screen>
}
