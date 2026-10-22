import type { Json } from "./types";
type Table<R> = { Row: R; Insert: R; Update: Partial<R>; Relationships: [] };
export type TownConnection = {
  user_id: string;
  npc_key: string;
  encountered_at: string;
  contact: boolean;
  contact_offered: boolean;
  read_at: string;
};
export type TownMessage = {
  user_id: string;
  id: string;
  npc_key: string;
  action_id: string;
  role: string;
  text: string;
  created_at: string;
};
export type TownPresence = {
  user_id: string;
  place_key: string;
  arrives_at: string;
  updated_at: string;
};
export type TownTables = {
  town_people: Table<{ user_id: string; key: string; profile: Json }>;
  town_presence: Table<TownPresence>;
  town_connections: Table<TownConnection>;
  town_messages: Table<TownMessage>;
  town_actions: Table<{
    user_id: string;
    id: string;
    npc_key: string;
    input: string;
    mode: string;
    status: string;
    created_at: string;
  }>;
  town_known_plans: Table<{ user_id: string; plan_id: string }>;
};
export type TownFunctions = {
  town_propose_plan: {
    Args: { p_user: string; p_id: string; p_payload: Json; p_now: string };
    Returns: Json;
  };
  town_status: { Args: Record<string, never>; Returns: number };
  town_command: {
    Args: { p_user: string; p_id: string; p_command: string; p_payload: Json; p_now: string };
    Returns: Json;
  };
};
