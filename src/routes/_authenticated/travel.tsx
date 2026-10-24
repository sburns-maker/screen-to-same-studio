import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { listTravelTrips,createTravelTrip,changeTravelTrip,inviteTravelCompanion,travelSceneTurn,listTravelMoments } from "@/lib/travel.functions";
import { icelandTripIdea, type TripPlan } from "@/lib/travel-experiences";
import {TRAVEL_REGIONS,travelPlaces,realWorldMapSearchUrl,type TravelPlace} from "@/lib/travel-places";
import {PPG_ARENA,ALL_PPG_GAME_EVENTS} from "@/lib/arena-events";
export const Route=createFileRoute("/_authenticated/travel")({component:Travel,head:()=>({meta:[{title:"Travel · Tess"},{name:"description",content:"Plan trips and explore destinations in Tess's fictional world."},{property:"og:title",content:"Travel · Tess"},{property:"og:description",content:"Plan trips and explore destinations in Tess's fictional world."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]})});
const modes=["road_trip","flight","rail","local"] as const;
const purposes=["vacation","work","family","adventure"] as const;
const kinds=["travel","activity","lodging","meal","work","rest"] as const;
const pretty=(s:string)=>s.replaceAll("_"," ");
function Travel(){
 const list=useServerFn(listTravelTrips),create=useServerFn(createTravelTrip),change=useServerFn(changeTravelTrip),invite=useServerFn(inviteTravelCompanion),scene=useServerFn(travelSceneTurn),getMoments=useServerFn(listTravelMoments);
 const cache=useQueryClient();
 const q=useQuery({queryKey:["travel-trips"],queryFn:()=>list()});
 const [busy,setBusy]=useState(false),[title,setTitle]=useState(""),[origin,setOrigin]=useState("Altoona, PA"),[destination,setDestination]=useState(""),[mode,setMode]=useState<typeof modes[number]>("road_trip"),[purpose,setPurpose]=useState<typeof purposes[number]>("vacation"),[start,setStart]=useState(""),[end,setEnd]=useState("");
 const [companion,setCompanion]=useState<"tess"|"maya"|"claire"|"jordan"|"ben"|"riley">("tess"),[sceneText,setSceneText]=useState(""),[sceneCharacter,setSceneCharacter]=useState(""),[sceneResult,setSceneResult]=useState(""),[inviteReply,setInviteReply]=useState("");
 const [stopTitle,setStopTitle]=useState(""),[stopPlace,setStopPlace]=useState(""),[day,setDay]=useState(1),[kind,setKind]=useState<typeof kinds[number]>("activity"),[note,setNote]=useState(""),[selected,setSelected]=useState("");
 const [region,setRegion]=useState(""),[placeQuery,setPlaceQuery]=useState("");
 const suggestions=travelPlaces(placeQuery,region).slice(0,80);
 const trips=(q.data??[]) as (TripPlan&{revision:number})[];
 const current=trips.find(t=>t.id===selected)??trips[0];
 const journal=useQuery({queryKey:["travel-moments",current?.id],queryFn:()=>current?getMoments({data:{id:current.id}}):Promise.resolve([]),enabled:!!current?.id});
 async function planArenaEvent(eventId:string){
  const event=ALL_PPG_GAME_EVENTS.find(e=>e.id===eventId);if(!event)return;
  setBusy(true);
  try{
   const id=crypto.randomUUID();
   await create({data:{id,title:event.title+" at PPG Paints Arena",origin,destination:"Pittsburgh, PA",mode:"road_trip",purpose:"adventure",startDate:event.date,endDate:event.date,venueEventId:event.id}});
   setSelected(id);await cache.invalidateQueries({queryKey:["travel-trips"]});
   toast.success("Arena event added to Travel with its scheduled date");
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 async function save(idea=false){
  setBusy(true);try{
   const p=idea?icelandTripIdea(origin):null;
   const id=crypto.randomUUID();
   await create({data:{id,title:p?.title??title,origin:p?.origin??origin,destination:p?.destination??destination,mode:p?.mode??mode,purpose:p?.purpose??purpose,startDate:start||null,endDate:end||null}});
   setSelected(id);await cache.invalidateQueries({queryKey:["travel-trips"]});toast.success("Trip saved");
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 async function action(type:"propose"|"confirm"|"start"|"finish"|"cancel"|"add_stop"|"complete_stop"|"set_dates",stopId?:string){
  if(!current)return;setBusy(true);
  try{await change({data:{id:current.id,revision:current.revision,action:type,...(stopId?{stopId}:{}),
   ...(type==="add_stop"?{label:stopTitle,location:stopPlace,day,kind}:{}),
   ...(type==="set_dates"?{startDate:start||null,endDate:end||null}:{}),
   ...(type==="complete_stop"?{body:note}:{})}});
   await cache.invalidateQueries({queryKey:["travel-trips"]});await cache.invalidateQueries({queryKey:["travel-moments",current.id]});setNote("");setStopTitle("");toast.success("Trip updated")
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 async function inviteCharacter(){
  if(!current)return;setBusy(true);try{const result=await invite({data:{id:current.id,character:companion}});
   setInviteReply(result.reply);await cache.invalidateQueries({queryKey:["travel-trips"]});
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 async function turn(stopId:string,day:number){
  if(!current||!sceneText.trim())return;setBusy(true);try{const r=await scene({data:{id:current.id,stopId,day,text:sceneText,
   ...(sceneCharacter?{character:sceneCharacter as "tess"|"maya"|"claire"|"jordan"|"ben"|"riley"}:{})}});
   setSceneResult(r.body);setSceneText("");await cache.invalidateQueries({queryKey:["travel-moments",current.id]});toast.success("Scene saved");
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 const field="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm";
 const btn="rounded-full border border-border px-4 py-2 text-sm disabled:opacity-50";
 return <Screen><ScreenHeader title="Travel"/>
 <main className="mx-auto max-w-3xl space-y-6 px-4 pb-28 pt-4">
 <p className="text-sm text-muted-foreground">Plan fictional travel and record what happens. Destinations and travel are in-game: no tickets or lodging are actually booked.</p>
 <section className="space-y-3 rounded-2xl border p-4">
 <h2 className="font-semibold">Explore the real-world-inspired destination guide</h2>
 <p className="text-sm text-muted-foreground">Independent curated geographic places, not a Google Maps database. Opening hours and access require checking.</p>
 <select className="w-full rounded-xl border bg-background p-2" aria-label="Travel region" value={region} onChange={e=>setRegion(e.target.value)}><option value="">All regions</option>{TRAVEL_REGIONS.map(r=><option key={r.id} value={r.id}>{r.label} · {r.country}</option>)}</select>
 <input className="w-full rounded-xl border bg-background p-2" aria-label="Search destinations" placeholder="Search park, museum, town, waterfall…" value={placeQuery} onChange={e=>setPlaceQuery(e.target.value)}/>
 {(region==="pittsburgh"||/ppg|arena|jonas/i.test(placeQuery))&&<section className="space-y-2 rounded-xl border p-3">
 <h3 className="font-semibold">PPG Paints Arena · Upcoming published events</h3>
 <p className="text-xs text-muted-foreground">{PPG_ARENA.address}. Real schedule snapshot checked {PPG_ARENA.verifiedOn}; fictional concerts are game-only.</p>
 <div className="max-h-64 space-y-2 overflow-y-auto">{ALL_PPG_GAME_EVENTS.map(e=><article key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"><div><strong>{e.title}</strong><p className="text-xs text-muted-foreground">{e.date} · {e.time??"time unconfirmed"} · {e.kind} {e.source==="fictional_game_event"?"· FICTIONAL GAME EVENT":"· Real listing"}</p></div><button type="button" disabled={busy} className="underline disabled:opacity-50" onClick={()=>void planArenaEvent(e.id)}>Add event to Travel</button></article>)}</div>
 <a href={PPG_ARENA.calendarUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">Official venue calendar ↗</a>
 </section>}
 <div className="max-h-96 space-y-2 overflow-y-auto">{suggestions.map((p:TravelPlace)=><article key={p.id} className="rounded-xl border p-3">
 <p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.city} · {p.regionLabel} · {p.kind}</p><p className="mt-1 text-xs">{p.ideas.join(" · ")}</p>
 <div className="mt-2 flex flex-wrap gap-3 text-sm"><button type="button" className="underline" onClick={()=>{setDestination(p.regionLabel);setTitle("Explore "+p.regionLabel);setMode(p.country==="US"&&p.state==="PA"?"road_trip":"flight");setStopTitle(p.name);setStopPlace(p.name+", "+p.city);toast.info("Destination and itinerary stop selected below")}}>Plan a trip here</button>
 <button type="button" className="underline" onClick={()=>{setStopTitle(p.name);setStopPlace(p.name+", "+p.city);toast.info("Stop selected; add it to your active itinerary below")}}>Select as stop</button>
 <a href={realWorldMapSearchUrl(p)} target="_blank" rel="noopener noreferrer" className="underline">View on Google Maps ↗</a></div></article>)}</div>
 </section>
 <section className="space-y-3 rounded-2xl border p-4">
 <h2 className="font-semibold">New adventure</h2>
 <button className={btn} disabled={busy} onClick={()=>void save(true)}>Save Tess's Iceland dream</button>
 <input aria-label="Trip title" className={field} value={title} placeholder="Trip name" onChange={e=>setTitle(e.target.value)}/>
 <div className="grid grid-cols-2 gap-2"><input aria-label="Starting point" className={field} value={origin} onChange={e=>setOrigin(e.target.value)}/><input aria-label="Destination" className={field} value={destination} placeholder="Destination" onChange={e=>setDestination(e.target.value)}/></div>
 <div className="grid grid-cols-2 gap-2">
 <select aria-label="Transport" className={field} value={mode} onChange={e=>setMode(e.target.value as typeof mode)}>{modes.map(x=><option key={x} value={x}>{pretty(x)}</option>)}</select>
 <select aria-label="Reason for travel" className={field} value={purpose} onChange={e=>setPurpose(e.target.value as typeof purpose)}>{purposes.map(x=><option key={x} value={x}>{pretty(x)}</option>)}</select>
 <input aria-label="Departure date" type="date" className={field} value={start} onChange={e=>setStart(e.target.value)}/><input aria-label="Return date" type="date" className={field} value={end} onChange={e=>setEnd(e.target.value)}/>
 </div><button disabled={busy||!title.trim()||!destination.trim()} className="rounded-full bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50" onClick={()=>void save()}>Create trip</button>
 </section>
 {q.isLoading&&<p>Loading trips…</p>}{q.error&&<p role="alert" className="text-destructive">{String((q.error as Error).message)}</p>}
 {trips.length>0&&<section className="space-y-3"><label className="text-sm font-semibold" htmlFor="trip-choice">Your trips</label><select id="trip-choice" value={current?.id??""} onChange={e=>setSelected(e.target.value)} className={field}>{trips.map(t=><option key={t.id} value={t.id}>{t.title} · {pretty(t.status)}</option>)}</select></section>}
 {current&&<section className="space-y-4 rounded-2xl border p-4">
 <div><h2 className="text-xl font-semibold">{current.title}</h2><p className="text-sm text-muted-foreground">{current.origin} → {current.destination} · {pretty(current.mode)} · {pretty(current.purpose)}</p><p className="text-sm">Status: {pretty(current.status)} · {current.startDate??"departure undecided"} – {current.endDate??"return undecided"}</p></div>
 {["idea","proposed"].includes(current.status)&&<div className="space-y-2 rounded-xl bg-muted/40 p-3"><p className="text-sm font-semibold">Choose travel dates before confirming</p><div className="grid grid-cols-2 gap-2"><input type="date" aria-label="Trip departure date" className={field} value={start} onChange={e=>setStart(e.target.value)}/><input type="date" aria-label="Trip return date" className={field} value={end} onChange={e=>setEnd(e.target.value)}/></div><button className={btn} disabled={busy||!start||!end} onClick={()=>void action("set_dates")}>Save travel dates</button><p className="text-xs text-muted-foreground">Current saved dates: {current.startDate??"not set"} to {current.endDate??"not set"}</p></div>}
 <div className="flex flex-wrap gap-2">
 {current.status==="idea"&&<button className={btn} disabled={busy} onClick={()=>void action("propose")}>Mark proposed</button>}
 {["idea","proposed"].includes(current.status)&&<button className={btn} disabled={busy} onClick={()=>void action("confirm")}>Confirm trip (solo or agreed companions)</button>}
 {current.status==="accepted"&&<button className={btn} disabled={busy} onClick={()=>void action("start")}>Start travel</button>}
 {current.status==="in_progress"&&<button className={btn} disabled={busy} onClick={()=>void action("finish")}>Finish trip</button>}
 {!["completed","cancelled"].includes(current.status)&&<button className={btn} disabled={busy} onClick={()=>void action("cancel")}>Cancel</button>}
 </div>
 <div><h3 className="font-semibold">Travel companions</h3><p className="text-sm text-muted-foreground">Characters decide for themselves if they want to travel with you. An invitation is never automatically accepted.</p>
 {["idea","proposed"].includes(current.status)&&<div className="flex flex-wrap gap-2"><select className={field} aria-label="Invite character" value={companion} onChange={e=>setCompanion(e.target.value as typeof companion)}>{(["tess","maya","claire","jordan","ben","riley"] as const).map(c=><option key={c} value={c}>{c}</option>)}</select><button className={btn} disabled={busy} onClick={()=>void inviteCharacter()}>Ask character about trip</button></div>}
 {inviteReply&&<p role="status" className="rounded-xl bg-muted p-3 text-sm">{inviteReply}</p>}{current.companions.map(c=><p key={c.characterKey}>{c.characterKey} · {c.response}</p>)}</div>
 <h3 className="font-semibold">Itinerary</h3>
 {[...current.itinerary].sort((a,b)=>a.day-b.day).map(s=><article key={s.id} className="space-y-2 rounded-xl border p-3"><p className="font-medium">Day {s.day} · {s.label} {s.completed?"✓":""}</p><p className="text-sm text-muted-foreground">{s.location} · {s.kind}</p>
 {current.status==="in_progress"&&!s.completed&&<div className="space-y-2">
 <label className="text-sm" htmlFor={"companion-"+s.id}>Travel scene companion</label><select id={"companion-"+s.id} className={field} value={sceneCharacter} onChange={e=>setSceneCharacter(e.target.value)}><option value="">Travel solo</option>{current.companions.filter(c=>c.response==="accepted").map(c=><option key={c.characterKey} value={c.characterKey}>{c.characterKey}</option>)}</select>
 <textarea className={field} aria-label="Your action in travel scene" placeholder="What do you do or say?" value={sceneText} onChange={e=>setSceneText(e.target.value)}/>
 <button className={btn} disabled={busy||!sceneText.trim()} onClick={()=>void turn(s.id,s.day)}>Play next scene</button>
 {sceneResult&&<p role="status" className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm">{sceneResult}</p>}
 <textarea aria-label={"Experience notes for "+s.label} className={field} value={note} onChange={e=>setNote(e.target.value)} placeholder="What happened on this stop?"/><button className={btn} disabled={busy||!note.trim()} onClick={()=>void action("complete_stop",s.id)}>Save moment and complete stop</button></div>}</article>)}
 <div className="space-y-2"><h3 className="font-semibold">Saved travel journal</h3>{journal.isLoading&&<p className="text-sm">Loading moments…</p>}{journal.error&&<p role="alert" className="text-sm text-destructive">{String((journal.error as Error).message)}</p>}{(journal.data??[]).map((m:{id:string;body:string;day:number;created_at:string;photoUrl?:string|null;photo_caption?:string|null})=><article key={m.id} className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm"><p className="mb-1 text-xs text-muted-foreground">Day {m.day} · {new Date(m.created_at).toLocaleString()}</p>{m.body}{m.photoUrl&&<figure className="mt-3 space-y-2"><img className="w-full rounded-xl object-cover" src={m.photoUrl} alt={m.photo_caption??"Fictional trip photograph"} loading="lazy"/>{m.photo_caption&&<figcaption className="text-xs text-muted-foreground">{m.photo_caption}</figcaption>}</figure>}</article>)}</div>
 {["idea","proposed","accepted","in_progress"].includes(current.status)&&<div className="space-y-2 rounded-xl bg-muted/40 p-3"><p className="font-semibold">Add a stop</p><div className="grid grid-cols-2 gap-2"><input className={field} aria-label="Stop name" placeholder="Activity" value={stopTitle} onChange={e=>setStopTitle(e.target.value)}/><input className={field} aria-label="Stop location" placeholder="Place" value={stopPlace} onChange={e=>setStopPlace(e.target.value)}/><input className={field} type="number" min={1} max={90} aria-label="Trip day" value={day} onChange={e=>setDay(Number(e.target.value))}/><select className={field} aria-label="Stop category" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>{kinds.map(k=><option key={k}>{k}</option>)}</select></div><button className={btn} disabled={busy||!stopTitle.trim()||!stopPlace.trim()} onClick={()=>void action("add_stop")}>Add itinerary stop</button></div>}
 </section>}
 </main></Screen>;
}
