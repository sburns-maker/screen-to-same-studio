import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type Admin = SupabaseClient<Database>;

/** Only explicitly revealed facts, and only to the recipient character. */
export async function financeCharacterContext(admin: Admin, userId: string, character: string): Promise<string> {
  const facts=await admin.from("finance_disclosures" as never)
    .select("subject_key,disclosed_at")
    .eq("user_id",userId).eq("character_key",character)
    .order("disclosed_at",{ascending:false}).limit(10);
  if(facts.error)return "";
  const salaryResult=await admin.from("finance_salary_notices" as never)
    .select("asset_key,old_salary_cents,new_salary_cents,notified_at")
    .eq("user_id",userId).eq("character_key",character)
    .order("notified_at",{ascending:false}).limit(3);
  const salaries=(salaryResult.error ? [] : salaryResult.data??[]) as unknown as {asset_key:string;old_salary_cents:number;new_salary_cents:number;notified_at:string}[];
  const offerResult=await admin.from("finance_equity_offers" as never)
    .select("asset_key,percentage,created_at")
    .eq("user_id",userId).eq("recipient_character",character).eq("status","pending")
    .order("created_at",{ascending:false}).limit(3);
  const offers=(offerResult.error?[]:offerResult.data??[]) as unknown as {asset_key:string;percentage:number;created_at:string}[];
  if(!facts.data?.length && salaries.length===0 && offers.length===0)return "";
  const subjects=((facts.data??[]) as unknown as {subject_key:string;disclosed_at:string}[]);
  const profile=await admin.from("finance_accounts" as never).select("company_name,job_title")
    .eq("user_id",userId).maybeSingle();
  if(profile.error || !profile.data)return "";
  const identity=profile.data as unknown as {company_name:string;job_title:string};
  const assetKeys=[...new Set([...subjects.filter(x=>x.subject_key!=="identity").map(x=>x.subject_key),...salaries.map(x=>x.asset_key),...offers.map(x=>x.asset_key)])];
  const assets=assetKeys.length?await admin.from("finance_assets" as never)
    .select("asset_key,label,owned").eq("user_id",userId).in("asset_key",assetKeys):null;
  if(assets?.error)return "";
  const assetData=(assets?.data??[]) as unknown as {asset_key:string;label:string;owned:boolean}[];
  const governance=assetKeys.length?await admin.from("finance_governance" as never)
    .select("asset_key,hands_off,operating_manager,reports_to,independent_hr,conflict_recusal")
    .eq("user_id",userId).in("asset_key",assetKeys):null;
  const policies=(governance?.error?[]:governance?.data??[]) as unknown as {asset_key:string;hands_off:boolean;operating_manager:string;reports_to:string;independent_hr:string;conflict_recusal:boolean}[];
  const known=subjects.map(f=>{
    if(f.subject_key==="identity")return `Player told you their employer is ${identity.company_name} and their job title is ${identity.job_title}.`;
    const a=assetData.find(x=>x.asset_key===f.subject_key);
    if(!a)return "";
    const g=policies.find(p=>p.asset_key===a.asset_key);
    return a.owned?`Player explicitly told you they bought ${a.label} in this fictional game world. ${g?.hands_off ? `The player has recorded a hands-off owner policy: daily operations go to ${g.operating_manager}; staff report through ${g.reports_to}; employment conflicts are referred to ${g.independent_hr}. The owner is recused from personal relationship-related employment decisions. This is a fictional written policy, not proof that a manager has accepted the role or a legally signed agreement. You may reasonably ask for confirmed appointments and documentation. The player is not your direct supervisor under the recorded policy.` : "The player has not recorded a hands-off operational delegation for this asset."}`:
      `Player previously told you they owned ${a.label}, but ownership has since changed; don't assume they still own it.`;
  }).filter(Boolean);
  const notices=salaries.map(n=>{
    const a=assetData.find(x=>x.asset_key===n.asset_key);
    if(!a)return "";
    const oldPay=(n.old_salary_cents/100).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
    const newPay=(n.new_salary_cents/100).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
    return `Your fictional workplace ${a.label} communicated a monthly salary change from ${oldPay} to ${newPay}. This is a work event, not evidence the player is the owner or personally responsible. You can have your own response, ask questions, or disagree.`;
  }).filter(Boolean);
  const proposals=offers.map(o=>{
    const asset=assetData.find(a=>a.asset_key===o.asset_key);
    if(!asset||!asset.owned)return "";
    return `The player has offered you OPTIONAL ${o.percentage}% co-ownership of ${asset.label}. This is a pending proposal only. You have not accepted, and no equity has transferred. You may decline, ask questions, or negotiate terms, with no penalty to your marriage, relationship, job or career. Do not describe yourself as a co-owner. The recorded hands-off management policy is separate from the offer, and should remain in place even if you decline. Ask for independent advice and actual employment reporting documents if you want.`;
  }).filter(Boolean);
  if(!known.length && !notices.length && !proposals.length)return "";
  return `PRIVATE DISCLOSED FINANCIAL KNOWLEDGE (facts explicitly shared WITH YOU, not with other characters): ${[...known,...notices,...proposals].join(" ")} All purchases and job changes are fictional game scenarios even when a real organization name appears. You may react in your own character voice, with your own feelings, questions or concerns, particularly if this is your fictional workplace. You are not required to approve, admire or reciprocate affection. You do NOT know the player's wealth, investments, other assets, company ownership structure, salary, or undisclosed acquisitions. Never imply real-world corporate ownership, access to private staff or medical records, or an automatic change to your employment. Do not treat an ownership reveal as a completed in-person interaction.`;
}
