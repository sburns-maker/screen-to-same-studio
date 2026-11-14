import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { loadFinanceManagement, updateFinanceManagement, type FinanceCommand } from "@/lib/finance-management.functions";
import { money, type FinanceSnapshot } from "@/lib/finance";
import { WORKPLACES } from "@/lib/workplaces";

const cast = [...new Set(Object.values(WORKPLACES).map(w=>w.character))];
const cents = (input:string) => Math.round(Number(input)*100);

export function FinanceManagement({finances}:{finances:FinanceSnapshot}) {
  const load=useServerFn(loadFinanceManagement);
  const action=useServerFn(updateFinanceManagement);
  const qc=useQueryClient();
  const q=useQuery({queryKey:["finance-management"],queryFn:()=>load(),retry:false});
  const [pending,setPending]=useState(false);
  const [expenseName,setExpenseName]=useState("");
  const [expenseAmount,setExpenseAmount]=useState("");
  const [hireName,setHireName]=useState("");
  const [hirePay,setHirePay]=useState("3500");
  const [selected,setSelected]=useState("");
  const [recipient,setRecipient]=useState<(typeof cast)[number]>("tess");

  async function submit(cmd:FinanceCommand) {
    if(pending)return;
    if(["upgrade","fire","reveal","reveal_identity"].includes(cmd.command) &&
      !window.confirm("Confirm this fictional management decision?"))return;
    setPending(true);
    try {
      const result=await action({data:{requestId:crypto.randomUUID(),action:cmd}});
      qc.setQueryData(["finance-management"],result);
      await qc.invalidateQueries({queryKey:["player-finances"]});
      toast.success("Financial decision recorded");
    } catch(e) {toast.error(e instanceof Error?e.message:"Unable to save decision");}
    finally {setPending(false);}
  }
  const owned=finances.assets.filter(a=>a.owned);
  const active=owned.find(a=>a.key===selected)??owned[0];
  const workers=finances.workers.filter(w=>w.assetKey===active?.key&&w.active);
  const level=q.data?.improvements.find(x=>x.assetKey===active?.key)?.level??0;
  const upgradePrice=active?Math.max(50000,Math.floor(active.priceCents/100)*(level+1)):0;

  return <section className="mt-7 space-y-4" aria-label="Financial world management">
    <h2 className="text-xl font-semibold">Company management</h2>
    <p className="text-sm text-muted-foreground">All purchases, payroll and business decisions are fictional. Characters keep their own personalities and decisions.</p>
    {q.isLoading&&<p role="status">Loading business controls…</p>}
    {q.error&&<div role="alert" className="rounded-xl border p-3 text-sm">Additional management controls require migration 0081. <button type="button" className="underline" onClick={()=>void q.refetch()}>Retry</button></div>}
    {q.data&&<>
      <section className="rounded-2xl border bg-surface p-4 space-y-3">
        <h3 className="font-semibold">Personal monthly expenses</h3>
        <p className="text-xs text-muted-foreground">Bills are deducted once per completed accelerated financial month (one real day = one game week).</p>
        {q.data.expenses.filter(e=>e.active).map(e=><div key={e.key} className="flex items-center justify-between gap-3 text-sm">
          <span>{e.label} · {money(e.monthlyCents)}</span>
          <button type="button" className="rounded-lg border px-2 py-2" disabled={pending}
            onClick={()=>void submit({command:"expense_remove",payload:{expenseKey:e.key}})}>Remove</button>
        </div>)}
        <label className="block text-xs font-medium" htmlFor="personal-expense-name">New expense</label>
        <input id="personal-expense-name" maxLength={80} placeholder="Housing, car payment, etc." value={expenseName}
          onChange={e=>setExpenseName(e.target.value)} className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm"/>
        <label className="block text-xs font-medium" htmlFor="personal-expense-amount">Monthly amount ($)</label>
        <input id="personal-expense-amount" type="number" min="1" step="1" placeholder="5000" value={expenseAmount}
          onChange={e=>setExpenseAmount(e.target.value)} className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm"/>
        <button type="button" disabled={pending||expenseName.trim().length<2||!Number.isSafeInteger(cents(expenseAmount))||cents(expenseAmount)<=0}
          onClick={()=>void submit({command:"expense_add",payload:{label:expenseName.trim(),monthlyCents:cents(expenseAmount)}})}
          className="min-h-11 rounded-xl border px-4 text-sm font-semibold">Add recurring bill</button>
      </section>

      <section className="rounded-2xl border bg-surface p-4 space-y-3">
        <h3 className="font-semibold">Staffing & improvements</h3>
        {owned.length===0?<p className="text-sm text-muted-foreground">Acquire a business first to manage it.</p>:<>
          <label className="block text-xs font-medium" htmlFor="management-asset">Owned business / property</label>
          <select id="management-asset" className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
            value={active?.key??""} onChange={e=>setSelected(e.target.value)}>
            {owned.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <p className="text-sm">Improvement level: <strong>{level}/5</strong> · Next upgrade: {money(upgradePrice)}</p>
          <p className="text-xs text-muted-foreground">An upgrade costs 1% of acquisition value per next level (minimum $500), and raises the company's baseline revenue by 5% in the game.</p>
          <button type="button" disabled={pending||level>=5||finances.cashCents<upgradePrice}
            onClick={()=>active&&void submit({command:"upgrade",payload:{assetKey:active.key}})}
            className="min-h-11 rounded-xl border px-4 text-sm font-semibold">Purchase improvement</button>
          <div className="border-t pt-3">
            <h4 className="font-medium">Employees</h4>
            {workers.map(w=><div key={w.key} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{w.name} · {money(w.salaryCents)}/month</span>
              {w.key.startsWith("hire:")&&<button type="button" disabled={pending}
                onClick={()=>active&&void submit({command:"fire",payload:{assetKey:active.key,workerKey:w.key}})}
                className="rounded-lg border px-2 py-2 text-xs">Release</button>}
            </div>)}
            <p className="mb-2 text-xs text-muted-foreground">Only staff hired through this panel can be released here. Named characters aren't controlled by the player.</p>
            <label className="block text-xs font-medium" htmlFor="management-hire-name">New fictional employee</label>
            <input id="management-hire-name" maxLength={60} placeholder="Employee name" value={hireName}
              onChange={e=>setHireName(e.target.value)} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm"/>
            <label className="mt-2 block text-xs font-medium" htmlFor="management-hire-pay">Monthly salary ($)</label>
            <input id="management-hire-pay" type="number" min="100" max="5000000" step="100" value={hirePay}
              onChange={e=>setHirePay(e.target.value)} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm"/>
            <button type="button" disabled={pending||hireName.trim().length<2||!Number.isSafeInteger(cents(hirePay))||cents(hirePay)<10000||cents(hirePay)>500000000}
              onClick={()=>active&&void submit({command:"hire",payload:{assetKey:active.key,name:hireName.trim(),monthlyCents:cents(hirePay)}})}
              className="mt-2 min-h-11 rounded-xl border px-4 text-sm font-semibold">Hire employee</button>
          </div>
        </>}
      </section>

      <section className="rounded-2xl border bg-surface p-4 space-y-3">
        <h3 className="font-semibold">Who knows your secret?</h3>
        <p className="text-xs text-muted-foreground">Choose a character to tell. This records their knowledge of your fictional career or a specific acquisition; it does not send a text or reveal your bank balance.</p>
        <label className="block text-xs font-medium" htmlFor="finance-disclose-character">Character</label>
        <select id="finance-disclose-character" className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
          value={recipient} onChange={e=>setRecipient(e.target.value as typeof recipient)}>
          {cast.map(key=><option key={key} value={key}>{key.charAt(0).toUpperCase()+key.slice(1)}</option>)}
        </select>
        <button type="button" disabled={pending} onClick={()=>void submit({command:"reveal_identity",payload:{characterKey:recipient}})}
          className="min-h-11 w-full rounded-xl border text-sm">Tell them your company and job title</button>
        {owned.length>0&&<button type="button" disabled={pending} onClick={()=>active&&void submit({command:"reveal",payload:{characterKey:recipient,assetKey:active.key}})}
          className="min-h-11 w-full rounded-xl border text-sm">Tell them you own {active?.label}</button>}
        <p className="text-xs text-muted-foreground">Known facts: {q.data.disclosures.filter(d=>d.characterKey===recipient).map(d=>d.subjectKey==="identity"?"Your public career":finances.assets.find(a=>a.key===d.subjectKey)?.label??"Prior business ownership").join(", ")||"None yet"}</p>
      </section>
    </>}
  </section>;
}
