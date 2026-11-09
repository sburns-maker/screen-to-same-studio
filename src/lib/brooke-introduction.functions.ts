import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The player's own introduction state (owner-scoped read). */
export const brookeIntroductionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { introductionRow } = await import("./brooke-introduction.server");
    const row = await introductionRow(context.supabase, context.userId);
    return { status: row?.status ?? "not_mentioned", offerMessageId: row?.offer_message_id ?? null };
  });

/** Accept or decline Carly's offer. Accept creates Brooke's thread immediately. */
export const respondBrookeIntroduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ accept: z.boolean() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { respondToBrookeIntroduction } = await import("./brooke-introduction.server");
    const result = await respondToBrookeIntroduction(supabaseAdmin, context.userId, data.accept);
    let conversationId: string | null = null;
    if (result.status === "contact_accepted" || result.status === "met") {
      const { supabase, userId } = context;
      const ch = await supabase.from("characters").select("*").eq("key", "brooke").single();
      if (ch.error) throw new Error("Brooke is unavailable");
      const existing = await supabase.from("conversations").select("id")
        .eq("user_id", userId).eq("character_id", ch.data.id).maybeSingle();
      if (existing.data) conversationId = existing.data.id;
      else {
        const { seedConversation } = await import("./tess.functions");
        conversationId = (await seedConversation(supabase, userId, ch.data)).id as string;
      }
    }
    return { status: result.status, conversationId };
  });
