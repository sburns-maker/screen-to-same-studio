import { explicitReceiptEvidence } from "./gift-handoff-state";

/** Post-reply reconciliation. No player statement is accepted as evidence.
 * Best-effort: gift checks must never make a normal chat reply fail. */
export async function reconcileGiftReceipts(userId: string, conversationId: string, character: string, messages: {id:string;body:string;created_at:string}[]): Promise<void> {
  if (!messages.length) return;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: gifts, error } = await db.from("world_events").select("id,created_at,payload")
    .eq("user_id",userId).eq("conversation_id",conversationId)
    .eq("character_key",character).eq("kind","gift_handoff")
    .order("created_at",{ascending:false}).limit(20);
  if(error) throw error;
  for(const gift of gifts??[]) {
    const payload=gift.payload as Record<string,unknown>|null;
    if(!payload || !["attempted","waiting"].includes(String(payload['status']))) continue;
    const item=typeof payload['item']==="string"?payload['item']:"";
    const evidence=messages.find(m=>Date.parse(m.created_at)>=Date.parse(gift.created_at)
      && explicitReceiptEvidence(m.body,item));
    if(!evidence) continue;
    const { error: saveError }=await db.from("world_events")
      .update({payload:{...payload,status:"received",recipient_received:true,receipt_message_id:evidence.id,received_at:evidence.created_at}})
      .eq("id",gift.id).eq("user_id",userId).in("payload->>status",["attempted","waiting"]);
    if(saveError) throw saveError;
  }
}
