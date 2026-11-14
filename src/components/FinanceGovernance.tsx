import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { loadGovernance, saveGovernance } from "@/lib/finance-governance.functions";
import type { FinanceSnapshot } from "@/lib/finance";
import { loadEquityOffers, updateEquityOffer } from "@/lib/finance-equity.functions";
import { FinanceLegalReview } from "./FinanceLegalReview";

const defaults = {
  handsOff:true,
  operatingManager:"Existing practice management",
  reportsTo:"Existing supervisory chain",
  independentHr:"Independent HR / designated representative",
};

export function FinanceGovernance({finances}:{finances:FinanceSnapshot}) {
  const load=useServerFn(loadGovernance);
  const save=useServerFn(saveGovernance);
  const offersLoad=useServerFn(loadEquityOffers);
  const offerAction=useServerFn(updateEquityOffer);
  const qc=useQueryClient();
  const q=useQuery({queryKey:["finance-governance"],queryFn:()=>load(),retry:false});
  const oq=useQuery({queryKey:["finance-equity-offers"],queryFn:()=>offersLoad(),retry:false});
  const businesses=finances.assets.filter(a=>a.owned&&a.category==="business");
  const [assetKey,setAssetKey]=useState("");
  const [draft,setDraft]=useState<typeof defaults|null>(null);
  const [busy,setBusy]=useState(false);
  const [recipient,setRecipient]=useState<"tess"|"claire"|"riley"|"jordan"|"carly"|"brooke"|"kendra"|"nina"|"maya"|"sienna"|"jade"|"ben">("tess");
  const selected=businesses.find(b=>b.key===assetKey)??businesses[0];
  const saved=q.data?.find(p=>p.assetKey===selected?.key);
  const current=draft??(saved ? {
    handsOff:saved.handsOff,operatingManager:saved.operatingManager,
    reportsTo:saved.reportsTo,independentHr:saved.independentHr,
  }:defaults);
  const staffChangesAllowed=!saved?.handsOff;
  const pendingOffer=oq.data?.find(o=>o.assetKey===selected?.key&&o.characterKey===recipient&&["pending","character_accepted"].includes(o.status));
  const policyText=selected ? `Fictional management policy for ${selected.label}: ${current.handsOff?
    "The owner is a passive, hands-off investor and does not supervise employees or make individual hiring, firing, pay, scheduling, disciplinary or performance decisions.":
    "The owner participates in management decisions under the usual fictional workplace rules."}
Daily operational decisions are delegated to: ${current.operatingManager}.
Staff report through: ${current.reportsTo}.
Conflicts involving the owner's personal relationships are referred to: ${current.independentHr}.
The owner is recused from individual employment decisions affecting a spouse or romantic partner.
This is an in-game policy summary, not an executed contract, confirmed appointment, or real-world employer agreement.`: "";
  async function proposeHalf() {
    if(!selected||busy||!saved?.handsOff||pendingOffer)return;
    if(!window.confirm("Offer 50% fictional co-ownership to this character? This creates only a pending proposal; NO equity changes."))return;
    setBusy(true);
    try {
      const updated=await offerAction({data:{action:"offer_half",assetKey:selected.key,characterKey:recipient,requestId:crypto.randomUUID()}});
      qc.setQueryData(["finance-equity-offers"],updated);
      toast.success("Voluntary 50% co-ownership offer recorded; awaiting the character's decision");
    } catch(e){toast.error(e instanceof Error?e.message:"Offer failed");}
    finally{setBusy(false);}
  }
  async function withdrawHalf() {
    if(!pendingOffer||busy)return;
    setBusy(true);
    try {
      const updated=await offerAction({data:{action:"withdraw",offerId:pendingOffer.offerId,requestId:crypto.randomUUID()}});
      qc.setQueryData(["finance-equity-offers"],updated);
      toast.success("Offer withdrawn; business ownership unchanged");
    }catch(e){toast.error(e instanceof Error?e.message:"Offer could not be withdrawn");}
    finally{setBusy(false);}
  }
  async function copyPolicy() {
    try {await navigator.clipboard.writeText(policyText);toast.success("Policy copied");}
    catch {toast.error("Copy unavailable; select the text from the policy preview");}
  }
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
      <section className="rounded-xl border p-3 space-y-2">
        <h3 className="text-sm font-semibold">Optional 50% co-ownership</h3>
        <p className="text-xs text-muted-foreground">Make an offer, not an assignment. The recipient may accept, decline, request changes, or take time. Marriage never counts as consent. This does not issue legal ownership or transfer any simulated equity.</p>
        <label className="block text-xs font-medium" htmlFor="coowner-recipient">Person to offer ownership to</label>
        <select id="coowner-recipient" value={recipient} onChange={e=>setRecipient(e.target.value as typeof recipient)}
          className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm">
          {["tess","claire","riley","jordan","carly","brooke","kendra","nina","maya","sienna","jade","ben"].map(key=><option key={key} value={key}>{key.charAt(0).toUpperCase()+key.slice(1)}</option>)}
        </select>
        {pendingOffer ? <>
          <p className="text-sm font-medium">{pendingOffer.status==="character_accepted"?"Character has accepted · awaiting your confirmation":"Pending offer · 50% · awaiting a decision"}</p>
          <button type="button" disabled={busy} onClick={()=>void withdrawHalf()}
            className="min-h-11 rounded-lg border px-3 text-sm">Withdraw offer</button>
        </> : <button type="button" disabled={busy||!saved?.handsOff||!!oq.error}
            onClick={()=>void proposeHalf()} className="min-h-11 rounded-lg border px-3 text-sm font-medium">
            Propose equal co-ownership
          </button>}
        {!saved?.handsOff&&<p className="text-xs text-muted-foreground">Save a hands-off ownership policy first so management boundaries remain independent of the offer.</p>}
        {oq.error&&<p role="alert" className="text-xs text-muted-foreground">Co-ownership offers require migration 0085.</p>}
        <p className="text-xs text-muted-foreground">A pending offer is a topic your character can discuss; it is not proof of acceptance, a signed contract, or a transfer of any shares. A separate mutual agreement process is required before actual in-game co-ownership is activated.</p>
      </section>
      <button type="button" className="min-h-11 rounded-lg border px-3 text-sm" onClick={()=>void copyPolicy()}>Copy written policy</button>
      <FinanceLegalReview assetKey={selected.key} assetLabel={selected.label} characterKey={recipient} handsOff={!!saved?.handsOff}/>
      <p className="text-xs text-muted-foreground">
        {saved?.handsOff?"Saved hands-off ownership: direct staff hiring, firing and salary edits are blocked by the database.":"No active hands-off restriction is saved for this business."}
        {!staffChangesAllowed?" Salary decisions must go through the fictional operating manager.":""}
        The policy is not automatically disclosed to characters.
      </p>
    </>}
  </section>;
}
