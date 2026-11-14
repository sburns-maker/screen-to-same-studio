import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { loadFinanceFunds, tradeFinanceFund, type VirtualFund } from "@/lib/finance-investments.functions";
import { money, type FinanceSnapshot } from "@/lib/finance";

export function FinanceInvestments({finances}:{finances:FinanceSnapshot}) {
  const load=useServerFn(loadFinanceFunds),trade=useServerFn(tradeFinanceFund);
  const qc=useQueryClient();
  const q=useQuery({queryKey:["finance-funds"],queryFn:()=>load(),retry:false});
  const [fund,setFund]=useState<VirtualFund["key"]>("broad_market");
  const [side,setSide]=useState<"buy"|"sell">("buy");
  const [amount,setAmount]=useState("");
  const [pending,setPending]=useState(false);
  const selected=q.data?.find(f=>f.key===fund);
  const cents=Math.round(Number(amount)*100);
  const valid=amount.trim()!==""&&Number.isSafeInteger(cents)&&cents>0&&
    cents <= (side==="buy"?finances.cashCents:(selected?.balanceCents??0));
  async function submit() {
    if(!valid||pending||!window.confirm("Confirm this entirely fictional investment transfer?"))return;
    setPending(true);
    try{
      const updated=await trade({data:{requestId:crypto.randomUUID(),fund,side,amountCents:cents}});
      qc.setQueryData(["finance-funds"],updated);
      await qc.invalidateQueries({queryKey:["player-finances"]});
      setAmount("");
      toast.success("Virtual investment trade recorded");
    }catch(e){toast.error(e instanceof Error?e.message:"Trade failed");}
    finally{setPending(false);}
  }
  return <section className="mt-7 space-y-3 rounded-2xl border bg-surface p-4">
    <h2 className="font-semibold text-xl">Investment portfolio</h2>
    <p className="text-xs text-muted-foreground">These are simulated investment funds, not real securities or financial advice. Returns vary once per completed virtual month; trades use your fictional personal cash.</p>
    {q.isLoading&&<p role="status">Loading your investment funds…</p>}
    {q.error&&<p role="alert" className="text-sm">Investment accounts require migration 0082. <button type="button" className="underline" onClick={()=>void q.refetch()}>Retry</button></p>}
    {q.data&&<>
      <div className="space-y-2">{q.data.map(f=><div className="flex justify-between gap-3 text-sm" key={f.key}><span>{f.label}</span><strong>{money(f.balanceCents)}</strong></div>)}</div>
      <label className="block text-xs font-semibold" htmlFor="finance-investment-fund">Fund</label>
      <select id="finance-investment-fund" value={fund} onChange={e=>setFund(e.target.value as VirtualFund["key"])}
        className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm">{q.data.map(f=><option value={f.key} key={f.key}>{f.label}</option>)}</select>
      <label className="block text-xs font-semibold" htmlFor="finance-investment-side">Trade</label>
      <select id="finance-investment-side" value={side} onChange={e=>setSide(e.target.value as "buy"|"sell")}
        className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm">
        <option value="buy">Buy with personal cash</option><option value="sell">Sell into personal cash</option>
      </select>
      <label className="block text-xs font-semibold" htmlFor="finance-investment-amount">Amount ($)</label>
      <input id="finance-investment-amount" value={amount} onChange={e=>setAmount(e.target.value)}
        type="number" min="1" step="1000" placeholder="100000" className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm"/>
      <p className="text-xs text-muted-foreground">Available to {side}: {money(side==="buy"?finances.cashCents:(selected?.balanceCents??0))}</p>
      <button disabled={!valid||pending} type="button" onClick={()=>void submit()}
        className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">{pending?"Processing…":side==="buy"?"Buy virtual fund":"Sell virtual fund"}</button>
    </>}
  </section>;
}
