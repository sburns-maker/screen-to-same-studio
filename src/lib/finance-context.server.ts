import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type Admin = SupabaseClient<Database>;

/** Only explicitly revealed facts, and only to the recipient character. */
export async function financeCharacterContext(admin: Admin, userId: string, character: string): Promise<string> {
  const facts=await admin.from("finance_disclosures" as never)
    .select("subject_key,disclosed_at")
    .eq("user_id",userId).eq("character_key",character)
    .order("disclosed_at",{ascending:false}).limit(10);
  if(facts.error || !facts.data?.length)return "";
  const subjects=(facts.data as unknown as {subject_key:string;disclosed_at:string}[]);
  const profile=await admin.from("finance_accounts" as never).select("company_name,job_title")
    .eq("user_id",userId).maybeSingle();
  if(profile.error || !profile.data)return "";
  const identity=profile.data as unknown as {company_name:string;job_title:string};
  const assetKeys=subjects.filter(x=>x.subject_key!=="identity").map(x=>x.subject_key);
  const assets=assetKeys.length?await admin.from("finance_assets" as never)
    .select("asset_key,label,owned").eq("user_id",userId).in("asset_key",assetKeys):null;
  if(assets?.error)return "";
  const assetData=(assets?.data??[]) as unknown as {asset_key:string;label:string;owned:boolean}[];
  const known=subjects.map(f=>{
    if(f.subject_key==="identity")return `Player told you their employer is ${identity.company_name} and their job title is ${identity.job_title}.`;
    const a=assetData.find(x=>x.asset_key===f.subject_key);
    if(!a)return "";
    return a.owned?`Player explicitly told you they bought ${a.label} in this fictional game world.`:
      `Player previously told you they owned ${a.label}, but ownership has since changed; don't assume they still own it.`;
  }).filter(Boolean);
  if(!known.length)return "";
  return `PRIVATE DISCLOSED FINANCIAL KNOWLEDGE (facts explicitly shared WITH YOU, not with other characters): ${known.join(" ")} All purchases and job changes are fictional game scenarios even when a real organization name appears. You may react in your own character voice, with your own feelings, questions or concerns, particularly if this is your fictional workplace. You are not required to approve, admire or reciprocate affection. You do NOT know the player's wealth, investments, other assets, company ownership structure, salary, or undisclosed acquisitions. Never imply real-world corporate ownership, access to private staff or medical records, or an automatic change to your employment. Do not treat an ownership reveal as a completed in-person interaction.`;
}
