import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { experienceSnapshot, experienceAction } from "@/lib/living-experiences.functions";
export const Route=createFileRoute("/_authenticated/experiences")({component:Experiences});
type Snapshot=Awaited<ReturnType<typeof experienceSnapshot>>;
function Experiences(){
 const load=useServerFn(experienceSnapshot), act=useServerFn(experienceAction);
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState("");
 async function refresh(){try{setData(await load());}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void refresh();},[]);
 async function action(planId:string,command:"claim"|"pause"|"resume",revision:number|null){
  setBusy(planId);setError("");
  try{await act({data:{planId,action:command,revision}});await refresh();}
  catch(e){setError((e as Error).message);}
  finally{setBusy("");}
 }
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
    {e?.summary&&<p className="text-sm">{e.summary}</p>}
   </article>;
  })}
  <p className="text-xs text-muted-foreground">Early preview: immersive character dialogue and off-screen completion are not enabled yet. Only claim/pause/resume are available.</p>
  <Link to="/plans" className="text-sm underline">Back to Plans</Link>
 </div></Screen></>;
}
