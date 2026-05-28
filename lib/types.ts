import type { GameResult } from "./elo";

export type GameMode = "gauntlet" | "free";
export type GameStatus = "in_progress" | "completed";
export type PieceColor = "w" | "b";

export interface Profile {
  id: string;
  username: string;
  elo: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  highest_level_cleared: number;
  created_at: string;
}

export type MultiplayerStatus = "waiting" | "in_progress" | "completed" | "aborted";
export type MultiplayerResult = "white_win" | "black_win" | "draw";

export interface MultiplayerGame {
  id: string;
  white_user_id: string;
  black_user_id: string | null;
  creator_color: PieceColor;
  fen: string;
  pgn: string;
  status: MultiplayerStatus;
  result: MultiplayerResult | null;
  end_reason: string | null;
  draw_offer_by: PieceColor | null;
  time_initial_ms: number;
  increment_ms: number;
  white_time_ms: number;
  black_time_ms: number;
  /** ISO timestamp when the side-to-move's clock started ticking, or null. */
  clock_running_since: string | null;
  white_elo_before: number;
  black_elo_before: number | null;
  white_elo_after: number | null;
  black_elo_after: number | null;
  created_at: string;
  updated_at: string;
}

export interface Game {
  id: string;
  user_id: string;
  mode: GameMode;
  bot_level: number;
  bot_elo: number;
  player_color: PieceColor;
  fen: string;
  pgn: string;
  status: GameStatus;
  result: GameResult | null;
  elo_before: number;
  elo_after: number | null;
  created_at: string;
  updated_at: string;
}
