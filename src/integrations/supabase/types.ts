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
      api18_jobs: {
        Row: {
          user_id: string
          action_id: string
          conversation_id: string | null
          character_key: string
          request_hash: string
          job_id: string | null
          status: string
          reserved_cents: number
          cost_usd: number | null
          refund_expected: boolean
          failure_code: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          action_id: string
          conversation_id?: string | null
          character_key: string
          request_hash: string
          job_id?: string | null
          status: string
          reserved_cents: number
          cost_usd?: number | null
          refund_expected?: boolean
          failure_code?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          action_id?: string
          conversation_id?: string | null
          character_key?: string
          request_hash?: string
          job_id?: string | null
          status?: string
          reserved_cents?: number
          cost_usd?: number | null
          refund_expected?: boolean
          failure_code?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {foreignKeyName:"api18_jobs_conversation_id_fkey";columns:["conversation_id"];isOneToOne:false;referencedRelation:"conversations";referencedColumns:["id"]}
        ]
      }
      photo_reference_state: {
        Row: {
          user_id: string
          character_key: string
          api18_enabled: boolean
          adult_confirmed: boolean
          version: number
          last_action: string | null
        }
        Insert: {
          user_id: string
          character_key: string
          api18_enabled?: boolean
          adult_confirmed?: boolean
          version?: number
          last_action?: string | null
        }
        Update: {
          user_id?: string
          character_key?: string
          api18_enabled?: boolean
          adult_confirmed?: boolean
          version?: number
          last_action?: string | null
        }
        Relationships: []
      }
      photo_reference_slots: {
        Row: {
          user_id: string
          character_key: string
          role: string
          asset: string
          source_message_id: string | null
          content_sha256: string
          canonical_sha256: string
          reviewed_at: string
        }
        Insert: {
          user_id: string
          character_key: string
          role: string
          asset: string
          source_message_id?: string | null
          content_sha256: string
          canonical_sha256: string
          reviewed_at?: string
        }
        Update: {
          user_id?: string
          character_key?: string
          role?: string
          asset?: string
          source_message_id?: string | null
          content_sha256?: string
          canonical_sha256?: string
          reviewed_at?: string
        }
        Relationships: [
          {foreignKeyName: "photo_reference_slots_source_message_id_fkey";columns:["source_message_id"];isOneToOne:false;referencedRelation:"messages";referencedColumns:["id"]},
          {foreignKeyName: "photo_reference_slots_user_id_character_key_fkey";columns:["user_id","character_key"];isOneToOne:false;referencedRelation:"photo_reference_state";referencedColumns:["user_id","character_key"]}
        ]
      }
      photo_reference_rejections: {
        Row: {
          user_id: string
          character_key: string
          asset: string
          source_message_id: string
          canonical_sha256: string
          reviewed_at: string
        }
        Insert: {
          user_id: string
          character_key: string
          asset: string
          source_message_id: string
          canonical_sha256: string
          reviewed_at?: string
        }
        Update: {
          user_id?: string
          character_key?: string
          asset?: string
          source_message_id?: string
          canonical_sha256?: string
          reviewed_at?: string
        }
        Relationships: [
          {foreignKeyName: "photo_reference_rejections_source_message_id_fkey";columns:["source_message_id"];isOneToOne:false;referencedRelation:"messages";referencedColumns:["id"]},
          {foreignKeyName: "photo_reference_rejections_user_id_character_key_fkey";columns:["user_id","character_key"];isOneToOne:false;referencedRelation:"photo_reference_state";referencedColumns:["user_id","character_key"]}
        ]
      }
      photo_reference_actions: {
        Row: {
          user_id: string
          id: string
          character_key: string
          request: Json
          previous: Json
          result: Json
          created_at: string
        }
        Insert: {
          user_id: string
          id: string
          character_key: string
          request: Json
          previous: Json
          result: Json
          created_at?: string
        }
        Update: {
          user_id?: string
          id?: string
          character_key?: string
          request?: Json
          previous?: Json
          result?: Json
          created_at?: string
        }
        Relationships: [
          {foreignKeyName: "photo_reference_actions_user_id_character_key_fkey";columns:["user_id","character_key"];isOneToOne:false;referencedRelation:"photo_reference_state";referencedColumns:["user_id","character_key"]}
        ]
      }
      calendar_action_receipts: {
        Row: {
          created_at: string
          ordinal: number
          payload: Json
          plan_id: string | null
          result: Json
          source_id: string
          source_kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ordinal: number
          payload: Json
          plan_id?: string | null
          result: Json
          source_id: string
          source_kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          ordinal?: number
          payload?: Json
          plan_id?: string | null
          result?: Json
          source_id?: string
          source_kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_action_receipts_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      calendar_evidence: {
        Row: {
          action: string
          created_at: string
          message_id: string
          payload: Json
          plan_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          message_id: string
          payload?: Json
          plan_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          message_id?: string
          payload?: Json
          plan_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_evidence_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_evidence_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      calendar_manual_actions: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          payload: Json
          plan_id: string | null
          plan_version: number | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id: string
          payload: Json
          plan_id?: string | null
          plan_version?: number | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          payload?: Json
          plan_id?: string | null
          plan_version?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_manual_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_manual_actions_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      calendar_transitions: {
        Row: {
          created_at: string
          from_status: string | null
          id: string
          plan_id: string
          reason: string
          to_status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_status?: string | null
          id: string
          plan_id: string
          reason: string
          to_status: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_status?: string | null
          id?: string
          plan_id?: string
          reason?: string
          to_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_transitions_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      call_preferences: {
        Row: {
          enabled: boolean
          incoming: boolean
          save_transcripts: boolean
          user_id: string
        }
        Insert: {
          enabled?: boolean
          incoming?: boolean
          save_transcripts?: boolean
          user_id: string
        }
        Update: {
          enabled?: boolean
          incoming?: boolean
          save_transcripts?: boolean
          user_id?: string
        }
        Relationships: []
      }
      call_turns: {
        Row: {
          action_id: string | null
          audio_seconds: number
          call_id: string
          finished_at: string | null
          id: string
          latency_ms: number | null
          reserved_at: string
          reserved_cents: number
          status: string
          user_id: string
          user_message_id: string | null
        }
        Insert: {
          action_id?: string | null
          audio_seconds: number
          call_id: string
          finished_at?: string | null
          id: string
          latency_ms?: number | null
          reserved_at: string
          reserved_cents: number
          status: string
          user_id: string
          user_message_id?: string | null
        }
        Update: {
          action_id?: string | null
          audio_seconds?: number
          call_id?: string
          finished_at?: string | null
          id?: string
          latency_ms?: number | null
          reserved_at?: string
          reserved_cents?: number
          status?: string
          user_id?: string
          user_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_turns_user_id_call_id_fkey"
            columns: ["user_id", "call_id"]
            isOneToOne: false
            referencedRelation: "phone_calls"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      character_knowledge: {
        Row: {
          acquired_at: string
          character_key: string
          id: string
          knowledge_type: string
          source: string
          subject_id: string
          subject_type: string
          summary: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          character_key: string
          id?: string
          knowledge_type: string
          source?: string
          subject_id: string
          subject_type: string
          summary: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          character_key?: string
          id?: string
          knowledge_type?: string
          source?: string
          subject_id?: string
          subject_type?: string
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      character_scene_state: {
        Row: {
          activity: string
          conversation_id: string
          expires_at: string
          location: string
          observed_at: string
          source_id: string
          user_id: string
        }
        Insert: {
          activity: string
          conversation_id: string
          expires_at: string
          location: string
          observed_at: string
          source_id: string
          user_id: string
        }
        Update: {
          activity?: string
          conversation_id?: string
          expires_at?: string
          location?: string
          observed_at?: string
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_scene_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_scene_state_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      character_voices: {
        Row: {
          character_key: string
          label: string
          set_by: string | null
          updated_at: string
          voice_id: string
        }
        Insert: {
          character_key: string
          label?: string
          set_by?: string | null
          updated_at?: string
          voice_id: string
        }
        Update: {
          character_key?: string
          label?: string
          set_by?: string | null
          updated_at?: string
          voice_id?: string
        }
        Relationships: []
      }
      character_world_state: {
        Row: {
          activity: string
          availability: string
          character_key: string
          conversation_id: string
          current_event: Json
          location: string
          next_check_at: string
          next_transition_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity: string
          availability: string
          character_key: string
          conversation_id: string
          current_event?: Json
          location: string
          next_check_at: string
          next_transition_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity?: string
          availability?: string
          character_key?: string
          conversation_id?: string
          current_event?: Json
          location?: string
          next_check_at?: string
          next_transition_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_world_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
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
          mature_photography: boolean
          muted: boolean
          photo_boundary: string
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
          mature_photography?: boolean
          muted?: boolean
          photo_boundary?: string
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
          mature_photography?: boolean
          muted?: boolean
          photo_boundary?: string
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
      event_participants: {
        Row: {
          created_at: string
          event_id: string
          met: Json
          participant_key: string
          participant_type: string
          perspective: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          met?: Json
          participant_key: string
          participant_type: string
          perspective?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          met?: Json
          participant_key?: string
          participant_type?: string
          perspective?: string
          user_id?: string
        }
        Relationships: []
      }
      experience_action_receipts: {
        Row: {
          command: string
          id: string
          plan_id: string
          result: Json
          user_id: string
        }
        Insert: {
          command: string
          id: string
          plan_id: string
          result: Json
          user_id: string
        }
        Update: {
          command?: string
          id?: string
          plan_id?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_action_receipts_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "living_experiences"
            referencedColumns: ["user_id", "plan_id"]
          },
        ]
      }
      experience_operations: {
        Row: {
          attempts: number
          body: string
          created_at: string
          experience_id: string
          id: string
          kind: string
          lease_until: string
          result: Json | null
          revision: number
          status: string
          token: string
          user_id: string
        }
        Insert: {
          attempts?: number
          body?: string
          created_at?: string
          experience_id: string
          id: string
          kind: string
          lease_until: string
          result?: Json | null
          revision: number
          status?: string
          token: string
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          experience_id?: string
          id?: string
          kind?: string
          lease_until?: string
          result?: Json | null
          revision?: number
          status?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_operations_user_id_experience_id_fkey"
            columns: ["user_id", "experience_id"]
            isOneToOne: false
            referencedRelation: "living_experiences"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      experience_scene_transitions: {
        Row: {
          after_scene: Json
          before_scene: Json | null
          changed: boolean
          created_at: string
          evidence_quote: string
          experience_id: string
          source_id: string
          source_ordinal: number
          user_id: string
        }
        Insert: {
          after_scene: Json
          before_scene?: Json | null
          changed: boolean
          created_at?: string
          evidence_quote: string
          experience_id: string
          source_id: string
          source_ordinal: number
          user_id: string
        }
        Update: {
          after_scene?: Json
          before_scene?: Json | null
          changed?: boolean
          created_at?: string
          evidence_quote?: string
          experience_id?: string
          source_id?: string
          source_ordinal?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_scene_transitions_user_id_experience_id_fkey"
            columns: ["user_id", "experience_id"]
            isOneToOne: false
            referencedRelation: "living_experiences"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "experience_scene_transitions_user_id_source_id_fkey"
            columns: ["user_id", "source_id"]
            isOneToOne: false
            referencedRelation: "living_experience_moments"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      experience_settings: {
        Row: {
          enabled: boolean
          installed_at: string
          singleton: boolean
          window_hours: number
        }
        Insert: {
          enabled?: boolean
          installed_at?: string
          singleton?: boolean
          window_hours?: number
        }
        Update: {
          enabled?: boolean
          installed_at?: string
          singleton?: boolean
          window_hours?: number
        }
        Relationships: []
      }
      game_matches: {
        Row: {
          conversation_id: string
          created_at: string
          effects_applied: boolean
          game: string
          id: string
          match_key: string
          progress: Json
          result: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          effects_applied?: boolean
          game: string
          id?: string
          match_key: string
          progress?: Json
          result?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          effects_applied?: boolean
          game?: string
          id?: string
          match_key?: string
          progress?: Json
          result?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_matches_conversation_id_fkey"
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
      housing_access: {
        Row: {
          expires_at: string | null
          granted_at: string
          permission: string
          plan_id: string | null
          residence_id: string
          source: string
          user_id: string
          viewer: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          permission: string
          plan_id?: string | null
          residence_id: string
          source: string
          user_id: string
          viewer: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          permission?: string
          plan_id?: string | null
          residence_id?: string
          source?: string
          user_id?: string
          viewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "housing_access_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "housing_access_user_id_residence_id_fkey"
            columns: ["user_id", "residence_id"]
            isOneToOne: false
            referencedRelation: "housing_residences"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      housing_action_outbox: {
        Row: {
          actions: Json
          created_at: string
          failure: string | null
          processed: boolean
          source_id: string
          source_kind: string
          user_id: string
        }
        Insert: {
          actions: Json
          created_at?: string
          failure?: string | null
          processed?: boolean
          source_id: string
          source_kind: string
          user_id: string
        }
        Update: {
          actions?: Json
          created_at?: string
          failure?: string | null
          processed?: boolean
          source_id?: string
          source_kind?: string
          user_id?: string
        }
        Relationships: []
      }
      housing_events: {
        Row: {
          detail: Json
          event_type: string
          id: string
          occurred_at: string
          person_key: string | null
          residence_id: string | null
          user_id: string
        }
        Insert: {
          detail: Json
          event_type: string
          id: string
          occurred_at: string
          person_key?: string | null
          residence_id?: string | null
          user_id: string
        }
        Update: {
          detail?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          person_key?: string | null
          residence_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      housing_goals: {
        Row: {
          created_at: string
          goal: string
          person_key: string
          source_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal: string
          person_key: string
          source_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string
          person_key?: string
          source_id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      housing_households: {
        Row: {
          arrangement: string
          consent_review_required: boolean
          dependents: Json
          id: string
          permissions: Json
          pets: Json
          residence_id: string
          shared_expenses: Json
          user_id: string
        }
        Insert: {
          arrangement?: string
          consent_review_required?: boolean
          dependents?: Json
          id: string
          permissions?: Json
          pets?: Json
          residence_id: string
          shared_expenses?: Json
          user_id: string
        }
        Update: {
          arrangement?: string
          consent_review_required?: boolean
          dependents?: Json
          id?: string
          permissions?: Json
          pets?: Json
          residence_id?: string
          shared_expenses?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "housing_households_user_id_residence_id_fkey"
            columns: ["user_id", "residence_id"]
            isOneToOne: true
            referencedRelation: "housing_residences"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      housing_memberships: {
        Row: {
          ended_at: string | null
          expires_at: string | null
          household_id: string
          id: string
          kind: string
          person_key: string
          relation: string
          residence_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          ended_at?: string | null
          expires_at?: string | null
          household_id: string
          id: string
          kind?: string
          person_key: string
          relation?: string
          residence_id: string
          started_at: string
          user_id: string
        }
        Update: {
          ended_at?: string | null
          expires_at?: string | null
          household_id?: string
          id?: string
          kind?: string
          person_key?: string
          relation?: string
          residence_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "housing_memberships_user_id_household_id_fkey"
            columns: ["user_id", "household_id"]
            isOneToOne: false
            referencedRelation: "housing_households"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "housing_memberships_user_id_person_key_fkey"
            columns: ["user_id", "person_key"]
            isOneToOne: false
            referencedRelation: "housing_people"
            referencedColumns: ["user_id", "person_key"]
          },
          {
            foreignKeyName: "housing_memberships_user_id_residence_id_fkey"
            columns: ["user_id", "residence_id"]
            isOneToOne: false
            referencedRelation: "housing_residences"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      housing_people: {
        Row: {
          initialized: boolean
          label: string
          person_key: string
          source: string
          user_id: string
        }
        Insert: {
          initialized?: boolean
          label: string
          person_key: string
          source: string
          user_id: string
        }
        Update: {
          initialized?: boolean
          label?: string
          person_key?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      housing_proposals: {
        Row: {
          created_at: string
          ends_at: string | null
          from_homes: Json
          id: string
          initiator: string
          kind: string
          movers: string[]
          plan_id: string | null
          purpose: string
          required: string[]
          residence_id: string
          responses: Json
          starts_at: string | null
          status: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          from_homes: Json
          id: string
          initiator: string
          kind: string
          movers: string[]
          plan_id?: string | null
          purpose?: string
          required: string[]
          residence_id: string
          responses: Json
          starts_at?: string | null
          status?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          from_homes?: Json
          id?: string
          initiator?: string
          kind?: string
          movers?: string[]
          plan_id?: string | null
          purpose?: string
          required?: string[]
          residence_id?: string
          responses?: Json
          starts_at?: string | null
          status?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "housing_proposals_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "housing_proposals_user_id_residence_id_fkey"
            columns: ["user_id", "residence_id"]
            isOneToOne: false
            referencedRelation: "housing_residences"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      housing_receipts: {
        Row: {
          actor: string
          command: string
          id: string
          payload: Json
          result: Json
          user_id: string
        }
        Insert: {
          actor: string
          command: string
          id: string
          payload: Json
          result: Json
          user_id: string
        }
        Update: {
          actor?: string
          command?: string
          id?: string
          payload?: Json
          result?: Json
          user_id?: string
        }
        Relationships: []
      }
      housing_residences: {
        Row: {
          address: string | null
          arrangement: string
          community: string
          created_at: string
          created_by: string | null
          description: string
          exact_latitude: number | null
          exact_longitude: number | null
          housing_type: string
          id: string
          label: string
          latitude: number
          longitude: number
          neighborhood: string
          place_key: string
          provisional: boolean
          show_exact: boolean
          user_id: string
        }
        Insert: {
          address?: string | null
          arrangement?: string
          community?: string
          created_at?: string
          created_by?: string | null
          description?: string
          exact_latitude?: number | null
          exact_longitude?: number | null
          housing_type?: string
          id: string
          label: string
          latitude?: number
          longitude?: number
          neighborhood?: string
          place_key: string
          provisional?: boolean
          show_exact?: boolean
          user_id: string
        }
        Update: {
          address?: string | null
          arrangement?: string
          community?: string
          created_at?: string
          created_by?: string | null
          description?: string
          exact_latitude?: number | null
          exact_longitude?: number | null
          housing_type?: string
          id?: string
          label?: string
          latitude?: number
          longitude?: number
          neighborhood?: string
          place_key?: string
          provisional?: boolean
          show_exact?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "housing_residences_user_id_place_key_fkey"
            columns: ["user_id", "place_key"]
            isOneToOne: true
            referencedRelation: "world_places"
            referencedColumns: ["user_id", "key"]
          },
        ]
      }
      interactive_world_installation: {
        Row: {
          id: boolean
          installed_at: string
        }
        Insert: {
          id?: boolean
          installed_at?: string
        }
        Update: {
          id?: boolean
          installed_at?: string
        }
        Relationships: []
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
      live_character_calls: {
        Row: {
          character_key: string
          close_reason: string | null
          conversation_id: string
          created_at: string
          deadline_at: string
          ended_at: string | null
          id: string
          lease_until: string
          reserved_seconds: number
          session_id: string | null
          state: string
          summary_saved: boolean
          usage_seconds: number | null
          user_id: string
          voice_id: string
        }
        Insert: {
          character_key: string
          close_reason?: string | null
          conversation_id: string
          created_at?: string
          deadline_at: string
          ended_at?: string | null
          id?: string
          lease_until: string
          reserved_seconds: number
          session_id?: string | null
          state?: string
          summary_saved?: boolean
          usage_seconds?: number | null
          user_id: string
          voice_id: string
        }
        Update: {
          character_key?: string
          close_reason?: string | null
          conversation_id?: string
          created_at?: string
          deadline_at?: string
          ended_at?: string | null
          id?: string
          lease_until?: string
          reserved_seconds?: number
          session_id?: string | null
          state?: string
          summary_saved?: boolean
          usage_seconds?: number | null
          user_id?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_character_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      living_experience_moments: {
        Row: {
          body: string
          confirmed: boolean
          created_at: string
          experience_id: string
          id: string
          kind: string
          ordinal: number
          source: string
          user_id: string
        }
        Insert: {
          body: string
          confirmed?: boolean
          created_at?: string
          experience_id: string
          id: string
          kind: string
          ordinal: number
          source: string
          user_id: string
        }
        Update: {
          body?: string
          confirmed?: boolean
          created_at?: string
          experience_id?: string
          id?: string
          kind?: string
          ordinal?: number
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "living_experience_moments_user_id_experience_id_fkey"
            columns: ["user_id", "experience_id"]
            isOneToOne: false
            referencedRelation: "living_experiences"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      living_experiences: {
        Row: {
          claim_deadline: string
          claimed_at: string | null
          conversation_id: string | null
          id: string
          last_failure: string | null
          live_scene: Json | null
          mode: string | null
          outcome_id: string | null
          plan_id: string
          plan_version: number | null
          revision: number
          scene_revision: number
          scene_source_ordinal: number
          start_at: string
          state: string
          summary: string
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          claim_deadline: string
          claimed_at?: string | null
          conversation_id?: string | null
          id?: string
          last_failure?: string | null
          live_scene?: Json | null
          mode?: string | null
          outcome_id?: string | null
          plan_id: string
          plan_version?: number | null
          revision?: number
          scene_revision?: number
          scene_source_ordinal?: number
          start_at: string
          state?: string
          summary?: string
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          claim_deadline?: string
          claimed_at?: string | null
          conversation_id?: string | null
          id?: string
          last_failure?: string | null
          live_scene?: Json | null
          mode?: string | null
          outcome_id?: string | null
          plan_id?: string
          plan_version?: number | null
          revision?: number
          scene_revision?: number
          scene_source_ordinal?: number
          start_at?: string
          state?: string
          summary?: string
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "living_experiences_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: true
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      media_attempts: {
        Row: {
          action_id: string
          conversation_id: string
          created_at: string
          status: string
          storage_path: string | null
          user_id: string
        }
        Insert: {
          action_id: string
          conversation_id: string
          created_at?: string
          status?: string
          storage_path?: string | null
          user_id: string
        }
        Update: {
          action_id?: string
          conversation_id?: string
          created_at?: string
          status?: string
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_attempts_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: true
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_attempts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
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
      npcs: {
        Row: {
          blurb: string
          canon: boolean
          category: string
          character_key: string
          created_at: string
          id: string
          name: string
          relation: string
          user_id: string
        }
        Insert: {
          blurb?: string
          canon?: boolean
          category?: string
          character_key: string
          created_at?: string
          id?: string
          name: string
          relation: string
          user_id: string
        }
        Update: {
          blurb?: string
          canon?: boolean
          category?: string
          character_key?: string
          created_at?: string
          id?: string
          name?: string
          relation?: string
          user_id?: string
        }
        Relationships: []
      }
      phone_calls: {
        Row: {
          answered_at: string | null
          character_key: string
          conversation_id: string
          direction: string
          duration_seconds: number
          ended_at: string | null
          expires_at: string
          id: string
          last_failure: string | null
          last_latency_ms: number | null
          offered_at: string
          outcome: string
          reason: string
          reserved_cents: number
          ring_until: string
          source_record_id: string | null
          state: string
          summary: string
          turns: number
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          character_key: string
          conversation_id: string
          direction: string
          duration_seconds?: number
          ended_at?: string | null
          expires_at: string
          id: string
          last_failure?: string | null
          last_latency_ms?: number | null
          offered_at: string
          outcome: string
          reason: string
          reserved_cents?: number
          ring_until: string
          source_record_id?: string | null
          state: string
          summary?: string
          turns?: number
          user_id: string
        }
        Update: {
          answered_at?: string | null
          character_key?: string
          conversation_id?: string
          direction?: string
          duration_seconds?: number
          ended_at?: string | null
          expires_at?: string
          id?: string
          last_failure?: string | null
          last_latency_ms?: number | null
          offered_at?: string
          outcome?: string
          reason?: string
          reserved_cents?: number
          ring_until?: string
          source_record_id?: string | null
          state?: string
          summary?: string
          turns?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_calls_character_key_fkey"
            columns: ["character_key"]
            isOneToOne: false
            referencedRelation: "phone_contacts"
            referencedColumns: ["entity_key"]
          },
          {
            foreignKeyName: "phone_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_contacts: {
        Row: {
          entity_key: string
          extension: number
        }
        Insert: {
          entity_key: string
          extension: number
        }
        Update: {
          entity_key?: string
          extension?: number
        }
        Relationships: []
      }
      profile_identity_changes: {
        Row: {
          canonical_changed: boolean
          created_at: string
          entity_key: string
          id: string
          new_asset: string
          old_asset: string | null
          source_message_id: string | null
          user_id: string
        }
        Insert: {
          canonical_changed?: boolean
          created_at?: string
          entity_key: string
          id?: string
          new_asset: string
          old_asset?: string | null
          source_message_id?: string | null
          user_id: string
        }
        Update: {
          canonical_changed?: boolean
          created_at?: string
          entity_key?: string
          id?: string
          new_asset?: string
          old_asset?: string | null
          source_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_identity_changes_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
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
      relationship_evaluations: {
        Row: {
          character_perspective: string | null
          context_summary: string | null
          conversation_id: string
          delta: Json
          evaluated_at: string
          event_tags: string[]
          id: string
          message_id: string
          observed_tone: string | null
          source_kind: string
          stage_after: string
          stage_before: string
          state_after: Json
          state_before: Json
          user_id: string
        }
        Insert: {
          character_perspective?: string | null
          context_summary?: string | null
          conversation_id: string
          delta: Json
          evaluated_at?: string
          event_tags?: string[]
          id?: string
          message_id: string
          observed_tone?: string | null
          source_kind?: string
          stage_after: string
          stage_before: string
          state_after: Json
          state_before: Json
          user_id: string
        }
        Update: {
          character_perspective?: string | null
          context_summary?: string | null
          conversation_id?: string
          delta?: Json
          evaluated_at?: string
          event_tags?: string[]
          id?: string
          message_id?: string
          observed_tone?: string | null
          source_kind?: string
          stage_after?: string
          stage_before?: string
          state_after?: Json
          state_before?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_evaluations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_evaluations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_events: {
        Row: {
          created_at: string
          facts: Json
          id: string
          kind: string
          location: string
          occurs_at: string
          source: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          facts?: Json
          id: string
          kind: string
          location?: string
          occurs_at: string
          source?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          facts?: Json
          id?: string
          kind?: string
          location?: string
          occurs_at?: string
          source?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      social_exchanges: {
        Row: {
          id: string
          occurred_at: string
          participants: string[]
          plan_id: string
          summary: string
          user_id: string
        }
        Insert: {
          id: string
          occurred_at: string
          participants: string[]
          plan_id: string
          summary: string
          user_id: string
        }
        Update: {
          id?: string
          occurred_at?: string
          participants?: string[]
          plan_id?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_exchanges_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: true
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      social_links: {
        Row: {
          canon: boolean
          character_key: string
          created_at: string
          id: string
          level: string
          opinion: string
          other_key: string
          other_type: string
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canon?: boolean
          character_key: string
          created_at?: string
          id?: string
          level?: string
          opinion?: string
          other_key: string
          other_type: string
          reason?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canon?: boolean
          character_key?: string
          created_at?: string
          id?: string
          level?: string
          opinion?: string
          other_key?: string
          other_type?: string
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_plans: {
        Row: {
          category: string
          character_response: string
          conflicts: Json
          conversation_id: string | null
          created_at: string
          date_local: string | null
          description: string
          duration_minutes: number
          ends_at: string | null
          followthrough: Json
          housing_proposal_id: string | null
          id: string
          last_message_id: string | null
          missing_details: string[]
          organizer: string
          origin: string
          parent_plan_id: string | null
          place_key: string | null
          proposer: string | null
          source_message_id: string | null
          starts_at: string | null
          status: string
          time_hint: string | null
          time_local: string | null
          time_zone: string
          title: string
          user_attendance: string
          user_id: string
          user_response: string
          version: number
        }
        Insert: {
          category?: string
          character_response?: string
          conflicts?: Json
          conversation_id?: string | null
          created_at?: string
          date_local?: string | null
          description?: string
          duration_minutes?: number
          ends_at?: string | null
          followthrough?: Json
          housing_proposal_id?: string | null
          id: string
          last_message_id?: string | null
          missing_details?: string[]
          organizer: string
          origin?: string
          parent_plan_id?: string | null
          place_key?: string | null
          proposer?: string | null
          source_message_id?: string | null
          starts_at?: string | null
          status?: string
          time_hint?: string | null
          time_local?: string | null
          time_zone?: string
          title: string
          user_attendance?: string
          user_id: string
          user_response?: string
          version?: number
        }
        Update: {
          category?: string
          character_response?: string
          conflicts?: Json
          conversation_id?: string | null
          created_at?: string
          date_local?: string | null
          description?: string
          duration_minutes?: number
          ends_at?: string | null
          followthrough?: Json
          housing_proposal_id?: string | null
          id?: string
          last_message_id?: string | null
          missing_details?: string[]
          organizer?: string
          origin?: string
          parent_plan_id?: string | null
          place_key?: string | null
          proposer?: string | null
          source_message_id?: string | null
          starts_at?: string | null
          status?: string
          time_hint?: string | null
          time_local?: string | null
          time_zone?: string
          title?: string
          user_attendance?: string
          user_id?: string
          user_response?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "housing_plan_proposal"
            columns: ["user_id", "housing_proposal_id"]
            isOneToOne: false
            referencedRelation: "housing_proposals"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "plan_parent_owner"
            columns: ["user_id", "parent_plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "social_plans_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_plans_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_plans_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_plans_user_id_place_key_fkey"
            columns: ["user_id", "place_key"]
            isOneToOne: false
            referencedRelation: "world_places"
            referencedColumns: ["user_id", "key"]
          },
        ]
      }
      social_presence: {
        Row: {
          character_key: string
          place_key: string
          plan_id: string
          until_at: string
          user_id: string
        }
        Insert: {
          character_key: string
          place_key: string
          plan_id: string
          until_at: string
          user_id: string
        }
        Update: {
          character_key?: string
          place_key?: string
          plan_id?: string
          until_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_presence_user_id_place_key_fkey"
            columns: ["user_id", "place_key"]
            isOneToOne: false
            referencedRelation: "world_places"
            referencedColumns: ["user_id", "key"]
          },
          {
            foreignKeyName: "social_presence_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      social_rsvps: {
        Row: {
          channel: string
          character_key: string
          plan_id: string
          reason: string
          response: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          character_key: string
          plan_id: string
          reason?: string
          response: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          character_key?: string
          plan_id?: string
          reason?: string
          response?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_rsvps_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
        ]
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
          romantic_intent: number
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
          romantic_intent?: number
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
          romantic_intent?: number
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
      town_actions: {
        Row: {
          created_at: string
          id: string
          input: string
          mode: string
          npc_key: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          input: string
          mode: string
          npc_key: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input?: string
          mode?: string
          npc_key?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      town_connections: {
        Row: {
          contact: boolean
          contact_offered: boolean
          encountered_at: string
          followups_enabled: boolean
          last_followup_at: string | null
          npc_key: string
          read_at: string
          user_id: string
        }
        Insert: {
          contact?: boolean
          contact_offered?: boolean
          encountered_at?: string
          followups_enabled?: boolean
          last_followup_at?: string | null
          npc_key: string
          read_at?: string
          user_id: string
        }
        Update: {
          contact?: boolean
          contact_offered?: boolean
          encountered_at?: string
          followups_enabled?: boolean
          last_followup_at?: string | null
          npc_key?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      town_intentions: {
        Row: {
          due_at: string
          expires_at: string
          id: string
          npc_key: string
          source_quote: string
          status: string
          summary: string
          user_id: string
        }
        Insert: {
          due_at: string
          expires_at: string
          id: string
          npc_key: string
          source_quote: string
          status?: string
          summary: string
          user_id: string
        }
        Update: {
          due_at?: string
          expires_at?: string
          id?: string
          npc_key?: string
          source_quote?: string
          status?: string
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      town_introductions: {
        Row: {
          created_at: string
          npc_key: string
          source_character: string
          source_message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          npc_key: string
          source_character: string
          source_message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          npc_key?: string
          source_character?: string
          source_message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "town_introductions_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      town_known_plans: {
        Row: {
          plan_id: string
          user_id: string
        }
        Insert: {
          plan_id: string
          user_id: string
        }
        Update: {
          plan_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "town_known_plans_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: true
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      town_memories: {
        Row: {
          action_id: string
          created_at: string
          npc_key: string
          source_quote: string
          summary: string
          user_id: string
        }
        Insert: {
          action_id: string
          created_at?: string
          npc_key: string
          source_quote: string
          summary: string
          user_id: string
        }
        Update: {
          action_id?: string
          created_at?: string
          npc_key?: string
          source_quote?: string
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      town_messages: {
        Row: {
          action_id: string
          created_at: string
          id: string
          npc_key: string
          role: string
          text: string
          user_id: string
        }
        Insert: {
          action_id: string
          created_at?: string
          id: string
          npc_key: string
          role: string
          text: string
          user_id: string
        }
        Update: {
          action_id?: string
          created_at?: string
          id?: string
          npc_key?: string
          role?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "town_messages_user_id_action_id_fkey"
            columns: ["user_id", "action_id"]
            isOneToOne: false
            referencedRelation: "town_actions"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "town_messages_user_id_npc_key_fkey"
            columns: ["user_id", "npc_key"]
            isOneToOne: false
            referencedRelation: "town_connections"
            referencedColumns: ["user_id", "npc_key"]
          },
        ]
      }
      town_people: {
        Row: {
          key: string
          profile: Json
          user_id: string
        }
        Insert: {
          key: string
          profile: Json
          user_id: string
        }
        Update: {
          key?: string
          profile?: Json
          user_id?: string
        }
        Relationships: []
      }
      town_presence: {
        Row: {
          arrives_at: string
          place_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          arrives_at?: string
          place_key?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          arrives_at?: string
          place_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      travel_trip_moments: {
        Row: {
          body: string
          created_at: string
          day: number
          id: string
          photo_caption: string | null
          photo_path: string | null
          stop_id: string
          trip_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          day: number
          id: string
          photo_caption?: string | null
          photo_path?: string | null
          stop_id: string
          trip_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          day?: number
          id?: string
          photo_caption?: string | null
          photo_path?: string | null
          stop_id?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_trip_moments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "travel_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_trips: {
        Row: {
          companions: Json
          created_at: string
          destination: string
          end_date: string | null
          id: string
          itinerary: Json
          mode: string
          notes: Json
          origin: string
          purpose: string
          revision: number
          start_date: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          companions?: Json
          created_at?: string
          destination: string
          end_date?: string | null
          id: string
          itinerary?: Json
          mode: string
          notes?: Json
          origin: string
          purpose: string
          revision?: number
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          companions?: Json
          created_at?: string
          destination?: string
          end_date?: string | null
          id?: string
          itinerary?: Json
          mode?: string
          notes?: Json
          origin?: string
          purpose?: string
          revision?: number
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_video_uploads: {
        Row: {
          bytes: number
          caption: string
          conversation_id: string
          created_at: string
          duration_seconds: number
          id: string
          mime: string
          sent_at: string | null
          status: string
          storage_path: string
          user_id: string
        }
        Insert: {
          bytes: number
          caption: string
          conversation_id: string
          created_at?: string
          duration_seconds: number
          id: string
          mime: string
          sent_at?: string | null
          status?: string
          storage_path: string
          user_id: string
        }
        Update: {
          bytes?: number
          caption?: string
          conversation_id?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          mime?: string
          sent_at?: string | null
          status?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_video_uploads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_actions: {
        Row: {
          action: string
          created_at: string
          detail: string
          id: string
          plan_id: string | null
          result: Json
          session_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string
          id: string
          plan_id?: string | null
          result: Json
          session_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string
          id?: string
          plan_id?: string | null
          result?: Json
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_actions_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "social_plans"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "venue_actions_user_id_session_id_fkey"
            columns: ["user_id", "session_id"]
            isOneToOne: false
            referencedRelation: "venue_sessions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      venue_sessions: {
        Row: {
          arrived_at: string
          departed_at: string | null
          id: string
          place_key: string
          state: Json
          user_id: string
        }
        Insert: {
          arrived_at: string
          departed_at?: string | null
          id: string
          place_key: string
          state?: Json
          user_id: string
        }
        Update: {
          arrived_at?: string
          departed_at?: string | null
          id?: string
          place_key?: string
          state?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_sessions_user_id_place_key_fkey"
            columns: ["user_id", "place_key"]
            isOneToOne: false
            referencedRelation: "world_places"
            referencedColumns: ["user_id", "key"]
          },
        ]
      }
      visual_identity_registry: {
        Row: {
          active_message_id: string | null
          active_reason: string
          active_storage_path: string | null
          approval: string
          canonical_asset: string | null
          canonical_sha256: string | null
          entity_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_message_id?: string | null
          active_reason?: string
          active_storage_path?: string | null
          approval: string
          canonical_asset?: string | null
          canonical_sha256?: string | null
          entity_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_message_id?: string | null
          active_reason?: string
          active_storage_path?: string | null
          approval?: string
          canonical_asset?: string | null
          canonical_sha256?: string | null
          entity_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_identity_registry_active_message_id_fkey"
            columns: ["active_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_studio_auditions: {
        Row: {
          character_key: string
          close_reason: string | null
          created_at: string
          deadline_at: string
          ended_at: string | null
          id: string
          lease_until: string
          reserved_seconds: number
          session_id: string | null
          state: string
          supervised: boolean
          usage_seconds: number | null
          user_id: string
          voice_id: string
        }
        Insert: {
          character_key: string
          close_reason?: string | null
          created_at?: string
          deadline_at: string
          ended_at?: string | null
          id?: string
          lease_until: string
          reserved_seconds: number
          session_id?: string | null
          state?: string
          supervised?: boolean
          usage_seconds?: number | null
          user_id: string
          voice_id: string
        }
        Update: {
          character_key?: string
          close_reason?: string | null
          created_at?: string
          deadline_at?: string
          ended_at?: string | null
          id?: string
          lease_until?: string
          reserved_seconds?: number
          session_id?: string | null
          state?: string
          supervised?: boolean
          usage_seconds?: number | null
          user_id?: string
          voice_id?: string
        }
        Relationships: []
      }
      world_control: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
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
      world_places: {
        Row: {
          key: string
          kind: string
          label: string
          metadata: Json
          user_id: string
        }
        Insert: {
          key: string
          kind: string
          label: string
          metadata?: Json
          user_id: string
        }
        Update: {
          key?: string
          kind?: string
          label?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      world_records: {
        Row: {
          attempts: number
          character_key: string
          conversation_id: string
          created_at: string
          due_at: string | null
          expires_at: string | null
          id: string
          key: string
          kind: string
          retry_at: string | null
          source_message_id: string | null
          source_quote: string
          status: string
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          character_key: string
          conversation_id: string
          created_at?: string
          due_at?: string | null
          expires_at?: string | null
          id: string
          key: string
          kind: string
          retry_at?: string | null
          source_message_id?: string | null
          source_quote: string
          status: string
          summary: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          character_key?: string
          conversation_id?: string
          created_at?: string
          due_at?: string | null
          expires_at?: string | null
          id?: string
          key?: string
          kind?: string
          retry_at?: string | null
          source_message_id?: string | null
          source_quote?: string
          status?: string
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_records_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_records_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      api18_status: {Args:never;Returns:number}
      api18_job_reserve: {Args:{p_user:string;p_action:string;p_conversation:string;p_character:string;p_hash:string;p_cents:number;p_daily:number;p_monthly:number};Returns:Json}
      api18_job_update: {Args:{p_user:string;p_action:string;p_job:string|null;p_status:string;p_cost:number|null;p_failure:string|null};Returns:boolean}
      photo_reference_preferences: { Args: {p_user:string;p_character:string;p_enabled:boolean;p_adult:boolean;p_version:number}; Returns:boolean }
      photo_reference_status: { Args: never; Returns: number }
      photo_reference_candidate: { Args: { p_user: string; p_character: string; p_message: string | null; p_hash: string }; Returns: string }
      photo_reference_command: { Args: { p_user: string; p_id: string; p_character: string; p_action: string; p_role: string | null; p_message: string | null; p_hash: string; p_version: number; p_undo?: string | null; p_reviewed_sha?: string | null }; Returns: Json }
      calendar_advance: {
        Args: { p_blocked?: Json; p_now: string; p_user: string }
        Returns: number
      }
      calendar_apply: {
        Args: {
          p_message: string
          p_now: string
          p_payload: Json
          p_user: string
        }
        Returns: Json
      }
      calendar_apply_actions: {
        Args: {
          p_actions: Json
          p_kind: string
          p_now: string
          p_source: string
          p_user: string
        }
        Returns: Json
      }
      calendar_contract_status: { Args: never; Returns: number }
      calendar_edit_plan: {
        Args: {
          p_action: string
          p_now: string
          p_payload: Json
          p_plan: string
          p_user: string
          p_version: number
        }
        Returns: Json
      }
      calendar_edit_status: { Args: never; Returns: number }
      calendar_event_action: {
        Args: {
          p_kind: string
          p_now: string
          p_ordinal: number
          p_payload: Json
          p_source: string
          p_user: string
        }
        Returns: Json
      }
      calendar_followup_ready: {
        Args: { p_now: string; p_plan: string; p_user: string }
        Returns: boolean
      }
      calendar_manual_action: {
        Args: {
          p_conversation: string
          p_id: string
          p_now: string
          p_payload: Json
          p_plan: string
          p_user: string
          p_version: number
        }
        Returns: Json
      }
      calendar_manual_status: { Args: never; Returns: number }
      calendar_pending: {
        Args: { p_now: string; p_user: string }
        Returns: Json
      }
      calendar_travel_buffer: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: number
      }
      character_scene_apply: {
        Args: {
          p_activity: string
          p_conversation: string
          p_location: string
          p_now: string
          p_source: string
          p_user: string
        }
        Returns: undefined
      }
      deliver_photo_turn: { Args: { p_job_id: string }; Returns: Json }
      deliver_photo_turn_base: { Args: { p_job_id: string }; Returns: Json }
      deliver_photo_turn_before_calendar38: {
        Args: { p_job_id: string }
        Returns: Json
      }
      deliver_user_video: {
        Args: { p_id: string; p_user: string }
        Returns: Json
      }
      experience_candidates: {
        Args: { p_now: string; p_user: string }
        Returns: Json
      }
      experience_command: {
        Args: {
          p_command: string
          p_id: string
          p_now: string
          p_payload: Json
          p_plan: string
          p_revision: number
          p_user: string
        }
        Returns: Json
      }
      experience_command_before_calendar38: {
        Args: {
          p_command: string
          p_id: string
          p_now: string
          p_payload: Json
          p_plan: string
          p_revision: number
          p_user: string
        }
        Returns: Json
      }
      experience_scene_apply: {
        Args: {
          p_plan: string
          p_quote: string
          p_revision: number
          p_scene: Json
          p_source: string
          p_user: string
        }
        Returns: Json
      }
      experience_scene_status: { Args: never; Returns: number }
      experience_seed: {
        Args: { p_now: string; p_user: string }
        Returns: number
      }
      experience_status: { Args: never; Returns: number }
      finalize_game_match: {
        Args: { p_id: string; p_summary: string; p_user_id: string }
        Returns: undefined
      }
      housing_adult_known: {
        Args: { p_person: string; p_user: string }
        Returns: boolean
      }
      housing_can_enter: {
        Args: {
          p_at: string
          p_place: string
          p_user: string
          p_viewer: string
        }
        Returns: boolean
      }
      housing_command: {
        Args: {
          p_actor: string
          p_command: string
          p_id: string
          p_now: string
          p_payload: Json
          p_user: string
        }
        Returns: Json
      }
      housing_current_home: {
        Args: { p_now: string; p_person: string; p_user: string }
        Returns: string
      }
      housing_diagnostics: { Args: { p_user: string }; Returns: Json }
      housing_ensure_person: {
        Args: {
          p_label: string
          p_person: string
          p_source: string
          p_user: string
        }
        Returns: undefined
      }
      housing_plan_venue_allowed: {
        Args: {
          p_at: string
          p_character: string
          p_place: string
          p_user: string
        }
        Returns: boolean
      }
      housing_primary: {
        Args: { p_person: string; p_user: string }
        Returns: string
      }
      housing_process_actions: {
        Args: { p_now: string; p_user: string }
        Returns: number
      }
      housing_resident: {
        Args: {
          p_at: string
          p_person: string
          p_place: string
          p_user: string
        }
        Returns: boolean
      }
      housing_seed: { Args: { p_user: string }; Returns: undefined }
      housing_snapshot: {
        Args: { p_user: string; p_viewer?: string }
        Returns: Json
      }
      housing_status: { Args: never; Returns: number }
      housing_tick: {
        Args: { p_blocked?: Json; p_now: string; p_user: string }
        Returns: number
      }
      interactive_world_status: { Args: never; Returns: number }
      living_experience_action_v25: {
        Args: {
          p_action: string
          p_expected_revision?: number
          p_now: string
          p_outcome?: string
          p_plan: string
          p_user: string
        }
        Returns: Json
      }
      living_experience_complete_v25: {
        Args: {
          p_expected_revision: number
          p_now: string
          p_outcome: string
          p_plan: string
          p_summary: string
          p_user: string
        }
        Returns: Json
      }
      living_experience_due: {
        Args: { p_limit?: number; p_now: string }
        Returns: {
          plan_id: string
          user_id: string
        }[]
      }
      living_experience_moment: {
        Args: {
          p_body: string
          p_id: string
          p_now: string
          p_plan: string
          p_user: string
        }
        Returns: Json
      }
      media_profile_status: { Args: never; Returns: number }
      phone_command: {
        Args: {
          p_command: string
          p_id: string
          p_now: string
          p_payload: Json
          p_user: string
        }
        Returns: Json
      }
      phone_status: { Args: never; Returns: number }
      record_npc_introduction: {
        Args: { p_message: string; p_npc: string; p_user: string }
        Returns: boolean
      }
      recover_experience_operation: {
        Args: { p_operation: string; p_plan: string; p_user: string }
        Returns: Json
      }
      reserve_image_attempt: {
        Args: {
          p_action_id: string
          p_conversation_id: string
          p_daily: number
          p_monthly: number
          p_user_id: string
        }
        Returns: boolean
      }
      reserve_live_call: {
        Args: {
          p_character: string
          p_conversation: string
          p_daily_count: number
          p_lease_seconds: number
          p_limit_seconds: number
          p_monthly_seconds: number
          p_now: string
          p_user: string
          p_voice: string
        }
        Returns: Json
      }
      reserve_user_video: {
        Args: {
          p_bytes: number
          p_caption: string
          p_conversation: string
          p_duration: number
          p_id: string
          p_mime: string
          p_user: string
        }
        Returns: Json
      }
      reserve_voice_audition: {
        Args: {
          p_character: string
          p_daily_count: number
          p_lease_ms: number
          p_limit_ms: number
          p_monthly_seconds: number
          p_now: string
          p_reserved_seconds: number
          p_user: string
          p_voice: string
        }
        Returns: Json
      }
      reserve_world_ai: {
        Args: { p_limit: number; p_user_id: string }
        Returns: boolean
      }
      set_profile_media: {
        Args: {
          p_avatar: string
          p_canonical: string
          p_key: string
          p_sha: string
          p_source: string
          p_user: string
        }
        Returns: boolean
      }
      shared_plan_notice: {
        Args: {
          p_at: string
          p_character: string
          p_phase: string
          p_plan: string
          p_summary: string
          p_user: string
        }
        Returns: undefined
      }
      shared_world_command: {
        Args: {
          p_command: string
          p_expected_version: number
          p_now: string
          p_payload: Json
          p_plan_id: string
          p_user_id: string
        }
        Returns: Json
      }
      shared_world_legacy_command: {
        Args: {
          p_command: string
          p_expected_version: number
          p_now: string
          p_payload: Json
          p_plan_id: string
          p_user_id: string
        }
        Returns: Json
      }
      shared_world_status: { Args: never; Returns: Json }
      town_command: {
        Args: {
          p_command: string
          p_id: string
          p_now: string
          p_payload: Json
          p_user: string
        }
        Returns: Json
      }
      town_favorite: {
        Args: { p_enabled: boolean; p_place: string; p_user: string }
        Returns: Json
      }
      town_propose_plan: {
        Args: { p_id: string; p_now: string; p_payload: Json; p_user: string }
        Returns: Json
      }
      town_status: { Args: never; Returns: number }
      update_active_portrait: {
        Args: {
          p_key: string
          p_message: string
          p_reason: string
          p_user: string
        }
        Returns: Json
      }
      update_screened_portrait: {
        Args: {
          p_key: string
          p_message: string
          p_reason: string
          p_user: string
        }
        Returns: Json
      }
      venue_act: {
        Args: {
          p_action: string
          p_character?: string
          p_detail: string
          p_id: string
          p_now: string
          p_place: string
          p_plan?: string
          p_quantity?: number
          p_user: string
        }
        Returns: Json
      }
      venue_experience_status: { Args: never; Returns: number }
      venue_progress: {
        Args: {
          p_choice: number
          p_id: string
          p_kind: string
          p_now: string
          p_place: string
          p_plan?: string
          p_step: number
          p_user: string
        }
        Returns: Json
      }
      venue_reconcile_departures: {
        Args: { p_now: string; p_user: string }
        Returns: number
      }
      venue_session: { Args: { p_now: string; p_user: string }; Returns: Json }
      world_expansion_status: { Args: never; Returns: number }
      world_runtime_status: { Args: never; Returns: Json }
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
