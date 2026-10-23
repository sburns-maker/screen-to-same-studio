import type { Json } from "./types";
import type { CallRow, CallPreferences } from "@/lib/phone-calls";
type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
export type PhoneTables = {
  phone_calls: Table<CallRow>;
  call_preferences: Table<CallPreferences & { user_id: string }>;
  call_turns: Table<{
    user_id: string;
    id: string;
    call_id: string;
    status: string;
    reserved_at: string;
    finished_at: string | null;
    audio_seconds: number;
    reserved_cents: number;
    action_id: string | null;
    user_message_id: string | null;
    latency_ms: number | null;
  }>;
};
export type PhoneFunctions = {
  phone_status: { Args: Record<string, never>; Returns: number };
  phone_command: {
    Args: { p_user: string; p_id: string; p_command: string; p_payload: Json; p_now: string };
    Returns: Json;
  };
};
