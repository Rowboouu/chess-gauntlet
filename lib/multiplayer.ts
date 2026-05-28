import { Chess } from "chess.js";
import type { MultiplayerGame, MultiplayerResult, PieceColor } from "./types";

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Returns 'w' / 'b' if the user is a participant, null otherwise. */
export function colorOf(game: MultiplayerGame, userId: string): PieceColor | null {
  if (game.white_user_id === userId) return "w";
  if (game.black_user_id === userId) return "b";
  return null;
}

/** Opposite color. */
export function other(c: PieceColor): PieceColor {
  return c === "w" ? "b" : "w";
}

/**
 * Derive game-over from a chess.js position into the schema's result type.
 * Returns null if the position isn't terminal.
 */
export function terminalState(
  chess: Chess,
): { result: MultiplayerResult; endReason: string } | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) {
    // Side to move is checkmated → they lost.
    return {
      result: chess.turn() === "w" ? "black_win" : "white_win",
      endReason: "checkmate",
    };
  }
  if (chess.isStalemate()) return { result: "draw", endReason: "stalemate" };
  if (chess.isInsufficientMaterial())
    return { result: "draw", endReason: "insufficient_material" };
  if (chess.isThreefoldRepetition())
    return { result: "draw", endReason: "threefold" };
  return { result: "draw", endReason: "50_move_rule" };
}

/**
 * Compute the remaining ms on each side, *as of `now`*, by replaying the
 * elapsed time since `clock_running_since` against the side currently to move.
 * Untimed games (time_initial_ms = 0) always return the stored values.
 */
export function clocksAsOf(
  game: MultiplayerGame,
  nowMs: number,
): { white: number; black: number; sideToMove: PieceColor } {
  const sideToMove = (game.fen.split(" ")[1] ?? "w") as PieceColor;
  if (game.time_initial_ms === 0 || !game.clock_running_since) {
    return { white: game.white_time_ms, black: game.black_time_ms, sideToMove };
  }
  const elapsed = Math.max(
    0,
    nowMs - new Date(game.clock_running_since).getTime(),
  );
  if (sideToMove === "w") {
    return {
      white: Math.max(0, game.white_time_ms - elapsed),
      black: game.black_time_ms,
      sideToMove,
    };
  }
  return {
    white: game.white_time_ms,
    black: Math.max(0, game.black_time_ms - elapsed),
    sideToMove,
  };
}
