export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      characters: {
        Row: {
          age: number
          avatar_key: string | null
          created_at: string
          enabled: boolean
          full_name: string
          id: string
          key: string
          preferred_name: string
          pronouns: string
          sort_order: number
          zip: string
        }
        Insert: {
          age: number
          avatar_key?: string | null
          created_at?: string
          enabled?: boolean
          full_name: string
          id?: string
          key: string
          preferred_name: string
          pronouns?: string
          sort_order?: number
          zip?: string
        }
        Update: {
          age?: number
          avatar_key?: string | null
          created_at?: string
          enabled?: boolean
          full_name?: string
          id?: string
          key?: string
          preferred_name?: string
          pronouns?: string
          sort_order?: number
          zip?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          character_id: string
          created_at: string
          difficulty: string
          id: string
          last_read_at: string | null
          muted: boolean
          photo_frequency: string
          read_receipts: boolean
          real_time_mode: boolean
          relationship_stage: string
          show_sim_data: boolean
          typing_indicator: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          difficulty?: string
          id?: string
          last_read_at?: string | null
          muted?: boolean
          photo_frequency?: string
          read_receipts?: boolean
          real_time_mode?: boolean
          relationship_stage?: string
          show_sim_data?: boolean
          typing_indicator?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          difficulty?: string
          id?: string
          last_read_at?: string | null
          muted?: boolean
          photo_frequency?: string
          read_receipts?: boolean
          real_time_mode?: boolean
          relationship_stage?: string
          show_sim_data?: boolean
          typing_indicator?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      debriefs: {
        Row: {
          analysis: Json
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          analysis: Json
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          analysis?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debriefs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_images: {
        Row: {
          camera_angle: string | null
          clothing_category: string | null
          conversation_id: string
          created_at: string
          crop_type: string | null
          expression: string | null
          hairstyle: string | null
          id: string
          identity_reference_used: string | null
          includes_tess: boolean
          is_selfie: boolean
          message_id: string | null
          model: string
          photo_type: string
          pose_type: string | null
          provider: string
          relationship_stage: string | null
          scene: string
          selfie_type: string | null
          setting: string | null
          state_snapshot: Json
          storage_path: string
          user_id: string
        }
        Insert: {
          camera_angle?: string | null
          clothing_category?: string | null
          conversation_id: string
          created_at?: string
          crop_type?: string | null
          expression?: string | null
          hairstyle?: string | null
          id?: string
          identity_reference_used?: string | null
          includes_tess?: boolean
          is_selfie?: boolean
          message_id?: string | null
          model: string
          photo_type: string
          pose_type?: string | null
          provider: string
          relationship_stage?: string | null
          scene: string
          selfie_type?: string | null
          setting?: string | null
          state_snapshot?: Json
          storage_path: string
          user_id: string
        }
        Update: {
          camera_angle?: string | null
          clothing_category?: string | null
          conversation_id?: string
          created_at?: string
          crop_type?: string | null
          expression?: string | null
          hairstyle?: string | null
          id?: string
          identity_reference_used?: string | null
          includes_tess?: boolean
          is_selfie?: boolean
          message_id?: string | null
          model?: string
          photo_type?: string
          pose_type?: string | null
          provider?: string
          relationship_stage?: string | null
          scene?: string
          selfie_type?: string | null
          setting?: string | null
          state_snapshot?: Json
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_images_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_images_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          detail: Json
          finished_at: string | null
          id: string
          job: string
          started_at: string
          status: string
        }
        Insert: {
          detail?: Json
          finished_at?: string | null
          id?: string
          job: string
          started_at?: string
          status?: string
        }
        Update: {
          detail?: Json
          finished_at?: string | null
          id?: string
          job?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          importance: number
          memory_type: string
          summary: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          importance?: number
          memory_type?: string
          summary: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          importance?: number
          memory_type?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          sender: string
          user_id: string
          visible_at: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          sender: string
          user_id: string
          visible_at?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          sender?: string
          user_id?: string
          visible_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          last_used_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          last_used_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          last_used_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tess_life: {
        Row: {
          conversation_id: string
          current_event: Json
          event_expires_at: string | null
          last_initiated_at: string | null
          last_initiation: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          current_event?: Json
          event_expires_at?: string | null
          last_initiated_at?: string | null
          last_initiation?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          current_event?: Json
          event_expires_at?: string | null
          last_initiated_at?: string | null
          last_initiation?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tess_life_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      tess_state: {
        Row: {
          comfort: number
          conversation_id: string
          curiosity: number
          emotional_intimacy: number
          irritation: number
          last_delta: Json
          last_tone: string | null
          perceived_pressure: number
          physical_attraction: number
          playfulness: number
          relationship_momentum: number
          respect: number
          romantic_attraction: number
          trust: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comfort?: number
          conversation_id: string
          curiosity?: number
          emotional_intimacy?: number
          irritation?: number
          last_delta?: Json
          last_tone?: string | null
          perceived_pressure?: number
          physical_attraction?: number
          playfulness?: number
          relationship_momentum?: number
          respect?: number
          romantic_attraction?: number
          trust?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comfort?: number
          conversation_id?: string
          curiosity?: number
          emotional_intimacy?: number
          irritation?: number
          last_delta?: Json
          last_tone?: string | null
          perceived_pressure?: number
          physical_attraction?: number
          playfulness?: number
          relationship_momentum?: number
          respect?: number
          romantic_attraction?: number
          trust?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tess_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile: {
        Row: {
          key: string
          quiet_end: number | null
          quiet_start: number | null
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          key: string
          quiet_end?: number | null
          quiet_start?: number | null
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          key?: string
          quiet_end?: number | null
          quiet_start?: number | null
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      world_events: {
        Row: {
          character_key: string
          conversation_id: string
          created_at: string
          id: string
          kind: string
          occurs_at: string
          payload: Json
          processed_at: string | null
          summary: string
          user_id: string
        }
        Insert: {
          character_key: string
          conversation_id: string
          created_at?: string
          id?: string
          kind: string
          occurs_at?: string
          payload?: Json
          processed_at?: string | null
          summary: string
          user_id: string
        }
        Update: {
          character_key?: string
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: string
          occurs_at?: string
          payload?: Json
          processed_at?: string | null
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
