import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Fail closed: an unavailable ownership check must not authorize background chat. */
export async function experienceBlocksChat(db: SupabaseClient<Database>, user: string, conversation: string) {
  const result = await db.from("living_experiences").select("id")
    .eq("user_id", user).eq("conversation_id", conversation)
    .in("state", ["interactive", "paused"]).limit(1);
  // Older installations without the experience module have no scene to protect.
  if (result.error?.code === "42P01" || result.error?.code === "PGRST205") return false;
  if (result.error) throw new Error("Active experience ownership unavailable");
  return Boolean(result.data?.length);
}