import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { TessActivity } from "./tess-life";
import {
  statedScene,
  conversationSchedule,
  sceneVersion,
  type ConversationScene,
} from "./photo-scene";
type Client = SupabaseClient<Database>;
export async function resolvePhotoScene(
  db: Client,
  user: string,
  conversation: string,
  base: TessActivity,
  now: Date,
  persist = false,
) {
  if ("scene" in base && base.scene)
    return {
      schedule: base,
      source: "living_experience",
      version: `experience:${JSON.stringify(base.scene)}`,
      observation: null as ConversationScene | null,
    };
  const recent = await db
    .from("messages")
    .select("id,body,created_at")
    .eq("user_id", user)
    .eq("conversation_id", conversation)
    .eq("sender", "tess")
    .lte("visible_at", now.toISOString())
    .gte("created_at", new Date(now.getTime() - 4 * 3600000).toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(60);
  if (recent.error) throw new Error("Current photo scene evidence unavailable");
  let observation: ConversationScene | null = null;
  for (const m of recent.data ?? []) {
    const s = statedScene(m.body ?? "");
    if (s) {
      observation = {
        ...s,
        sourceId: m.id,
        observedAt: m.created_at,
        expiresAt: new Date(Date.parse(m.created_at) + 4 * 3600000).toISOString(),
      };
      break;
    }
  }
  const stored = await db
    .from("character_scene_state" as never)
    .select("*")
    .eq("user_id", user)
    .eq("conversation_id", conversation)
    .gt("expires_at", now.toISOString())
    .maybeSingle();
  if (stored.error && !["42P01", "PGRST205"].includes(stored.error.code))
    throw new Error("Current character scene unavailable");
  const row = stored.data as unknown as {
    location: ConversationScene["location"];
    activity: string;
    source_id: string;
    observed_at: string;
    expires_at: string;
  } | null;
  if (
    row?.location &&
    (!observation || Date.parse(row.observed_at) > Date.parse(observation.observedAt))
  )
    observation = {
      location: row.location,
      activity: row.activity,
      sourceId: row.source_id,
      observedAt: row.observed_at,
      expiresAt: row.expires_at,
    };
  if (persist && observation) {
    const result = await db.rpc(
      "character_scene_apply" as never,
      {
        p_user: user,
        p_conversation: conversation,
        p_source: observation.sourceId,
        p_location: observation.location,
        p_activity: observation.activity,
        p_now: now.toISOString(),
      } as never,
    );
    if (result.error && !["42883", "PGRST202"].includes(result.error.code))
      throw new Error("Current photo scene could not be persisted");
  }
  const schedule = conversationSchedule(base, observation);
  return {
    schedule,
    source: observation ? "delivered_character_statement" : "schedule_or_world",
    version: sceneVersion(observation, schedule),
    observation,
  };
}
