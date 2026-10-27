import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { QueuedMessage } from "./chat-presentation";

export async function persistQueuedMessage(
  db: SupabaseClient<Database>,
  user: string,
  conversation: string,
  message: QueuedMessage,
) {
  const { error } = await db.from("messages").insert({
    id: message.id,
    conversation_id: conversation,
    user_id: user,
    sender: "user",
    body: message.body,
  });
  if (!error) return;
  if (error.code === "23505") {
    // A lost acknowledgment is safe only if the existing row is exactly ours.
    const saved = await db
      .from("messages")
      .select("id,body")
      .eq("id", message.id)
      .eq("user_id", user)
      .eq("conversation_id", conversation)
      .eq("sender", "user")
      .maybeSingle();
    if (!saved.error && saved.data?.body === message.body) return;
  }
  throw new Error("Message is still queued on this device. Try again when connected.");
}
