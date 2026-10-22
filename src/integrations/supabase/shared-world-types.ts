import type { Json } from "./types";
import type { SharedPlan, SharedRsvp } from "@/lib/shared-world";
type ReadTable<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
export type SharedWorldTables = {
  world_places: ReadTable<{
    user_id: string;
    key: string;
    label: string;
    kind: string;
    metadata?: Json;
  }>;
  social_plans: ReadTable<SharedPlan>;
  social_rsvps: ReadTable<SharedRsvp>;
  social_presence: ReadTable<{
    user_id: string;
    character_key: string;
    plan_id: string;
    place_key: string;
    until_at: string;
  }>;
  social_exchanges: ReadTable<{
    user_id: string;
    id: string;
    plan_id: string;
    participants: string[];
    summary: string;
    occurred_at: string;
  }>;
};
export type SharedWorldFunctions = {
  shared_world_status: { Args: Record<string, never>; Returns: Json };
  shared_world_command: {
    Args: {
      p_user_id: string;
      p_plan_id: string;
      p_command: string;
      p_payload: Json;
      p_now: string;
      p_expected_version: number;
    };
    Returns: Json;
  };
};
