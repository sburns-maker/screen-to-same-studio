import { nextGiftStatus, explicitReceiptEvidence } from "./gift-handoff-state";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const characterSchema = z.enum(["tess", "maya", "claire", "jordan", "ben", "riley"]);
const payloadSchema = z.object({
  item: z.string().default("Item"),
  status: z.enum(["attempted", "waiting", "returned", "received"]).default("attempted"),
  source_message_id: z.string().optional(),
  reception_outcome: z.string().optional(),
  recipient_received: z.boolean().default(false),
}).passthrough();

export const giftHandoffHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ character: characterSchema }).parse(v))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await db.from("world_events")
      .select("id,created_at,payload")
      .eq("user_id", context.userId).eq("character_key", data.character)
      .eq("kind", "gift_handoff").order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error("Gift history unavailable");
    return (rows ?? []).flatMap(row => {
      const parsed = payloadSchema.safeParse(row.payload);
      return parsed.success ? [{
        id: row.id, createdAt: row.created_at, item: parsed.data.item,
        status: parsed.data.status, recipientReceived: parsed.data.recipient_received,
        receptionOutcome: parsed.data.reception_outcome ?? "unresolved",
      }] : [];
    });
  });

/** Player can retract an item or remain waiting. Player cannot assert character receipt. */
export const changeGiftHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    id: z.string().uuid(), character: characterSchema,
    action: z.enum(["wait", "take_back"]),
  }).parse(v))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await db.from("world_events").select("payload")
      .eq("id", data.id).eq("user_id", context.userId)
      .eq("character_key", data.character).eq("kind", "gift_handoff").maybeSingle();
    if (error || !row) throw new Error("Gift handoff not found");
    const parsed = payloadSchema.safeParse(row.payload);
    if (!parsed.success) throw new Error("Invalid handoff record");
    if (parsed.data.status === "returned" || parsed.data.status === "received") return { status: parsed.data.status };
    const status = nextGiftStatus(parsed.data.status, data.action);
    const { error: saveError } = await db.from("world_events")
      .update({ payload: { ...parsed.data, status, recipient_received: false } })
      .eq("id", data.id).eq("user_id", context.userId)
      .eq("character_key", data.character).eq("kind", "gift_handoff")
      .eq("payload->>status", parsed.data.status);
    if (saveError) throw new Error("Unable to update gift status");
    return { status };
  });

/** Checks actual character-authored chat messages; a player click cannot declare receipt. */
export const verifyGiftReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid(), character: characterSchema }).parse(v))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: gift, error } = await db.from("world_events")
      .select("id,conversation_id,created_at,payload").eq("user_id",context.userId)
      .eq("character_key",data.character).eq("kind","gift_handoff").eq("id",data.id).maybeSingle();
    if(error || !gift) throw new Error("Handoff not found");
    const current=payloadSchema.safeParse(gift.payload);
    if(!current.success) throw new Error("Invalid handoff state");
    if(current.data.status==="received") return { confirmed:true };
    if(current.data.status==="returned") return { confirmed:false };
    const { data: replies, error: replyError } = await db.from("messages")
      .select("id,body,created_at,visible_at,sender")
      .eq("user_id",context.userId).eq("conversation_id",gift.conversation_id)
      .eq("sender","tess").gte("created_at",gift.created_at)
      .lte("visible_at",new Date().toISOString())
      .order("created_at",{ascending:true}).limit(100);
    if(replyError) throw new Error("Receipt evidence unavailable");
    // The conversation is owned by the authenticated user and bound to a specific character.
    const evidence=(replies??[]).find(message=>explicitReceiptEvidence(message.body,current.data.item));
    if(!evidence) return {confirmed:false};
    const { data: updated, error: saveError }=await db.from("world_events")
      .update({payload:{...current.data,status:"received",recipient_received:true,
        receipt_message_id:evidence.id,received_at:evidence.created_at}})
      .eq("id",gift.id).eq("user_id",context.userId)
      .eq("kind","gift_handoff").in("payload->>status",["attempted","waiting"])
      .select("id");
    if(saveError) throw new Error("Could not confirm receipt");
    return {confirmed:!!updated?.length};
  });
