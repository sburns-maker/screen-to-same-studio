import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { money } from "@/lib/finance";
import { loadPhotographyVentures,updatePhotographyVenture,type PhotographyVentureAction } from "@/lib/finance-ventures.functions";

const opportunities=[
 {path:"existing" as const,name:"Willow Light Portrait Studio",price:13500000,
  label:"Acquire an existing studio",detail:"Existing clients, equipment and a natural-light shooting room. Higher buy-in, proven monthly demand.",monthly:780000,cost:280000},
 {path:"lease" as const,name:"Market Street Creative Loft",price:650000,
  label:"Lease a starter studio",detail:"Refundable-like simulated deposit, flexible space and lower initial cost; rent is included in operating costs.",monthly:380000,cost:195000},
 {path:"build" as const,name:"Juniper & Light Photography",price:24000000,
  label:"Build and own a new studio",detail:"Purchase and renovate a dedicated storefront. Largest upfront commitment and strongest potential revenue.",monthly:950000,cost:330000},
];
const inspections=[
 {key:"books" as const,bit:1,title:"Review financial records",cost:25000,detail:"Seller history, cash flow, bookings and overhead"},
 {key:"space" as const,bit:2,title:"Inspect premises & equipment",cost:45000,detail:"Natural light, infrastructure, wear and needed repairs"},
 {key:"permits" as const,bit:4,title:"Check legal/lease assumptions",cost:15000,detail:"Business registration, permitted use and operating terms"},
];
const upgrades=[
 {key:"lighting" as const,bit:1,title:"Professional lighting",cost:185000},
 {key:"editing" as const,bit:2,title:"Editing workstation",cost:145000},
 {key:"interior" as const,bit:4,title:"Client lounge & backdrops",cost:250000},
 {key:"booking" as const,bit:8,title:"Online booking & website",cost:95000},
];
const stageLabel:Record<string,string>={
 research:"Due diligence",offer_pending:"Waiting on seller",
 offer_accepted:"Offer accepted",buildout:"Acquired — buildout",operating:"Studio operating",cancelled:"Cancelled",exited:"Sold / exited",
};
export function PhotographyStudioVentures(){
 const load=useServerFn(loadPhotographyVentures);
 const change=useServerFn(updatePhotographyVenture);
 const qc=useQueryClient();
 const q=useQuery({queryKey:["photography-ventures"],queryFn:()=>load(),retry:false});
 const [pending,setPending]=useState(false);
 const [offerDollars,setOfferDollars]=useState("");
 const [finance,setFinance]=useState<"cash"|"finance">("cash");
 const [style,setStyle]=useState<"portraits"|"hybrid"|"rental">("hybrid");
 const [customName,setCustomName]=useState("");
 const [showHistory,setShowHistory]=useState(false);
 const current=q.data?.ventures.find(v=>!(["cancelled","exited"].includes(v.stage)));
 const choice=opportunities.find(o=>o.path===current?.path);
 const costAfterClosing=current?.path==="lease"?65000:195000;
 const lowerOffer=current?Math.ceil(current.askingCents*0.85):0;
 const offered=Math.round(Number(offerDollars)*100);
 const priceNow=current?.settlementCents??current?.askingCents??0;
 const closingCosts=priceNow-(current?.financing==="finance"?Math.floor(priceNow*.75):0)+costAfterClosing;
 async function act(action:PhotographyVentureAction){
  if(pending)return;
  if(["close","start","cancel","launch","invite_sienna"].includes(action.action)&&
    !window.confirm(
      action.action==="start"?"Begin researching this fictional studio? No acquisition happens yet.":
      action.action==="close"?"Close on this fictional studio? You will pay the closing amount and may still need to renovate before it earns money.":
      action.action==="launch"?"Open the studio and begin simulated business settlements?":
      action.action==="invite_sienna"?"Tell Sienna about the creative opportunity in her character context? This does not mean she agreed.":
      "Cancel this acquisition? Research fees are not refunded."
    ))return;
  setPending(true);
  try{
   const data=await change({data:action});
   qc.setQueryData(["photography-ventures"],data);
   await qc.invalidateQueries({queryKey:["player-finances"]});
   setOfferDollars("");
   toast.success("Studio venture updated");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not update venture");}
  finally{setPending(false);}
 }
 function send(action:PhotographyVentureAction["action"],params:Record<string,unknown>={}){
  void act({action,requestId:crypto.randomUUID(),...(current?{ventureId:current.id}:{}),...params} as PhotographyVentureAction);
 }
 return <section aria-label="Photography studio ventures" className="mt-6 space-y-4">
  <div>
   <h2 className="font-display text-xl">Photography studio ventures</h2>
   <p className="mt-1 text-sm text-muted-foreground">
    Build a real in-game business rather than buying it instantly. Research, make an offer,
    close, equip the studio, open for bookings and manage ongoing growth.
    Sienna is free to accept or decline any creative involvement.
   </p>
  </div>
  {q.isLoading&&<p role="status" className="rounded-xl border p-3 text-sm">Loading venture records…</p>}
  {q.isError&&<div role="alert" className="rounded-xl border p-3 text-sm">
    Photography studios require Lovable to apply migration 0088 before deployment.
    <button type="button" className="ml-2 underline" onClick={()=>void q.refetch()}>Retry</button>
   </div>}
  {q.data&&!current&&<div className="space-y-3">
   <label htmlFor="studio-custom-name" className="block text-sm font-medium">Your studio brand (optional)</label>
   <input id="studio-custom-name" maxLength={80} value={customName} onChange={e=>setCustomName(e.target.value)}
     placeholder="Choose the studio name" className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm"/>
   {opportunities.map(o=><div key={o.path} className="rounded-2xl border bg-surface p-4 space-y-2">
     <div className="flex items-start justify-between gap-3">
      <h3 className="font-semibold">{o.label}</h3><strong className="whitespace-nowrap text-sm">{money(o.price)}</strong>
     </div>
     <p className="text-sm">{o.name}</p>
     <p className="text-xs text-muted-foreground">{o.detail}</p>
     <p className="text-xs">Projected monthly revenue {money(o.monthly)} · operating costs {money(o.cost)} before upgrades and financing</p>
     <button type="button" className="min-h-11 rounded-xl border px-4 text-sm font-semibold"
      disabled={pending} onClick={()=>send("start",{path:o.path,name:customName.trim()||o.name})}>Explore this opportunity</button>
   </div>)}
  </div>}
  {current&&<div className="space-y-4">
   <div className="rounded-2xl border bg-surface p-4 space-y-2">
    <div className="flex items-start justify-between gap-2">
     <div><h3 className="font-semibold">{current.name}</h3>
      <p className="text-xs text-muted-foreground">{choice?.label} · {stageLabel[current.stage]}</p></div>
     <span className="rounded-full border px-2 py-1 text-xs">{current.path}</span>
    </div>
    <div className="grid grid-cols-2 gap-3 text-sm">
     <div>Asking price <strong className="block">{money(current.askingCents)}</strong></div>
     <div>Monthly revenue potential <strong className="block">{money(current.revenueCents)}</strong></div>
     <div>Monthly overhead <strong className="block">{money(current.costCents)}</strong></div>
     <div>Seller's agreed price <strong className="block">{current.settlementCents==null?"Not yet negotiated":money(current.settlementCents)}</strong></div>
    </div>
    <p className="text-xs text-muted-foreground">Projections are in-game estimates. Payroll, loan repayment, demand variation and upgrades affect actual operating results.</p>
   </div>
   {current.stage==="research"&&<div className="rounded-2xl border bg-surface p-4 space-y-3">
    <h4 className="font-semibold">1. Due diligence</h4>
    <p className="text-xs text-muted-foreground">Complete all three independent reviews before making an offer. Research fees are paid once and are nonrefundable.</p>
    {inspections.map(c=><div key={c.key} className="flex items-center justify-between gap-3 rounded-xl border p-3">
      <div><p className="text-sm font-medium">{c.title}</p><p className="text-xs text-muted-foreground">{c.detail} · {money(c.cost)}</p></div>
      <button type="button" disabled={pending||!!(current.inspectionFlags&c.bit)} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
       onClick={()=>send("inspect",{check:c.key})}>{current.inspectionFlags&c.bit?"Reviewed":"Review"}</button>
     </div>)}
    {current.inspectionFlags===7&&<>
      <label className="block text-sm font-medium" htmlFor="studio-offer-price">Your purchase offer ($)</label>
      <input id="studio-offer-price" type="number" step="100" min={lowerOffer/100} max={current.askingCents/100}
       value={offerDollars} onChange={e=>setOfferDollars(e.target.value)}
       placeholder={String(current.askingCents/100)} className="min-h-11 w-full rounded-lg border bg-background px-3"/>
      <label htmlFor="studio-financing" className="block text-sm font-medium">Closing funding</label>
      <select id="studio-financing" value={finance} onChange={e=>setFinance(e.target.value as "cash"|"finance")}
       className="min-h-11 w-full rounded-lg border bg-background px-3" disabled={current.path==="lease"}>
       <option value="cash">Cash</option>{current.path!=="lease"&&<option value="finance">25% down, 75% financed over 10 virtual years</option>}
      </select>
      <p className="text-xs text-muted-foreground">Allowed offer: {money(lowerOffer)}–{money(current.askingCents)}. Seller may counter. After submitting, the seller responds in two virtual days, not instantly.</p>
      <button type="button" disabled={pending||!Number.isSafeInteger(offered)||offered<lowerOffer||offered>current.askingCents}
       onClick={()=>send("offer",{offerCents:offered,financing:current.path==="lease"?"cash":finance})}
       className="min-h-11 rounded-xl border px-4 font-semibold disabled:opacity-40">Submit purchase offer</button>
     </>}
   </div>}
   {current.stage==="offer_pending"&&<div className="rounded-2xl border bg-surface p-4 space-y-3">
     <h4 className="font-semibold">2. Seller reviewing offer</h4>
     <p className="text-sm">Your offer: {money(current.offerCents??0)}</p>
     <p className="text-xs text-muted-foreground">Response expected on virtual date {current.offerDueVirtual}. The offer expires on {current.offerExpiresVirtual}. Your financial clock advances seven virtual days per real day.</p>
     <button type="button" disabled={pending} className="min-h-11 rounded-xl border px-4 text-sm font-semibold" onClick={()=>send("respond")}>Check seller's decision</button>
   </div>}
   {current.stage==="offer_accepted"&&<div className="rounded-2xl border bg-surface p-4 space-y-3">
     <h4 className="font-semibold">3. Closing</h4>
     <p className="text-sm">Agreed deal price: <strong>{money(current.settlementCents??0)}</strong></p>
     <p className="text-sm">Cash required at closing including fees: <strong>{money(closingCosts)}</strong></p>
     <p className="text-xs text-muted-foreground">Financing: {current.financing}. Closing creates a real fictional asset. The studio will not earn revenue until equipped and launched.</p>
     <button type="button" disabled={pending} className="min-h-11 rounded-xl border px-4 font-semibold" onClick={()=>send("close")}>Close acquisition</button>
   </div>}
   {["buildout","operating"].includes(current.stage)&&<div className="rounded-2xl border bg-surface p-4 space-y-3">
     <h4 className="font-semibold">{current.stage==="operating"?"Upgrade the operating studio":"4. Build out the studio"}</h4>
     <p className="text-xs text-muted-foreground">Each purchase improves the working space and future turnover. Lighting and booking are required before opening.</p>
     {upgrades.map(u=><div key={u.key} className="flex items-center justify-between gap-2 rounded-xl border p-3">
       <div><p className="text-sm font-medium">{u.title}</p><p className="text-xs text-muted-foreground">{money(u.cost)} one-time</p></div>
       <button type="button" disabled={pending||!!(current.buildoutFlags&u.bit)} onClick={()=>send("upgrade",{upgrade:u.key})}
        className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-40">{current.buildoutFlags&u.bit?"Installed":"Install"}</button>
      </div>)}
     {current.stage==="buildout"&&<>
      <label htmlFor="studio-model" className="block text-sm font-medium">Select primary revenue model</label>
      <select id="studio-model" value={style} onChange={e=>setStyle(e.target.value as typeof style)}
       className="min-h-11 w-full rounded-lg border bg-background px-3">
       <option value="portraits">Portraits, family and couples</option>
       <option value="hybrid">Portrait sessions + rental bookings</option>
       <option value="rental">Creator studio rentals</option>
      </select>
      <button type="button" disabled={pending||(current.buildoutFlags&9)!==9} onClick={()=>send("launch",{style})}
       className="min-h-11 rounded-xl border px-4 font-semibold disabled:opacity-40">Launch the studio</button>
     </>}
     {current.stage==="operating"&&<>
      <p className="text-sm">Operating model: <strong>{current.style}</strong> · active marketing campaigns: {current.marketingLevel}/3</p>
      <p className="text-xs text-muted-foreground">Operations settle in Finances with owner draws and monthly revenue/cost fluctuations. Marketing adds both turnover and permanent ad spend.</p>
      <button type="button" disabled={pending||current.marketingLevel>=3}
       onClick={()=>send("market")} className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40">
       Invest in local marketing ({current.marketingLevel}/3)
      </button>
     </>}
   </div>}
   <div className="rounded-2xl border bg-surface p-4 space-y-2">
    <h4 className="font-semibold">Sienna's role and independence</h4>
    <p className="text-sm">Your idea is to let Sienna pursue photography creatively while you handle capital and administrative support. This is a proposal, not a job assignment or her consent.</p>
    <p className="text-xs text-muted-foreground">Discussion: {current.siennaInvolvement==="invited"?"Invitation recorded; no acceptance presumed":"Not yet discussed"}</p>
    <button type="button" disabled={pending||current.siennaInvolvement!=="not_discussed"}
     className="min-h-11 rounded-xl border px-4 text-sm disabled:opacity-40"
     onClick={()=>send("invite_sienna")}>Tell Sienna about the studio idea</button>
    <p className="text-xs text-muted-foreground">This tells her character about the proposal; she can discuss it in conversation. No payroll or co-ownership is created, and the character decides how she feels about it.</p>
   </div>
   {["research","offer_pending","offer_accepted"].includes(current.stage)&&
    <button type="button" disabled={pending} onClick={()=>send("cancel")}
     className="min-h-11 rounded-xl border px-4 text-sm">Walk away from this deal</button>}
  </div>}
  {q.data&&<div className="rounded-xl border p-3">
    <button type="button" className="w-full min-h-11 text-left text-sm font-semibold" aria-expanded={showHistory}
     onClick={()=>setShowHistory(v=>!v)}>Venture activity history {showHistory?"▴":"▾"}</button>
    {showHistory&&<div className="space-y-2">
     {q.data.events.map((e,i)=><div key={i} className="border-t py-2 text-xs">
       <strong>{e.type.replaceAll("_"," ")}</strong> {e.costCents>0&&<span> · {money(e.costCents)}</span>}
       <p className="mt-1 text-muted-foreground">{e.detail}</p>
      </div>)}
     {!q.data.events.length&&<p className="text-xs text-muted-foreground">No venture activity yet.</p>}
    </div>}
   </div>}
 </section>;
}
