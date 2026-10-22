import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { attachmentPresent } from "./photo-opportunities";

export function messagePushBody(message: { body: string; metadata: unknown }): string {
  return (
    message.body.trim().slice(0, 80) ||
    (attachmentPresent(message.metadata) ? "Sent a photo" : "New message")
  );
}

/** Atomic at-most-once claim shared by the delayed sweep and immediate initiation path. */
export async function claimMessagePush(
  admin: SupabaseClient<Database>,
  message: { id: string; metadata: Json },
): Promise<boolean> {
  const metadata = { ...((message.metadata ?? {}) as Record<string, Json>), pushed: true };
  const { data, error } = await admin
    .from("messages")
    .update({ metadata })
    .eq("id", message.id)
    .is("metadata->>pushed", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Notification claim unavailable");
  return !!data;
}
