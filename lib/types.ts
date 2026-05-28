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
