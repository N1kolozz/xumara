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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cards: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_blank: boolean
          text_ge: string
          type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_blank?: boolean
          text_ge: string
          type: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_blank?: boolean
          text_ge?: string
          type?: string
        }
        Relationships: []
      }
      game_state: {
        Row: {
          current_inbox_card_id: string | null
          current_judge_id: string | null
          max_rounds: number
          pack: string | null
          phase: string
          phase_deadline: string | null
          room_id: string
          round_number: number
          updated_at: string
          winner_name: string | null
          winner_score: number | null
        }
        Insert: {
          current_inbox_card_id?: string | null
          current_judge_id?: string | null
          max_rounds?: number
          pack?: string | null
          phase?: string
          phase_deadline?: string | null
          room_id: string
          round_number?: number
          updated_at?: string
          winner_name?: string | null
          winner_score?: number | null
        }
        Update: {
          current_inbox_card_id?: string | null
          current_judge_id?: string | null
          max_rounds?: number
          pack?: string | null
          phase?: string
          phase_deadline?: string | null
          room_id?: string
          round_number?: number
          updated_at?: string
          winner_name?: string | null
          winner_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_state_current_inbox_card_id_fkey"
            columns: ["current_inbox_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_state_current_judge_id_fkey"
            columns: ["current_judge_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_state_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      player_hands: {
        Row: {
          card_id: string
          id: string
          player_id: string
          room_id: string
        }
        Insert: {
          card_id: string
          id?: string
          player_id: string
          room_id: string
        }
        Update: {
          card_id?: string
          id?: string
          player_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_hands_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_hands_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_hands_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          hand: string[] | null
          id: string
          in_game: boolean
          is_host: boolean
          is_judge: boolean
          joined_at: string
          name: string
          room_id: string
          score: number
          user_id: string | null
        }
        Insert: {
          hand?: string[] | null
          id?: string
          in_game?: boolean
          is_host?: boolean
          is_judge?: boolean
          joined_at?: string
          name: string
          room_id: string
          score?: number
          user_id?: string | null
        }
        Update: {
          hand?: string[] | null
          id?: string
          in_game?: boolean
          is_host?: boolean
          is_judge?: boolean
          joined_at?: string
          name?: string
          room_id?: string
          score?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          host_id: string | null
          id: string
          pin: string
          status: string
        }
        Insert: {
          created_at?: string
          host_id?: string | null
          id?: string
          pin: string
          status?: string
        }
        Update: {
          created_at?: string
          host_id?: string | null
          id?: string
          pin?: string
          status?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          card_id: string
          custom_text: string | null
          id: string
          is_winner: boolean
          player_id: string
          room_id: string
          round_number: number
          submitted_at: string
        }
        Insert: {
          card_id: string
          custom_text?: string | null
          id?: string
          is_winner?: boolean
          player_id: string
          room_id: string
          round_number: number
          submitted_at?: string
        }
        Update: {
          card_id?: string
          custom_text?: string | null
          id?: string
          is_winner?: boolean
          player_id?: string
          room_id?: string
          round_number?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      deal_initial_cards: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      deal_one_card: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      remove_card_from_hand: {
        Args: { p_player_id: string; p_card_id: string }
        Returns: undefined
      }
      clear_room_hands: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      increment_player_score: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      resolve_round: {
        Args: { p_room_id: string; p_submission_id?: string }
        Returns: undefined
      }
      resolve_room_phase: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      submit_card: {
        Args: {
          p_room_id: string
          p_player_id: string
          p_card_id: string
          p_round_number: number
          p_custom_text?: string | null
        }
        Returns: Json
      }
      start_game_state: {
        Args: { p_room_id: string; p_max_rounds: number; p_pack?: string | null }
        Returns: Database["public"]["Tables"]["game_state"]["Row"]
      }
      rematch_game: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      reset_room_to_lobby: {
        Args: { p_room_id: string; p_reset_scores?: boolean }
        Returns: undefined
      }
      leave_game_round: {
        Args: { p_room_id: string; p_player_id: string }
        Returns: undefined
      }
      create_room: {
        Args: { p_player_name: string; p_is_judge: boolean }
        Returns: Json
      }
      join_room: {
        Args: { p_pin: string; p_player_name: string; p_is_judge: boolean }
        Returns: Json
      }
      leave_room: {
        Args: { p_room_id: string; p_player_id: string }
        Returns: Json
      }
      prune_absent_player: {
        Args: { p_room_id: string; p_player_id: string }
        Returns: Json
      }
      heartbeat: {
        Args: { p_player_id: string }
        Returns: undefined
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
