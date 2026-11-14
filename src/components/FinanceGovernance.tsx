import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { loadGovernance, saveGovernance } from "@/lib/finance-governance.functions";
import type { FinanceSnapshot } from "@/lib/finance";

const defaults = {
  handsOff:true,
  operatingManager:"Existing practice management",
  reportsTo:"Existing supervisory chain",
  independentHr:"Independent HR / designated representative",
};

export function FinanceGovernance({finances}:{finances:FinanceSnapshot}) {
  const load=useServerFn(loadGovernance);
  const save=useServerFn(saveGovernance);
  const qc=useQueryClient();
  const q=useQuery({queryKey:["finance-governance"],queryFn:()=>load(),retry:false});
  const businesses=finances.assets.filter(a=>a.owned&&a.category==="business");
  const [assetKey,setAssetKey]=useState("");
  const [draft,setDraft]=useState<typeof defaults|null>(null);
  const [busy,setBusy]=useState(false);
  const selected=businesses.find(b=>b.key===assetKey)??businesses[0];
  const saved=q.data?.find(p=>p.assetKey===selected?.key);
  const current=draft??(saved ? {
    handsOff:saved.handsOff,operatingManager:saved.operatingManager,
    reportsTo:saved.reportsTo,independentHr:saved.independentHr,
  }:defaults);
  const staffChangesAllowed=!saved?.handsOff;
  const policyText=selected ? `Fictional management policy for ${selected.label}: ${current.handsOff?
    "The owner is a passive, hands-off investor and does not supervise employees or make individual hiring, firing, pay, scheduling, disciplinary or performance decisions.":
    "The owner participates in management decisions under the usual fictional workplace rules."}
Daily operational decisions are delegated to: ${current.operatingManager}.
Staff report through: ${current.reportsTo}.
Conflicts involving the owner's personal relationships are referred to: ${current.independentHr}.
The owner is recused from individual employment decisions affecting a spouse or romantic partner.
This is an in-game policy summary, not an executed contract, confirmed appointment, or real-world employer agreement.`: "";
  async function commit() {
    if(!selected||busy)return;
    if(Object.values(current).some(v=>typeof v==="string"&&(v.trim().length<3||v.trim().length>120))) {
      toast.error("Use 3–120 characters for each reporting contact");return;
    }
    setBusy(true);
    try {
      const next=await save({data:{requestId:crypto.randomUUID(),assetKey:selected.key,...current}});
      qc.setQueryData(["finance-governance"],next);
      setDraft(null);
      toast.success("Fictional governance policy saved");
    }catch(e){toast.error(e instanceof Error?e.message:"Could not save policy");}
    finally{setBusy(false);}
  }
  return <section className="mt-7 space-y-3 rounded-2xl border bg-surface p-4">
    <h2 className="text-xl font-semibold">Ownership & management boundaries</h2>
    <p className="text-sm text-muted-foreground">Set an independent day-to-day reporting structure for each fictional business. This does not change any real employment arrangement.</p>
    {q.isLoading&&<p role="status">Loading ownership policies…</p>}
    {q.error&&<p role="alert" className="text-sm">Ownership controls need migration 0084. <button className="underline" type="button" onClick={()=>void q.refetch()}>Retry</button></p>}
    {q.data&& businesses.length===0&&<p className="text-sm">Purchase a business to set its ownership policy.</p>}
    {q.data&&selected&&<>
      <label htmlFor="governance-business" className="block text-xs font-medium">Business</label>
      <select id="governance-business" value={selected.key} onChange={e=>{setAssetKey(e.target.value);setDraft(null)}}
        className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm">
        {businesses.map(b=><option key={b.key} value={b.key}>{b.label}</option>)}
      </select>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={current.handsOff} onChange={e=>setDraft({...current,handsOff:e.target.checked})}/>
        <span><strong>Hands-off owner</strong> · delegate daily management and staff decisions</span>
      </label>
      {([["operatingManager","Day-to-day operating manager"],
        ["reportsTo","Who employees report to"],
        ["independentHr","Independent HR / conflict reviewer"]] as const).map(([field,label])=><div key={field}>
        <label htmlFor={"governance-"+field} className="block text-xs font-medium">{label}</label>
        <input id={"governance-"+field} value={current[field]} maxLength={120}
          onChange={e=>setDraft({...current,[field]:e.target.value})}
          className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm"/>
      </div>)}
      <p className="text-xs text-muted-foreground">Choose actual in-game manager and reviewer roles before presenting the policy as agreed. Generic placeholders do not appoint real people.</p>
      <button type="button" disabled={busy||!draft} onClick={()=>void commit()}
        className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40">
        Save ownership policy
      </button>
      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-semibold">View written reporting policy</summary>
        <p className="mt-2 whitespace-pre-line text-sm">{policyText}</p>
        <p className="mt-2 text-xs text-muted-foreground">Only a saved policy is active. This preview shows your current inputs, which may still be unsaved.</p>
      </details>
      <p className="text-xs text-muted-foreground">
        {saved?.handsOff?"Saved hands-off ownership: direct staff hiring, firing and salary edits are blocked by the database.":"No active hands-off restriction is saved for this business."}
        {!staffChangesAllowed?" Salary decisions must go through the fictional operating manager.":""}
        The policy is not automatically disclosed to characters.
      </p>
    </>}
  </section>;
}
