import type { Json } from "./types";
type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
export type InteractiveTables = {
  social_plans: Table<{
    origin: string;
    conversation_id: string | null;
    category: string;
    proposer: string | null;
    date_local: string | null;
    time_local: string | null;
    duration_minutes: number;
    user_response: string;
    character_response: string;
    missing_details: string[];
    conflicts: Json;
    followthrough: Json;
    source_message_id: string | null;
    last_message_id: string | null;
  }>;
  calendar_evidence: Table<{
    user_id: string;
    message_id: string;
    plan_id: string | null;
    action: string;
    payload: Json;
    created_at: string;
  }>;
  calendar_transitions: Table<{
    user_id: string;
    id: string;
    plan_id: string;
    from_status: string | null;
    to_status: string;
    reason: string;
    created_at: string;
  }>;
  venue_sessions: Table<{
    user_id: string;
    id: string;
    place_key: string;
    arrived_at: string;
    departed_at: string | null;
    state: Json;
  }>;
  venue_actions: Table<{
    user_id: string;
    id: string;
    session_id: string;
    plan_id: string | null;
    action: string;
    detail: string;
    result: Json;
    created_at: string;
  }>;
};
export type InteractiveFunctions = {
  interactive_world_status: { Args: Record<string, never>; Returns: number };
  calendar_pending: { Args: { p_user: string; p_now: string }; Returns: Json };
  calendar_apply: {
    Args: { p_user: string; p_message: string; p_payload: Json; p_now: string };
    Returns: Json;
  };
  calendar_advance: {
    Args: { p_user: string; p_now: string; p_blocked?: string[] };
    Returns: number;
  };
  venue_session: { Args: { p_user: string; p_now: string }; Returns: Json };
  venue_act: {
    Args: {
      p_user: string;
      p_id: string;
      p_place: string;
      p_action: string;
      p_detail: string;
      p_now: string;
      p_plan?: string | null;
      p_character?: string | null;
      p_quantity?: number;
    };
    Returns: Json;
  };
};
