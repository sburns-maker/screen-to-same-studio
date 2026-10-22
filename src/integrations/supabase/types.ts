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
          created_at: string
          ends_at: string
          id: string
          organizer: string
          place_key: string
          starts_at: string
          status: string
          title: string
          user_attendance: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          ends_at: string
          id: string
          organizer: string
          place_key: string
          starts_at: string
          status?: string
          title: string
          user_attendance?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          organizer?: string
          place_key?: string
          starts_at?: string
          status?: string
          title?: string
          user_attendance?: string
          user_id?: string
          version?: number
        }
        Relationships: [
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
          npc_key: string
          read_at: string
          user_id: string
        }
        Insert: {
          contact?: boolean
          contact_offered?: boolean
          encountered_at?: string
          npc_key: string
          read_at?: string
          user_id: string
        }
        Update: {
          contact?: boolean
          contact_offered?: boolean
          encountered_at?: string
          npc_key?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
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
      deliver_photo_turn: { Args: { p_job_id: string }; Returns: Json }
      deliver_photo_turn_base: { Args: { p_job_id: string }; Returns: Json }
      deliver_user_video: {
        Args: { p_id: string; p_user: string }
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
      reserve_world_ai: {
        Args: { p_limit: number; p_user_id: string }
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
      town_propose_plan: {
        Args: { p_id: string; p_now: string; p_payload: Json; p_user: string }
        Returns: Json
      }
      town_status: { Args: never; Returns: number }
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
