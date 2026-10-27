import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKPLACES, workplaceShiftLikely } from "./workplaces";
import { characterAvailability } from "./characters";
import { CHARACTERS } from "./characters";

/** A genuine on-location turn, written to the normal conversation history.
 * It is not a promise that the contact will agree to meet or leave work. */
export const workplaceEncounterTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    conversationId: z.string().uuid(), character: z.enum(["tess","maya","claire","jordan","ben","riley"]),
    text: z.string().trim().min(1).max(900), requestId: z.string().uuid(),
    activity: z.enum(["conversation", "lunch_dropoff"]).default("conversation"),
  }).parse(v))
  .handler(async ({ context, data }) => {
    const work = WORKPLACES[data.character];
    const now = new Date();
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const present = await db.from("town_presence").select("place_key,arrives_at")
      .eq("user_id", context.userId).maybeSingle();
    if (present.error || present.data?.place_key !== work.key ||
        !present.data?.arrives_at || Date.parse(present.data.arrives_at) > now.getTime())
      throw new Error("Arrive at the virtual workplace before starting an encounter.");
    if (data.activity !== "lunch_dropoff" && !workplaceShiftLikely(data.character, now))
      throw new Error("This isn't a usual shift. Arrange another time with the character.");
    const availability = characterAvailability(CHARACTERS[data.character], now);
    if (data.activity !== "lunch_dropoff" && availability.availability === "asleep")
      throw new Error("They're unavailable right now.");
    const conversation = await db.from("conversations")
      .select("id,character:characters(key)")
      .eq("id", data.conversationId).eq("user_id", context.userId).maybeSingle();
    if (conversation.error || !conversation.data ||
        (conversation.data.character as {key?: string} | null)?.key !== data.character)
      throw new Error("This conversation isn't associated with the workplace character.");
    // Restricted workplace access remains a public-area conversation only.
    const body = data.text;
    const { data: existing, error: existingError } = await db.from("messages")
      .select("id").eq("user_id",context.userId).eq("conversation_id",data.conversationId)
      .contains("metadata",{ workplace_encounter: { request_id: data.requestId } }).limit(1);
    if (existingError) throw new Error("Unable to verify this encounter.");
    if (existing?.length) {
      await (await import("./tess.functions")).runTurn(context.supabase, context.userId, data.conversationId, "America/New_York");
      return { accepted: true, alreadyRecorded: true };
    }
    const { error } = await db.from("messages").insert({
      user_id: context.userId, conversation_id: data.conversationId, sender: "user",
      body, metadata: {
        workplace_encounter: {
          request_id: data.requestId, place_key: work.key, character: data.character,
          access: work.publicAccess === "restricted" ? "public_reception_only" : "public_visitor_area",
          event: data.activity === "lunch_dropoff" ? "player_attempted_lunch_dropoff" : "player_requested_conversation", occurred_at: now.toISOString(),
          ...(data.activity === "lunch_dropoff" ? { delivery_status: "attempted", recipient_notified: false } : {}),
        },
      },
    });
    if (error) throw new Error("Unable to record encounter; please retry.");
    // The reply is delivered by the same message pipeline used for ordinary chat.
    // The character may choose to be busy, decline, or speak briefly.
    await (await import("./tess.functions")).runTurn(
      context.supabase, context.userId, data.conversationId, "America/New_York",
    );
    return { accepted: true, alreadyRecorded: false };
  });
