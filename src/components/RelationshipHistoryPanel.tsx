import {useEffect,useMemo,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {relationshipHistory,type Evaluation} from "@/lib/relationship-history.functions";
import {isPhotoEvent,photoDecisionDetails} from "@/lib/photo-decision-details";
import {STATE_KEYS,type TessState} from "@/lib/tess-logic";
type Plan={id:string;title:string;status:string;date_local:string|null;starts_at:string|null;ends_at:string|null;place_key:string|null};
type Event={id:string;kind:string;summary:string;occurs_at:string;processed_at:string|null;payload?:unknown};
function PhotoEventDetails({e}:{e:Event}){
 const d=photoDecisionDetails(e);
 const row=(label:string,value:string|null)=>value?<div className="grid gap-0.5 sm:grid-cols-[9rem_1fr]"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="break-words text-sm">{value}</dd></div>:null;
 return <details className="mt-2 rounded-md border bg-muted/40 p-2"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm"><span>Decision details</span><span className="rounded-full border bg-background px-2 py-0.5 text-xs font-semibold">{d.statusLabel}</span></summary><dl className="mt-2 space-y-2">{row("Outcome",d.statusLabel)}{row("Why",d.reason)}{row("Triggered by",d.trigger??(d.legacy?"Not recorded for this older entry":null))}{row("Source",d.source)}{row("Current location",d.canonicalLocation??null)}{row("Requested scene",d.requestedScene??null)}{row("Validation rule",d.failedRule??null)}{row("Photo generation",d.generationRequested==="yes"?"A generation request was made":d.generationRequested==="no"?"No generation request":"Not recorded at this step")}{row(d.status==="failed"?"Failure reason":"Blocking reason",d.failure)}</dl>{d.legacy&&<p className="mt-2 text-xs text-muted-foreground">Recorded before detailed photo logging; only the saved fields are shown.</p>}</details>;
}
const localDay=(d:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(d));
function perspective(e:Evaluation):string {
 const d=e.delta??{};
 const increased=(k:string)=>Number(d[k]??0)>0;
 const decreased=(k:string)=>Number(d[k]??0)<0;
 const parts:string[]=[];
 if(increased("trust"))parts.push("I feel a little more able to trust this person.");
 if(increased("comfort"))parts.push("This conversation felt easier than before.");
 if(increased("playfulness"))parts.push("The playful side of our dynamic came through.");
 if(increased("emotional_intimacy"))parts.push("Something personal felt more connected.");
 if(increased("romantic_attraction"))parts.push("I noticed a change in attraction, but that doesn't decide anything.");
 if(increased("romantic_intent"))parts.push("I'm more open to pursuing something, though it's not a commitment.");
 if(increased("perceived_pressure")||increased("irritation"))parts.push("Part of the interaction felt uncomfortable or pressuring.");
 if(decreased("trust")||decreased("comfort"))parts.push("Something about the interaction left me less at ease.");
 if(!parts.length)parts.push("My feelings haven't shifted much from this interaction, at least in the saved simulation state.");
 return parts.slice(0,3).join(" ");
}
export function RelationshipHistoryPanel({conversationId,state,stage}:{conversationId:string;state?:TessState;stage?:string}){
 const get=useServerFn(relationshipHistory);
 const [data,setData]=useState<{evaluations:Evaluation[];events:Event[];plans:Plan[];historyUnavailable:boolean}|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [selected,setSelected]=useState(()=>localDay(new Date().toISOString()));
 const [showPerspective,setShowPerspective]=useState(false);
 useEffect(()=>{let alive=true;void get({data:{conversationId}}).then(r=>{if(alive){setData(r as {evaluations:Evaluation[];events:Event[];plans:Plan[];historyUnavailable:boolean});setError(null);}}).catch(e=>{if(alive)setError(e instanceof Error?e.message:"History unavailable");});return()=>{alive=false;};},[get,conversationId]);
 const dates=useMemo(()=>{
  if(!data)return [];
  const all=[...data.evaluations.map(e=>localDay(e.evaluated_at)),...data.events.map(e=>localDay(e.occurs_at)),...data.plans.map(p=>p.date_local??(p.starts_at?localDay(p.starts_at):""))].filter(Boolean);
  return [...new Set(all)].sort().reverse().slice(0,45);
 },[data]);
 const day=selected || localDay(new Date().toISOString());
 const evaluations=(data?.evaluations??[]).filter(e=>localDay(e.evaluated_at)===day);
 const events=(data?.events??[]).filter(e=>localDay(e.occurs_at)===day);
 const plans=(data?.plans??[]).filter(p=>(p.date_local??(p.starts_at?localDay(p.starts_at):""))===day);
 const totals=Object.fromEntries(STATE_KEYS.map(k=>[k,evaluations.reduce((sum,e)=>sum+Number(e.delta?.[k]??0),0)]));
 const changes=STATE_KEYS.filter(k=>totals[k]!==0).sort((a,b)=>Math.abs(totals[b]??0)-Math.abs(totals[a]??0));
 return <section className="mt-4 rounded-2xl bg-surface p-4" aria-label="Relationship history by day">
  <h3 className="font-semibold">Relationship history · by day</h3>
  <p className="mt-1 text-xs text-muted-foreground">Review recorded decisions, dates and interaction changes. Times are shown in Altoona's Eastern time zone. Older interactions cannot be reconstructed retroactively.</p>
  {error&&<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  {data?.historyUnavailable&&<p className="mt-2 rounded-lg border p-2 text-sm">Apply the relationship evaluation migration to activate the detailed history. Existing outings and world events still appear below.</p>}
  {!!dates.length&&<label className="mt-3 block text-xs font-medium">Select date<select value={day} onChange={e=>setSelected(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border bg-background p-2">{!dates.includes(day)&&<option value={day}>{day} · today / no records</option>}{dates.map(d=><option key={d} value={d}>{d}</option>)}</select></label>}
  {data&&!dates.length&&<p className="mt-3 text-sm text-muted-foreground">No dated events or evaluations recorded yet.</p>}
  {data&&!data.historyUnavailable&&data.evaluations.length===0&&<div role="status" className="mt-3 rounded-lg border border-amber-500/40 bg-background p-3 text-sm"><strong>Saved inner thoughts are not recording.</strong><p className="mt-1 text-muted-foreground">This conversation has no persisted relationship evaluations in the latest 250 records. The text displayed below is only a generic illustration, not the new conversation-specific feature. Check the server logs for [relationship-history] errors and verify the production database migration and server credentials.</p></div>}
  {data&&data.evaluations.length>0&&!evaluations.length&&<p className="mt-2 text-xs text-muted-foreground">No interaction evaluations saved for this selected day. Select a day with recorded interactions to see actual authored reflections.</p>}

  {!!day&&<>
   <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
    <div className="rounded-lg border bg-background p-2"><strong>{evaluations.length}</strong><p className="text-xs text-muted-foreground">evaluated interactions</p></div>
    <div className="rounded-lg border bg-background p-2"><strong>{plans.length}</strong><p className="text-xs text-muted-foreground">recorded plans</p></div>
   </div>
   {changes.length>0?<div className="mt-3"><h4 className="text-sm font-semibold">Recorded relationship changes</h4><div className="mt-2 flex flex-wrap gap-2">{changes.map(k=><span key={k} className="rounded-lg border bg-background px-2 py-1 text-xs">{k.replace(/_/g," ")} <strong>{(totals[k]??0)>0?"+":""}{totals[k]}</strong></span>)}</div></div>:<p className="mt-3 text-sm text-muted-foreground">No numerical relationship changes recorded for this date.</p>}
   {!!plans.length&&<div className="mt-4"><h4 className="font-semibold text-sm">Outings and plans</h4>{plans.map(p=><div key={p.id} className="mt-2 rounded-lg border bg-background p-3 text-sm"><strong>{p.title}</strong><p className="text-xs text-muted-foreground">Status: {p.status} · {p.place_key??"Place not recorded"}</p><p className="mt-1 text-xs text-muted-foreground">An invitation is not automatically a completed date; completion must be recorded.</p>{p.starts_at&&<p className="mt-1 text-xs text-muted-foreground">Evaluations recorded during this planned outing window: {evaluations.filter(e=>Date.parse(e.evaluated_at)>=Date.parse(p.starts_at!)&&Date.parse(e.evaluated_at)<=Date.parse(p.ends_at??new Date(Date.parse(p.starts_at!)+2*3600000).toISOString())).length}. Temporal overlap is not proof that the outing caused the change.</p>}</div>)}</div>}
   {!!events.length&&<div className="mt-4"><h4 className="font-semibold text-sm">World events</h4>{events.map(e=><div key={e.id} className="mt-2 rounded-lg border bg-background p-3 text-sm"><strong>{e.kind.replace(/_/g," ")}</strong><p className="break-words">{e.summary}</p><p className="text-xs text-muted-foreground">{new Date(e.occurs_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit",timeZone:"America/New_York"})} · {e.processed_at?"Recorded as processed":"Recorded, not marked processed"}</p>{isPhotoEvent(e.kind)&&<PhotoEventDetails e={e}/>}</div>)}</div>}
   {!!evaluations.length&&<div className="mt-4"><h4 className="font-semibold text-sm">Evaluated interactions</h4>{evaluations.map(e=><div key={e.id} className="mt-2 rounded-lg border bg-background p-3 text-sm"><div className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{e.source_kind.replace(/_/g," ")}</span><time dateTime={e.evaluated_at}>{new Date(e.evaluated_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit",timeZone:"America/New_York"})}</time></div><p className="mt-1">{e.context_summary??"Conversation evaluation"}</p><p className="mt-1 text-xs text-muted-foreground">{e.stage_before} → {e.stage_after} · {e.observed_tone??"tone unrecorded"}</p><div className="mt-1 flex flex-wrap gap-1">{Object.entries(e.delta??{}).filter(([,v])=>Number(v)!==0).map(([k,v])=><span key={k} className="text-xs">{k.replace(/_/g," ")} {Number(v)>0?"+":""}{v};</span>)}</div>{showPerspective&&<blockquote className="mt-2 rounded-lg bg-muted p-2 italic">{e.character_perspective?.trim() || perspective(e)}<p className="mt-2 text-xs not-italic text-muted-foreground">{e.character_perspective ? "Generated in-character perspective saved with this interaction" : "Fallback interpretation from recorded score changes"}</p></blockquote>}</div>)}</div>}
   <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={showPerspective} onChange={e=>setShowPerspective(e.target.checked)}/><span>Show fictional inner perspective <span className="block text-xs text-muted-foreground">An in-character interpretation generated from saved score changes, not the model's hidden thoughts or proof of actual intentions.</span></span></label>
   {showPerspective&&!evaluations.length&&<blockquote className="mt-3 rounded-xl border bg-background p-3 text-sm italic">
     {state ? (Number(state.comfort??0)>=75 && Number(state.romantic_intent??0)<25
       ? "I feel comfortable talking with this person, but I'm still deciding what kind of connection this is. I don't have to rush it."
       : Number(state.playfulness??0)>=50
       ? "I enjoy our playful conversations. I'm curious where things go, without making promises I haven't decided on."
       : "I'm taking this connection one conversation at a time. There isn't enough recorded here to explain a specific change today.")
     : "No evaluation is saved for this day. An example perspective will appear once relationship state is available."}
     <p className="mt-2 text-xs not-italic text-muted-foreground">Illustrative present-state reflection{stage?" · "+stage:""}. Not a saved diary entry or historical event.</p>
   </blockquote>}
  </>}
 </section>;
}
