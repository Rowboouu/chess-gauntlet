/**
 * Standard Elo rating math.
 *
 * Shared between the client (for optimistic display) and the server-side
 * `finish_game` flow (authoritative). Keep this pure and dependency-free so it
 * can run in a Postgres-adjacent edge runtime or a plain Node route handler.
 */

export const DEFAULT_ELO = 1000;

/** Game result from the player's perspective. */
export type GameResult = "win" | "loss" | "draw";

/** Actual score S for the Elo formula: 1 win / 0.5 draw / 0 loss. */
export function scoreFor(result: GameResult): number {
  switch (result) {
    case "win":
      return 1;
    case "draw":
      return 0.5;
    case "loss":
      return 0;
  }
}

/**
 * Expected score for the player against an opponent:
 *   E = 1 / (1 + 10^((R_opp - R_player) / 400))
 */
export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/**
 * K-factor: more volatile while provisional, then stable.
 * 40 for the first 30 rated games, 20 thereafter.
 */
export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < 30 ? 40 : 20;
}

/**
 * New rating after a game:
 *   R' = R + K * (S - E), rounded to the nearest integer.
 */
export function newRating(
  playerElo: number,
  opponentElo: number,
  result: GameResult,
  gamesPlayed: number,
): number {
  const expected = expectedScore(playerElo, opponentElo);
  const score = scoreFor(result);
  const k = kFactor(gamesPlayed);
  return Math.round(playerElo + k * (score - expected));
}
