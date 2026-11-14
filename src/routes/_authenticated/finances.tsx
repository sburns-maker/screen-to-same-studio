import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { changeFinances, loadFinances } from "@/lib/finance.functions";
import { money, estimatedMonthlyPayment } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finances")({
  head: () => ({ meta: [{ title: "Finances — Living World" }] }),
  component: FinancesPage,
});
function FinancesPage() {
  const load = useServerFn(loadFinances);
  const change = useServerFn(changeFinances);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["player-finances"], queryFn: () => load() });
  const [pending, setPending] = useState("");
  const [selectedFinancing, setSelectedFinancing] = useState<Record<string, boolean>>({});
  const state = q.data;
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
  const netWorth = (state?.cashCents ?? 0) + (state?.investmentsCents ?? 0) +
    owned.reduce((sum,a) => sum + a.priceCents - a.loanCents, 0);
  return <>
    <ScreenHeader title="Finances" backTo="/home" />
    <Screen>
      <p className="text-xs text-muted-foreground">Fictional world only · Private to your player account</p>
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
            <div><dt className="text-muted-foreground">Monthly net operations*</dt><dd className="font-semibold">{money(owned.reduce((s,a)=>s+a.monthlyProfitCents-a.monthlyCostCents,0))}</dd></div>
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
        <h2 className="mt-7 text-lg font-semibold">Business & property marketplace</h2>
        <p className="mb-3 text-sm text-muted-foreground">Only fictional assets can be purchased. Your acquisition does not grant access to staff-only areas or control a character's relationships.</p>
        <div className="space-y-3">
          {state.assets.map(asset => {
            const financed = !!selectedFinancing[asset.key];
            const down = financed ? Math.floor(asset.priceCents / 4) : asset.priceCents;
            return <section key={asset.key} className="rounded-2xl border bg-surface p-4">
              <div className="flex justify-between gap-2"><div><h3 className="font-semibold">{asset.label}</h3><p className="text-xs capitalize text-muted-foreground">{asset.category}{asset.workplaceKey ? " · Existing character workplace" : ""}</p></div><span className="text-xs font-medium">{asset.owned ? "Owned" : "Available"}</span></div>
              <div className="mt-3 flex items-center justify-between text-sm"><span>Listed value</span><strong>{money(asset.priceCents)}</strong></div>
              <div className="mt-1 flex items-center justify-between text-sm"><span>Estimated monthly operations*</span><strong>{money(asset.monthlyProfitCents-asset.monthlyCostCents)}</strong></div>
              {asset.staffCount > 0 && <p className="mt-1 text-xs text-muted-foreground">{asset.staffCount} simulated staff</p>}
              {asset.owned ? <>
                {asset.loanCents > 0 && <p className="mt-2 text-xs">Loan outstanding: {money(asset.loanCents)} · {asset.loanMonthsLeft} months</p>}
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
        <p className="mt-5 pb-6 text-xs text-muted-foreground">*Illustrative business values. Monthly settlements are processed by the server when the finance world tick runs. No real payments, equity, property, employer changes or financial claims are created.</p>
      </>}
    </Screen>
  </>;
}
