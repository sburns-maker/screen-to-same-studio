import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { changeFinances, loadFinances, setEmployeeSalary, ownerDraw, setDrawRate } from "@/lib/finance.functions";
import { money, estimatedMonthlyPayment } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finances")({
  head: () => ({ meta: [{ title: "Finances — Living World" }] }),
  component: FinancesPage,
});
function FinancesPage() {
  const load = useServerFn(loadFinances);
  const change = useServerFn(changeFinances);
  const updateSalary = useServerFn(setEmployeeSalary);
  const takeDraw = useServerFn(ownerDraw);
  const changeDrawRate = useServerFn(setDrawRate);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["player-finances"], queryFn: () => load() });
  const [pending, setPending] = useState("");
  const [selectedFinancing, setSelectedFinancing] = useState<Record<string, boolean>>({});
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [payDrafts, setPayDrafts] = useState<Record<string,string>>({});
  const [drawDrafts,setDrawDrafts] = useState<Record<string,string>>({});
  const state = q.data;
  const visibleAssets = (state?.assets ?? []).filter(a =>
    (category === "all" || (category === "owned" ? a.owned : a.category === category)) &&
    a.label.toLowerCase().includes(search.toLowerCase())
  );
  async function act(action: "purchase"|"sell"|"hide"|"disclose", assetKey = "", financed = false) {
    const id = action + assetKey;
    if (pending) return;
    if ((action === "purchase" || action === "sell") && !window.confirm(
      action === "purchase" ? "Buy this fictional asset? This will immediately charge your in-game account." : "Sell this fictional asset at its listed book value?"
    )) return;
    setPending(id);
    try {
      const next = await change({ data: { action, assetKey, financed, requestId: crypto.randomUUID() } });
      qc.setQueryData(["player-finances"], next);
      toast.success(action === "purchase" ? "Purchase complete" : action === "sell" ? "Sale complete" : "Privacy preference saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transaction failed");
    } finally { setPending(""); }
  }
  const owned = state?.assets.filter(a => a.owned) ?? [];
  const payroll = (assetKey: string, headcount: number) => {
    const workers=(state?.workers ?? []).filter(w=>w.assetKey===assetKey && w.active);
    return workers.reduce((sum,w)=>sum+w.salaryCents,0)+Math.max(0,headcount-workers.length)*300000;
  };
  async function saveSalary(assetKey: string,workerKey: string,current: number) {
    const raw=payDrafts[assetKey+":"+workerKey];
    const dollars=raw === undefined ? current/100 : Number(raw);
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 500000000) { toast.error("Enter a valid monthly salary"); return; }
    setPending("salary:"+assetKey+":"+workerKey);
    try {
      const next=await updateSalary({data:{assetKey,workerKey,salaryCents:Math.round(dollars*100),requestId:crypto.randomUUID()}});
      qc.setQueryData(["player-finances"],next);
      toast.success("Salary updated");
    } catch(e) { toast.error(e instanceof Error ? e.message : "Salary update failed"); }
    finally { setPending(""); }
  }

  async function withdraw(assetKey: string,reserves: number) {
    const dollars=Number(drawDrafts[assetKey] ?? "");
    const amountCents=Math.round(dollars*100);
    if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>reserves) {
      toast.error("Choose an amount within your available company reserves");return;
    }
    if (pending) return;
    setPending("draw:"+assetKey);
    try {
      const next=await takeDraw({data:{assetKey,amountCents,requestId:crypto.randomUUID()}});
      qc.setQueryData(["player-finances"],next);
      setDrawDrafts(prev=>({...prev,[assetKey]:""}));
      toast.success("Owner draw transferred into personal cash");
    } catch(e){toast.error(e instanceof Error?e.message:"Owner draw failed");}
    finally {setPending("");}
  }
  async function setAutomaticDraw(assetKey: string,percent: number) {
    if(pending)return;
    setPending("rate:"+assetKey);
    try {
      const next=await changeDrawRate({data:{assetKey,percent,requestId:crypto.randomUUID()}});
      qc.setQueryData(["player-finances"],next);
      toast.success("Automatic distribution updated");
    }catch(e){toast.error(e instanceof Error?e.message:"Draw rate failed");}
    finally{setPending("");}
  }
  const netWorth = (state?.cashCents ?? 0) + (state?.investmentsCents ?? 0) +
    owned.reduce((sum,a) => sum + a.priceCents + a.companyReservesCents - a.loanCents, 0);
  return <>
    <ScreenHeader title="Finances" backTo="/home" />
    <Screen>
      <p className="text-xs text-muted-foreground">Fictional world only · Private to your player account</p>
      {state && <div className="mt-2 rounded-xl border p-3 text-sm"><strong>Accelerated finances: 1 real day = 1 game week</strong><p className="mt-1 text-muted-foreground">Financial date: {state.virtualDate} · Business settlements follow virtual months. Relationships and other world events stay on their existing clocks.</p></div>}
      {q.isLoading && <p role="status">Loading finances…</p>}
      {q.error && <div role="alert" className="rounded-xl border p-4 text-sm">Finances are not ready. The new database migration must be applied. <button type="button" className="underline" onClick={() => void q.refetch()}>Retry</button></div>}
      {state && <>
        <section className="mt-3 rounded-2xl border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Net worth</h2>
          <p className="font-display text-4xl">{money(netWorth)}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Available cash</dt><dd className="font-semibold">{money(state.cashCents)}</dd></div>
            <div><dt className="text-muted-foreground">Investments</dt><dd className="font-semibold">{money(state.investmentsCents)}</dd></div>
            <div><dt className="text-muted-foreground">Owned assets</dt><dd className="font-semibold">{owned.length}</dd></div>
            <div><dt className="text-muted-foreground">Monthly net operations before draws*</dt><dd className="font-semibold">{money(owned.reduce((s,a)=>s+a.monthlyProfitCents-a.monthlyCostCents-payroll(a.key,a.staffCount),0))}</dd></div>
          </dl>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
            <div><div className="font-medium">Secretly wealthy</div><p className="text-xs text-muted-foreground">Other characters are never automatically told your financial balance.</p></div>
            <button type="button" disabled={!!pending} className="shrink-0 rounded-lg border px-3 py-2 font-medium"
              onClick={() => void act(state.visibility === "private" ? "disclose" : "hide")}>
              {state.visibility === "private" ? "Private" : "Disclosed"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Changing this preference does not send a message or automatically reveal amounts to characters. Disclosure is controlled separately in conversation.</p>
        </section>
        <p className="mt-2 text-sm">Your simulated executive salary: <strong>{money(state.playerSalaryCents)}/month</strong></p>
        <h2 className="mt-7 text-lg font-semibold">Business & property marketplace</h2>
        <p className="mb-3 text-sm text-muted-foreground">Only fictional assets can be purchased. Your acquisition does not grant access to staff-only areas or control a character's relationships.</p>
        <div className="mb-3 space-y-2"><input aria-label="Search assets" className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm" placeholder="Search 28 properties and businesses…" value={search} onChange={e=>setSearch(e.target.value)}/><div className="flex gap-2 overflow-x-auto">{["all","owned","business","commercial","residential"].map(v=><button type="button" key={v} aria-pressed={category===v} onClick={()=>setCategory(v)} className={"rounded-full border px-3 py-2 text-xs capitalize "+(category===v?"bg-primary text-primary-foreground":"")}>{v}</button>)}</div></div>
        <div className="space-y-3">
          {visibleAssets.map(asset => {
            const financed = !!selectedFinancing[asset.key];
            const down = financed ? Math.floor(asset.priceCents / 4) : asset.priceCents;
            return <section key={asset.key} className="rounded-2xl border bg-surface p-4">
              <div className="flex justify-between gap-2"><div><h3 className="font-semibold">{asset.label}</h3><p className="text-xs capitalize text-muted-foreground">{asset.category}{asset.workplaceKey ? " · Existing character workplace" : ""}</p></div><span className="text-xs font-medium">{asset.owned ? "Owned" : "Available"}</span></div>
              <div className="mt-3 flex items-center justify-between text-sm"><span>Listed value</span><strong>{money(asset.priceCents)}</strong></div>
              <div className="mt-1 flex items-center justify-between text-sm"><span>Estimated monthly net income before draws*</span><strong>{money(asset.monthlyProfitCents-asset.monthlyCostCents-payroll(asset.key,asset.staffCount))}</strong></div>
              {asset.staffCount > 0 && <p className="mt-1 text-xs text-muted-foreground">{asset.staffCount} simulated staff · monthly payroll {money(payroll(asset.key,asset.staffCount))} (unnamed staff at $3,000/month)</p>}
              {asset.owned ? <>
                {asset.loanCents > 0 && <p className="mt-2 text-xs">Loan outstanding: {money(asset.loanCents)} · {asset.loanMonthsLeft} months</p>}
                <div className="mt-3 rounded-xl border p-3">
                  <h4 className="text-sm font-semibold">Owner distributions</h4>
                  <p className="mt-1 text-sm">Company reserves: <strong>{money(asset.companyReservesCents)}</strong></p>
                  <p className="text-xs text-muted-foreground">Revenue increases 2% each three ownership months (up to 2x starting revenue). Payroll, operations and loans are paid before distributions.</p>
                  <label className="mt-3 block text-xs font-medium" htmlFor={"rate-"+asset.key}>Automatic monthly owner's draw</label>
                  <select id={"rate-"+asset.key} value={asset.ownerDrawPct} disabled={!!pending}
                    onChange={e=>void setAutomaticDraw(asset.key,Number(e.target.value))}
                    className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 text-sm">
                    {[0,10,25,40,50,60,75,90,100].map(p=><option key={p} value={p}>{p}% of net income</option>)}
                  </select>
                  <label className="mt-3 block text-xs font-medium" htmlFor={"draw-"+asset.key}>Additional personal draw ($)</label>
                  <div className="mt-1 flex gap-2"><input id={"draw-"+asset.key} type="number" min="1" step="100" max={asset.companyReservesCents/100}
                    value={drawDrafts[asset.key] ?? ""} onChange={e=>setDrawDrafts(v=>({...v,[asset.key]:e.target.value}))}
                    className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Amount"/>
                    <button type="button" disabled={!!pending || asset.companyReservesCents===0} onClick={()=>void withdraw(asset.key,asset.companyReservesCents)}
                      className="rounded-lg border px-3 text-sm font-medium">Transfer</button></div>
                </div>
                {state.workers.filter(w=>w.assetKey===asset.key).length > 0 && <details className="mt-3 rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Manage named employee salaries</summary>
                  <p className="mt-1 text-xs text-muted-foreground">Monthly fictional pay; changes do not automatically alter character knowledge or employment status.</p>
                  {state.workers.filter(w=>w.assetKey===asset.key).map(w=><div key={w.key} className="mt-3 space-y-1">
                    <label className="text-xs font-medium" htmlFor={"pay-"+asset.key+"-"+w.key}>{w.name} · {w.role}</label>
                    <div className="flex items-center gap-2"><input id={"pay-"+asset.key+"-"+w.key} type="number" min="0" max="500000000" step="100" value={payDrafts[asset.key+":"+w.key] ?? String(w.salaryCents/100)} onChange={e=>setPayDrafts(d=>({...d,[asset.key+":"+w.key]:e.target.value}))} className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-2 text-sm"/><button type="button" disabled={!!pending} onClick={()=>void saveSalary(asset.key,w.key,w.salaryCents)} className="rounded-lg border px-3 py-2 text-sm">Save</button></div>
                  </div>)}
                </details>}
                <button type="button" disabled={!!pending} className="mt-3 min-h-11 w-full rounded-xl border font-medium" onClick={() => void act("sell",asset.key)}>Sell at book value</button>
              </> : <>
                <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={financed} onChange={e => setSelectedFinancing(s=>({...s,[asset.key]:e.target.checked}))}/>Finance 75% over 10 years (8% APR)</label>
                <p className="mt-1 text-xs text-muted-foreground">Due now: {money(down)}{financed ? " · estimated first payment "+money(estimatedMonthlyPayment(asset.priceCents-down))+" (declines over time)" : ""}</p>
                <button type="button" disabled={!!pending || state.cashCents < down} className="mt-3 min-h-11 w-full rounded-xl bg-primary px-4 font-medium text-primary-foreground disabled:opacity-40" onClick={() => void act("purchase",asset.key,financed)}>{pending === "purchase"+asset.key ? "Processing…" : "Buy business / property"}</button>
              </>}
            </section>;
          })}
        </div>
        <h2 className="mt-7 text-lg font-semibold">Recent transactions</h2>
        <div className="mt-2 divide-y rounded-2xl border bg-surface">
          {state.transactions.length === 0 && <p className="p-4 text-sm text-muted-foreground">No transactions yet.</p>}
          {state.transactions.map((t,i)=><div className="flex justify-between gap-3 p-3 text-sm" key={i}><div><div>{t.note}</div><span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span></div><strong className="shrink-0">{t.amount_cents>0?"+":""}{money(t.amount_cents)}</strong></div>)}
        </div>
        <p className="mt-5 pb-6 text-xs text-muted-foreground">*Illustrative business values. Monthly settlements split each asset's net income between company reserves and personal drawings. The world tick processes completed months. No real payments, equity, property, employer changes or financial claims are created.</p>
      </>}
    </Screen>
  </>;
}
