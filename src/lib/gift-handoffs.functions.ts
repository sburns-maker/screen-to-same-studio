import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const characterSchema = z.enum(["tess", "maya", "claire", "jordan", "ben", "riley"]);
const payloadSchema = z.object({
  item: z.string().default("Item"),
  status: z.enum(["attempted", "waiting", "returned"]).default("attempted"),
  source_message_id: z.string().optional(),
  reception_outcome: z.string().optional(),
  recipient_received: z.literal(false).default(false),
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
        status: parsed.data.status, recipientReceived: false,
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
    if (parsed.data.status === "returned") return { status: "returned" as const };
    const status = data.action === "take_back" ? "returned" : "waiting";
    const { error: saveError } = await db.from("world_events")
      .update({ payload: { ...parsed.data, status, recipient_received: false } })
      .eq("id", data.id).eq("user_id", context.userId)
      .eq("character_key", data.character).eq("kind", "gift_handoff");
    if (saveError) throw new Error("Unable to update gift status");
    return { status };
  });
