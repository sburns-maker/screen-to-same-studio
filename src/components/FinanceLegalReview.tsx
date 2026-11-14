import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { loadFinanceReview,provideFinanceAgreement,finalizeFinanceEquity } from "@/lib/finance-review.functions";

/** Reviewable written boundaries + source-backed co-ownership, never unilateral consent. */
export function FinanceLegalReview({assetKey,assetLabel,characterKey,handsOff}:{
  assetKey:string;assetLabel:string;characterKey:string;handsOff:boolean;
}) {
  const load=useServerFn(loadFinanceReview);
  const provide=useServerFn(provideFinanceAgreement);
  const finalize=useServerFn(finalizeFinanceEquity);
  const qc=useQueryClient();
  const q=useQuery({queryKey:["finance-review"],queryFn:()=>load(),retry:false});
  const [pending,setPending]=useState(false);
  const doc=q.data?.agreements.find(d=>d.assetKey===assetKey&&d.characterKey===characterKey);
  const offer=q.data?.offers.find(o=>o.assetKey===assetKey&&o.characterKey===characterKey&&
    ["character_accepted","pending"].includes(o.status));
  const stake=q.data?.stakes.find(st=>st.assetKey===assetKey);
  const eligible=offer?.status==="character_accepted"&&doc?.status==="acknowledged"&&
    handsOff&&!stake;
  async function deliver() {
    if(!handsOff||pending)return;
    if(!window.confirm("Give this character the written fictional reporting policy for review? It does not compel acceptance or transfer ownership."))return;
    setPending(true);
    try {
      const next=await provide({data:{requestId:crypto.randomUUID(),assetKey,
        characterKey:characterKey as "tess"|"maya"|"claire"|"jordan"|"ben"|"sienna"|"kendra"|"riley"|"carly"|"brooke"|"jade"|"nina"}});
      qc.setQueryData(["finance-review"],next);
      toast.success("Written boundaries provided for independent character review");
    } catch(e){toast.error(e instanceof Error?e.message:"Unable to deliver policy");}
    finally{setPending(false);}
  }
  async function confirmTransfer() {
    if(!eligible||!offer||pending)return;
    if(!window.confirm("Finalize 50% fictional co-ownership? The character has explicitly accepted. Future owner draws will be split evenly and you cannot sell the business unilaterally."))return;
    setPending(true);
    try {
      const next=await finalize({data:{requestId:crypto.randomUUID(),offerId:offer.offerId}});
      qc.setQueryData(["finance-review"],next);
      await qc.invalidateQueries({queryKey:["player-finances"]});
      toast.success("50% fictional equity recorded, with shared distributions");
    }catch(e){toast.error(e instanceof Error?e.message:"Equity was not transferred");}
    finally{setPending(false);}
  }
  return <section className="space-y-3 rounded-xl border p-3">
    <h3 className="text-sm font-semibold">Written employment boundaries</h3>
    <p className="text-xs text-muted-foreground">The agreement is independent of any ownership offer. Only the recipient can acknowledge it in their own conversation; clicking Deliver does not approve it for them.</p>
    {q.isLoading&&<p role="status" className="text-xs">Loading document and equity status…</p>}
    {q.error&&<div role="alert" className="text-xs">Agreement review requires migration 0086. <button type="button" className="underline" onClick={()=>void q.refetch()}>Retry</button></div>}
    {q.data&&<>
      <p className="text-sm">For: <strong>{characterKey.charAt(0).toUpperCase()+characterKey.slice(1)}</strong> · {assetLabel}</p>
      <p className="text-sm">Agreement: <strong>{doc?.status.replaceAll("_"," ")??"Not provided"}</strong></p>
      {!doc&&<p className="text-xs text-muted-foreground">Tess's request will remain open until she reviews the written boundaries. A text reassurance alone doesn't count.</p>}
      {(doc?.status==="delivered"||doc?.status==="revision_requested")&&
        <p className="text-xs text-muted-foreground">Awaiting a genuine response. She may ask for changes or take time to review the document.</p>}
      {doc?.status==="acknowledged"&&<p className="text-xs text-muted-foreground">Boundaries acknowledged. The character won't be prompted to repeat this unresolved request unless the governance changes.</p>}
      {doc?.status==="needs_revision"&&<p className="text-xs text-muted-foreground">The management policy changed; send the revised terms before expecting a new acknowledgment.</p>}
      {doc&&<details className="rounded-lg border p-2"><summary className="cursor-pointer text-xs font-semibold">Read the delivered written agreement</summary><p className="mt-2 text-xs whitespace-pre-line">{doc.policyText}</p></details>}
      <button type="button" disabled={pending||!handsOff||!!stake}
        onClick={()=>void deliver()} className="min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-40">
        {doc?"Deliver updated agreement":"Deliver written agreement"}
      </button>
      {stake&&<p className="text-sm font-semibold">Recorded equity: {stake.percent}% for {stake.characterKey}. Character's accumulated distributions: {(stake.partnerBalanceCents/100).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0})}.</p>}
      {offer&&<details className="rounded-lg border p-2"><summary className="cursor-pointer text-xs font-semibold">Read 50% ownership terms and risks</summary><p className="mt-2 whitespace-pre-line text-xs">{offer.termsText}</p></details>}
      {offer?.status==="character_accepted"&&!stake&&<p className="text-sm">This character explicitly accepted the 50% offer. Final confirmation is now available only if the independent agreement is acknowledged and hands-off governance is active.</p>}
      {offer?.status==="pending"&&<p className="text-xs text-muted-foreground">The ownership proposal is still awaiting the character's decision. Their agreement to employment boundaries alone does not count.</p>}
      {!stake&&<button type="button" disabled={!eligible||pending} onClick={()=>void confirmTransfer()}
        className="min-h-11 rounded-lg border px-3 text-sm font-semibold disabled:opacity-40">
        Finalize mutually agreed 50% ownership
      </button>}
      <p className="text-xs text-muted-foreground">The agreement and equity transfer are fictional game records, not legal signatures or transfers of real companies. Shares and distributions must never change without recorded character acceptance and a player confirmation.</p>
    </>}
  </section>;
}
