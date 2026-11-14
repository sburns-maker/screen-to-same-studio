import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type Admin=SupabaseClient<Database>;

/** Reconcile only already-visible, saved character messages; never trust user-authored text. */
export async function reconcileFinancialDecisions(admin:Admin,userId:string,conversationId?:string) {
  let query=admin.from("messages")
    .select("id,metadata,visible_at").eq("user_id",userId).eq("sender","tess")
    .lte("visible_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(40);
  if(conversationId)query=query.eq("conversation_id",conversationId);
  const {data,error}=await query;
  if(error)return 0;
  let count=0;
  for(const row of data??[]) {
    const md=(row.metadata??{}) as Record<string,unknown>;
    const decision=md["finance_decision"] as Record<string,unknown>|undefined;
    if(!decision||typeof decision["action"]!=="string")continue;
    const result=await admin.rpc("finance_reconcile_character_message" as never,
      {p_user:userId,p_message:row.id} as never);
    // A stale or questioned proposal is not turned into a fact automatically.
    if(!result.error)count++;
  }
  return count;
}
