import type { VideoTables, VideoFunctions } from "./video-types";
import type { TownTables, TownFunctions } from "./town-types";
import type { SharedWorldTables, SharedWorldFunctions } from "./shared-world-types";
import type { Json } from "./types";
type Table<R, K extends keyof R> = {
  Row: R;
  Insert: Partial<R> & Pick<R, K>;
  Update: Partial<R>;
  Relationships: [];
};
export type WorldState = {
  conversation_id: string;
  user_id: string;
  character_key: string;
  activity: string;
  location: string;
  availability: string;
  current_event: Json;
  updated_at: string;
  next_transition_at: string;
  next_check_at: string;
};
export type WorldRecord = {
  id: string;
  conversation_id: string;
  user_id: string;
  character_key: string;
  kind: string;
  key: string;
  summary: string;
  status: string;
  source_message_id: string | null;
  source_quote: string;
  due_at: string | null;
  expires_at: string | null;
  retry_at: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
};
export type MediaAttempt = {
  action_id: string;
  conversation_id: string;
  user_id: string;
  status: string;
  storage_path: string | null;
  created_at: string;
};
export type WorldTables = VideoTables &
  TownTables &
  SharedWorldTables & {
    character_world_state: Table<
      WorldState,
      | "conversation_id"
      | "user_id"
      | "character_key"
      | "activity"
      | "location"
      | "availability"
      | "next_transition_at"
      | "next_check_at"
    >;
    world_records: Table<
      WorldRecord,
      | "id"
      | "conversation_id"
      | "user_id"
      | "character_key"
      | "kind"
      | "key"
      | "summary"
      | "status"
      | "source_quote"
    >;
    media_attempts: Table<MediaAttempt, "action_id" | "conversation_id" | "user_id">;
  };
export type WorldFunctions = VideoFunctions &
  TownFunctions &
  SharedWorldFunctions & {
    reserve_world_ai: { Args: { p_user_id: string; p_limit: number }; Returns: boolean };
    world_runtime_status: { Args: Record<string, never>; Returns: Json };
    reserve_image_attempt: {
      Args: {
        p_action_id: string;
        p_conversation_id: string;
        p_user_id: string;
        p_daily: number;
        p_monthly: number;
      };
      Returns: boolean;
    };
  };
