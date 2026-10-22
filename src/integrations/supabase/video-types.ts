import type { Json } from "./types";
export type UserVideoUpload = {
  id: string;
  user_id: string;
  conversation_id: string;
  storage_path: string;
  mime: string;
  bytes: number;
  duration_seconds: number;
  caption: string;
  status: string;
  created_at: string;
  sent_at: string | null;
};
export type VideoTables = {
  user_video_uploads: {
    Row: UserVideoUpload;
    Insert: Partial<UserVideoUpload>;
    Update: Partial<UserVideoUpload>;
    Relationships: [];
  };
};
export type VideoFunctions = {
  reserve_user_video: {
    Args: {
      p_user: string;
      p_id: string;
      p_conversation: string;
      p_mime: string;
      p_bytes: number;
      p_duration: number;
      p_caption: string;
    };
    Returns: Json;
  };
  deliver_user_video: { Args: { p_user: string; p_id: string }; Returns: Json };
};
