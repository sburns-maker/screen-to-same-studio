import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {toast} from "sonner";
import {money} from "@/lib/finance";
import {loadStudioSessions,updateStudioSession,type StudioSessionAction} from "@/lib/finance-studio-bookings.functions";

const services=[
 {key:"portrait" as const,label:"Portrait session",price:35000,cost:6000},
 {key:"family" as const,label:"Family / maternity",price:47500,cost:9500},
 {key:"branding" as const,label:"Commercial branding",price:80000,cost:17000},
 {key:"rental" as const,label:"Studio space rental",price:17500,cost:2500},
];
function addDays(iso:string,days:number){
 const d=new Date(iso+"T12:00:00Z");
 if(!Number.isFinite(d.getTime()))return iso;
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
}
export function PhotographyStudioBookings({ventureId,virtualDate}:{
 ventureId:string;virtualDate:string;
}){
 const load=useServerFn(loadStudioSessions);
 const update=useServerFn(updateStudioSession);
 const qc=useQueryClient();
 const q=useQuery({queryKey:["studio-sessions"],queryFn:()=>load(),retry:false});
 const [service,setService]=useState<(typeof services)[number]["key"]>("portrait");
 const [date,setDate]=useState("");
 const [pending,setPending]=useState(false);
 const sessions=(q.data??[]).filter(x=>x.ventureId===ventureId);
 const selected=services.find(x=>x.key===service)!;
 const validDate=(date||addDays(virtualDate,7))>virtualDate&&
  (date||addDays(virtualDate,7))<=addDays(virtualDate,90);
 async function action(data:StudioSessionAction){
  if(pending)return;
  if(data.action!=="schedule"&&!window.confirm(
    data.action==="cancel"?"Cancel this studio session? The simulated deposit will be released.":
    "Mark this session complete and recognize its revenue net of variable costs?"
  ))return;
  setPending(true);
  try{
   const result=await update({data});
   qc.setQueryData(["studio-sessions"],result);
   await qc.invalidateQueries({queryKey:["player-finances"]});
   toast.success("Studio booking updated");
  }catch(e){toast.error(e instanceof Error?e.message:"Booking action failed");}
  finally{setPending(false);}
 }
 return <section aria-label="Photo studio appointments" className="rounded-2xl border bg-surface p-4 space-y-3">
  <h4 className="font-semibold">Client sessions and bookings</h4>
  <p className="text-xs text-muted-foreground">Book additional in-game jobs separately from regular monthly walk-in business. Deposits remain held until completion; completed sessions contribute net revenue to studio company reserves. No real clients or payments are involved.</p>
  <div className="grid grid-cols-2 gap-3 text-sm">
   <div>Scheduled <strong className="block">{sessions.filter(s=>s.status==="scheduled").length}</strong></div>
   <div>Completed net revenue <strong className="block">{money(sessions.filter(s=>s.status==="completed").reduce((sum,s)=>sum+s.priceCents-s.costCents,0))}</strong></div>
  </div>
  {q.isLoading&&<p role="status" className="text-xs">Loading client session ledger…</p>}
  {q.isError&&<div role="alert" className="text-xs">Bookings require migration 0089.
    <button type="button" className="ml-2 underline" onClick={()=>void q.refetch()}>Retry</button>
   </div>}
  {q.data&&<>
   <label htmlFor="studio-service" className="block text-xs font-medium">Session package</label>
   <select id="studio-service" className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm" value={service}
    onChange={e=>setService(e.target.value as typeof service)}>
    {services.map(s=><option key={s.key} value={s.key}>{s.label} · {money(s.price)}</option>)}
   </select>
   <label htmlFor="studio-session-date" className="block text-xs font-medium">Appointment date (virtual financial calendar)</label>
   <input type="date" id="studio-session-date" min={addDays(virtualDate,1)} max={addDays(virtualDate,90)}
    value={date||addDays(virtualDate,7)} onChange={e=>setDate(e.target.value)}
    className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm"/>
   <p className="text-xs text-muted-foreground">Current virtual date: {virtualDate}. Session price {money(selected.price)}, deposit held {money(Math.floor(selected.price/4))}, estimated direct expense {money(selected.cost)}. Maximum three outstanding sessions per virtual day.</p>
   <button type="button" disabled={pending||!validDate} className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40"
    onClick={()=>void action({action:"schedule",requestId:crypto.randomUUID(),ventureId,
     service,virtualDate:date||addDays(virtualDate,7)})}>Book simulated session</button>
   <h5 className="text-sm font-semibold">Appointment ledger</h5>
   {!sessions.length&&<p className="text-xs text-muted-foreground">No bookings yet.</p>}
   {sessions.slice(0,30).map(s=><div className="space-y-2 rounded-xl border p-3" key={s.id}>
     <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-medium capitalize">{s.service} · {s.virtualDate}</p>
      <span className="text-xs capitalize">{s.status}</span>
     </div>
     <p className="text-xs text-muted-foreground">Price {money(s.priceCents)} · held deposit {money(s.depositCents)} · variable expenses {money(s.costCents)}</p>
     {s.status==="scheduled"&&<div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending||s.virtualDate>virtualDate}
       onClick={()=>void action({action:"complete",requestId:crypto.randomUUID(),ventureId,sessionId:s.id})}
       className="min-h-11 rounded-lg border px-3 text-xs disabled:opacity-40">Mark completed</button>
      <button type="button" disabled={pending||s.virtualDate<virtualDate}
       onClick={()=>void action({action:"cancel",requestId:crypto.randomUUID(),ventureId,sessionId:s.id})}
       className="min-h-11 rounded-lg border px-3 text-xs disabled:opacity-40">Cancel</button>
     </div>}
    </div>)}
  </>}
 </section>;
}
