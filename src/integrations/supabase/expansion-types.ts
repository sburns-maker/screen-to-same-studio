import type { Json } from "./types";
type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
export type ExpansionTables = {
  town_connections: Table<{ followups_enabled: boolean; last_followup_at: string | null }>;
  town_memories: Table<{
    user_id: string;
    npc_key: string;
    action_id: string;
    summary: string;
    source_quote: string;
    created_at: string;
  }>;
  town_intentions: Table<{
    user_id: string;
    id: string;
    npc_key: string;
    summary: string;
    source_quote: string;
    due_at: string;
    expires_at: string;
    status: string;
  }>;
  visual_identity_registry: Table<{
    user_id: string;
    entity_key: string;
    canonical_asset: string | null;
    canonical_sha256: string | null;
    approval: string;
    active_message_id: string | null;
    active_storage_path: string | null;
    active_reason: string;
    updated_at: string;
  }>;
  town_introductions: Table<{
    user_id: string;
    npc_key: string;
    source_message_id: string;
    source_character: string;
    created_at: string;
  }>;
};
export type ExpansionFunctions = {
  media_profile_status: { Args: Record<string, never>; Returns: number };
  set_profile_media: {
    Args: {
      p_user: string;
      p_key: string;
      p_avatar: string;
      p_canonical: string | null;
      p_sha: string | null;
      p_source: string | null;
    };
    Returns: boolean;
  };
  record_npc_introduction: {
    Args: { p_user: string; p_message: string; p_npc: string };
    Returns: boolean;
  };
  world_expansion_status: { Args: Record<string, never>; Returns: number };
  update_active_portrait: {
    Args: { p_user: string; p_key: string; p_message: string | null; p_reason: string };
    Returns: Json;
  };
};
