import { useEffect,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { loadFinanceAgreementDraft,saveFinanceAgreementDraft } from "@/lib/finance-review.functions";

const people=["tess","maya","claire","jordan","ben","sienna","kendra","riley","carly","brooke","jade","nina"] as const;
type Character=typeof people[number];
export function EditableFinanceAgreement({assetKey,characterKey,templateText,deliveredText,handsOff}:{
  assetKey:string;characterKey:string;templateText:string;
  deliveredText?:string|undefined;handsOff:boolean;
}) {
  const load=useServerFn(loadFinanceAgreementDraft);
  const save=useServerFn(saveFinanceAgreementDraft);
  const qc=useQueryClient();
  const character=people.find(p=>p===characterKey)??"tess";
  const queryKey=["finance-agreement-draft",assetKey,character] as const;
  const q=useQuery({queryKey,queryFn:()=>load({data:{assetKey,characterKey:character}}),retry:false});
  const [text,setText]=useState(deliveredText??templateText);
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!dirty&&q.isSuccess)setText(q.data?.text??deliveredText??templateText);
  },[q.isSuccess,q.data?.text,deliveredText,templateText,dirty]);
  const contentValid=text.trim().length>=150&&text.length<=12000;
  const saved=q.data?.text===text&&!dirty;
  async function onSave() {
    if(!handsOff||busy||!contentValid)return;
    setBusy(true);
    try {
      const data=await save({data:{
        requestId:crypto.randomUUID(),assetKey,characterKey:character,text:text.trim(),
      }});
      qc.setQueryData(queryKey,data);
      setDirty(false);
      toast.success("Full written agreement saved as draft. Deliver it separately for review.");
    }catch(e){toast.error(e instanceof Error?e.message:"Could not save draft");}
    finally{setBusy(false);}
  }
  return <div className="space-y-2 rounded-xl border p-3">
    <h4 className="text-sm font-semibold">Edit the entire written agreement</h4>
    <p className="text-xs text-muted-foreground">Change names, reporting lines, authority, conflict procedures, and wording. Your saved draft is private until you choose Deliver. A revision requires the character's new acknowledgment.</p>
    {q.isLoading&&<p className="text-xs" role="status">Loading editable agreement…</p>}
    {q.error&&<p className="text-xs" role="alert">Document editing requires migration 0087. <button type="button" onClick={()=>void q.refetch()} className="underline">Retry</button></p>}
    <label htmlFor="finance-custom-policy" className="text-xs font-medium">Complete document</label>
    <textarea id="finance-custom-policy" value={text} rows={14} maxLength={12000}
      disabled={!!q.error||q.isLoading||busy||!handsOff}
      onChange={e=>{setText(e.target.value);setDirty(true)}}
      className="w-full rounded-xl border bg-background p-3 text-sm leading-relaxed"
      aria-describedby="finance-custom-policy-count"/>
    <p id="finance-custom-policy-count" className="text-xs text-muted-foreground">{text.trim().length.toLocaleString()} characters · 150–12,000 required</p>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy||q.isLoading||!!q.error||!dirty||!contentValid||!handsOff}
        onClick={()=>void onSave()} className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40">
        {busy?"Saving…":"Save full document"}
      </button>
      <button type="button" className="min-h-11 rounded-xl border px-3 text-sm"
        onClick={()=>{setText(templateText);setDirty(true)}}>Use generated template</button>
    </div>
    {saved&&<p className="text-xs text-muted-foreground">Draft saved. Use the separate “Deliver written agreement” control after reviewing the text.</p>}
    {dirty&&<p className="text-xs text-muted-foreground">Unsaved changes are not included when you deliver a document. Save your edits first.</p>}
    <p className="text-xs text-muted-foreground">Include the actual fictional management names and independent review process. Editing this document alone does not appoint staff, modify employee rights, or constitute a legal agreement.</p>
  </div>;
}
