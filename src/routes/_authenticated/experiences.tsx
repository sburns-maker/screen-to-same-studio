import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { experienceSnapshot, experienceAction, experienceMoments, recordExperienceMoment, completeExperience } from "@/lib/living-experiences.functions";
export const Route=createFileRoute("/_authenticated/experiences")({component:Experiences});
type Snapshot=Awaited<ReturnType<typeof experienceSnapshot>>;
function Experiences(){
 const load=useServerFn(experienceSnapshot), act=useServerFn(experienceAction);
 const readMoments=useServerFn(experienceMoments), recordMoment=useServerFn(recordExperienceMoment), complete=useServerFn(completeExperience);
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState("");
 const [activePlan,setActivePlan]=useState(""),[text,setText]=useState(""),[history,setHistory]=useState<Array<{id:string;ordinal:number;body:string;source:string}>>([]);
 async function refresh(){try{setData(await load());}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void refresh();},[]);
 async function action(planId:string,command:"claim"|"pause"|"resume",revision:number|null){
  setBusy(planId);setError("");
  try{await act({data:{planId,action:command,revision}});await refresh();}
  catch(e){setError((e as Error).message);}
  finally{setBusy("");}
 }
 async function openScene(planId:string){setActivePlan(planId);try{const h=await readMoments({data:{planId}});setHistory(h.moments as typeof history);}catch(e){setError((e as Error).message);}}
 async function sendMoment(){if(!activePlan||!text.trim())return;setBusy(activePlan);try{await recordMoment({data:{planId:activePlan,id:crypto.randomUUID(),text:text.trim()}});setText("");await openScene(activePlan);}catch(e){setError((e as Error).message);}finally{setBusy("");}}
 async function finishScene(planId:string,revision:number){if(!window.confirm("Finish this experience and preserve the recorded moments? No further interaction will be possible."))return;setBusy(planId);try{const transcript=history.map(x=>x.body).join("; ");const summary=("Shared experience: "+transcript).slice(0,1200);await complete({data:{planId,revision,outcomeId:crypto.randomUUID(),summary}});setActivePlan("");await refresh();}catch(e){setError((e as Error).message);}finally{setBusy("");}}
 const entries=(data?.scenes??[]) as Array<{plan_id:string;state:string;revision:number;summary:string}>;
 return <><ScreenHeader title="Living Experiences" backTo="/plans"/><Screen><div className="space-y-4 pb-10">
  <h1 className="font-display text-2xl">Live the moments that matter</h1>
  <p className="text-sm text-muted-foreground">Start within four hours of the planned time. Once started, your experience is protected from automatic simulation—even if you close the app. Pause and resume whenever you like.</p>
  {error&&<p role="alert" className="rounded-xl border border-destructive p-3 text-sm">{error}</p>}
  {!data?<p>Loading…</p>:data.plans.filter(p=>p.starts_at).map(p=>{
   const e=entries.find(x=>x.plan_id===p.id);
   const start=Date.parse(p.starts_at!);const now=Date.now();
   const eligible=!e&&now>=start&&now<start+4*3600000;
   return <article key={p.id} className="rounded-2xl border bg-surface p-4 space-y-2">
    <h2 className="font-semibold">{p.title}</h2>
    <p className="text-sm text-muted-foreground">{new Date(start).toLocaleString()} · {p.place_key??"Venue undecided"}</p>
    <p className="text-sm">Experience: {e?.state??(eligible?"Ready to start":"Scheduled")}</p>
    {eligible&&<button disabled={busy===p.id} onClick={()=>void action(p.id,"claim",null)} className="rounded-full bg-primary px-4 py-3 text-primary-foreground">Start experience</button>}
    {e?.state==="interactive"&&<button disabled={busy===p.id} onClick={()=>void action(p.id,"pause",e.revision)} className="rounded-full border px-4 py-3">Pause experience</button>}
    {e?.state==="paused"&&<button disabled={busy===p.id} onClick={()=>void action(p.id,"resume",e.revision)} className="rounded-full bg-primary px-4 py-3 text-primary-foreground">Resume experience</button>}
    {e?.state==="interactive"&&<button className="rounded-full border px-4 py-3" onClick={()=>void openScene(p.id)}>Open experience journal</button>}
    {e?.summary&&<p className="text-sm">{e.summary}</p>}
   </article>;
  })}
  {activePlan&&<section className="rounded-2xl border p-4 space-y-3"><h2 className="font-semibold">Shared moments journal</h2><p className="text-xs text-muted-foreground">This securely records what you actually did. Interactive character replies are not connected yet. No actions are invented.</p>{history.map(m=><p key={m.id} className="rounded-xl bg-surface p-3 text-sm">{m.body}</p>)}<textarea aria-label="What happened" value={text} onChange={e=>setText(e.target.value)} className="w-full rounded-xl border bg-background p-3" placeholder="Describe what you said or did…" maxLength={1500}/><button disabled={!text.trim()||busy===activePlan} onClick={()=>void sendMoment()} className="rounded-full bg-primary px-4 py-3 text-primary-foreground">Record moment</button><button className="ml-2 rounded-full border px-4 py-3" onClick={()=>setActivePlan("")}>Close journal</button>{history.length>0&&<button onClick={()=>void finishScene(activePlan,entries.find(x=>x.plan_id===activePlan)?.revision??0)} className="block rounded-full border px-4 py-3">Finish journal</button>}</section>}
  <p className="text-xs text-muted-foreground">Early preview: immersive character dialogue and off-screen completion are not enabled yet. Only claim/pause/resume are available.</p>
  <Link to="/plans" className="text-sm underline">Back to Plans</Link>
 </div></Screen></>;
}
