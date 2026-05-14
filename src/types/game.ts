export type Role = "player" | "judge";
export type ModalType = "create" | "join" | "info" | null;

export interface Room {
  id: string;
  pin: string;
  status: string;
  host_id?: string;
}

export interface Player {
  id: string;
  room_id: string;
  name: string;
  score: number;
  is_judge: boolean;
  is_host: boolean;
  in_game: boolean;
  user_id: string;
  joined_at: string;
  hand?: string[] | null;
}

export interface GameState {
  id?: string;
  room_id: string;
  phase: string;
  current_judge_id: string | null;
  current_inbox_card_id: string | null;
  round_number: number;
  max_rounds: number;
  winner_name?: string | null;
  winner_score?: number | null;
}

export interface CardData {
  id: string;
  text_ge: string;
  type: string;
}

export interface Submission {
  id: string;
  player_id: string;
  card_id: string;
  round_number: number;
  cards?: CardData | null;
  is_winner?: boolean;
}
