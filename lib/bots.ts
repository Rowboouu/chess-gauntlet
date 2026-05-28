/**
 * The gauntlet ladder.
 *
 * Each rung is a fixed-strength Stockfish opponent. `elo` feeds the Elo math
 * (beating a stronger bot earns more). `skill` maps to Stockfish's UCI
 * "Skill Level" (0-20); `movetimeMs` caps how long the engine thinks, which
 * also throttles strength at the low end. `depth` (optional) caps search depth.
 *
 * Free-play exposes these same rungs as selectable difficulties, so there is a
 * single source of truth for opponent strength across both modes.
 */

export interface BotLevel {
  level: number;
  name: string;
  elo: number;
  /** Stockfish UCI "Skill Level", 0-20. */
  skill: number;
  /** Max think time per move, milliseconds. */
  movetimeMs: number;
  /** Optional hard cap on search depth (further weakens low rungs). */
  depth?: number;
  blurb: string;
}

export const BOT_LEVELS: BotLevel[] = [
  { level: 1, name: "Pawn", elo: 500, skill: 0, movetimeMs: 50, depth: 1, blurb: "Just learned the rules." },
  { level: 2, name: "Rookie", elo: 800, skill: 1, movetimeMs: 80, depth: 2, blurb: "Knows the pieces, not the plan." },
  { level: 3, name: "Squire", elo: 1000, skill: 3, movetimeMs: 100, depth: 3, blurb: "A fair fight for newcomers." },
  { level: 4, name: "Knight", elo: 1200, skill: 5, movetimeMs: 150, depth: 5, blurb: "Will punish loose moves." },
  { level: 5, name: "Bishop", elo: 1400, skill: 7, movetimeMs: 200, blurb: "Sees a few moves ahead." },
  { level: 6, name: "Rook", elo: 1600, skill: 10, movetimeMs: 300, blurb: "Solid and unforgiving." },
  { level: 7, name: "Castellan", elo: 1800, skill: 13, movetimeMs: 400, blurb: "Club-champion strength." },
  { level: 8, name: "Warden", elo: 2000, skill: 16, movetimeMs: 600, blurb: "Expert. Few mistakes." },
  { level: 9, name: "Champion", elo: 2200, skill: 18, movetimeMs: 800, blurb: "Master class." },
  { level: 10, name: "Grandmaster", elo: 2400, skill: 20, movetimeMs: 1000, blurb: "The peak of the gauntlet." },
];

export const MAX_LEVEL = BOT_LEVELS.length;

export function getBotLevel(level: number): BotLevel | undefined {
  return BOT_LEVELS.find((b) => b.level === level);
}

/** The next rung to face given how far the player has climbed. */
export function nextGauntletLevel(highestCleared: number): BotLevel {
  const next = Math.min(highestCleared + 1, MAX_LEVEL);
  return getBotLevel(next)!;
}
