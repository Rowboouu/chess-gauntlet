"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { StockfishEngine } from "@/lib/engine/stockfish";
import { playSound, type SoundType } from "@/lib/sounds";
import type { BotLevel } from "@/lib/bots";
import type { GameResult } from "@/lib/elo";
import type { PieceColor } from "@/lib/types";

/** Pick the sound for a just-applied move, given the resulting position. */
function soundForMove(move: Move, game: Chess): SoundType {
  if (game.isGameOver()) return "end";
  if (game.inCheck()) return "check";
  if (move.flags.includes("p")) return "promote";
  if (move.flags.includes("k") || move.flags.includes("q")) return "castle";
  if (move.flags.includes("c") || move.flags.includes("e")) return "capture";
  return "move";
}

export interface ChessGameState {
  fen: string;
  pgn: string;
  turn: PieceColor;
  isThinking: boolean;
  isGameOver: boolean;
  result: GameResult | null;
  /** Human-readable end reason, e.g. "Checkmate", "Stalemate". */
  endReason: string | null;
  history: string[]; // SAN moves
  inCheck: boolean;
}

interface UseChessGameArgs {
  initialFen?: string;
  initialPgn?: string;
  playerColor: PieceColor;
  bot: BotLevel;
  /** Called after every move with the new fen/pgn for autosave. */
  onPersist?: (fen: string, pgn: string) => void;
  /** Called once when the game ends, with the player-perspective result. */
  onGameEnd?: (result: GameResult, fen: string, pgn: string) => void;
}

/**
 * Owns the chess.js game and a Stockfish opponent. Exposes board state and a
 * `move` action; after a legal player move it asks the engine to reply.
 *
 * The opponent is abstracted to `bot` here — when multiplayer lands, a second
 * branch in `maybeEngineMove` (driven by a Realtime channel) replaces the
 * engine call without touching the rest of the component tree.
 */
export function useChessGame({
  initialFen,
  initialPgn,
  playerColor,
  bot,
  onPersist,
  onGameEnd,
}: UseChessGameArgs) {
  const gameRef = useRef<Chess>(null as unknown as Chess);
  if (gameRef.current === null) {
    const g = new Chess();
    if (initialPgn) {
      try {
        g.loadPgn(initialPgn);
      } catch {
        if (initialFen) g.load(initialFen);
      }
    } else if (initialFen) {
      g.load(initialFen);
    }
    gameRef.current = g;
  }

  const engineRef = useRef<StockfishEngine | null>(null);
  const endedRef = useRef(false);

  const [state, setState] = useState<ChessGameState>(() =>
    deriveState(gameRef.current, false, playerColor),
  );

  // Keep latest callbacks without re-subscribing effects.
  const persistRef = useRef(onPersist);
  const endRef = useRef(onGameEnd);
  persistRef.current = onPersist;
  endRef.current = onGameEnd;

  const sync = useCallback(
    (thinking: boolean) => {
      const game = gameRef.current;
      const next = deriveState(game, thinking, playerColor);
      setState(next);
      persistRef.current?.(game.fen(), game.pgn());
      if (next.isGameOver && next.result && !endedRef.current) {
        endedRef.current = true;
        endRef.current?.(next.result, game.fen(), game.pgn());
      }
      return next;
    },
    [playerColor],
  );

  // Spin up the engine on mount.
  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    return () => engine.terminate();
  }, []);

  const maybeEngineMove = useCallback(async () => {
    const game = gameRef.current;
    if (game.isGameOver()) return;
    if (game.turn() === playerColor) return; // not the bot's turn

    const engine = engineRef.current;
    if (!engine) return;

    setState((s) => ({ ...s, isThinking: true }));
    try {
      const uci = await engine.bestMove(game.fen(), {
        skill: bot.skill,
        movetimeMs: bot.movetimeMs,
        depth: bot.depth,
      });
      const mv = game.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      playSound(soundForMove(mv, game));
      sync(false);
    } catch {
      // Engine failed — leave it as the player's read of the board.
      setState((s) => ({ ...s, isThinking: false }));
    }
  }, [bot, playerColor, sync]);

  // If it's the bot's move on load (e.g. player is black), let it move.
  useEffect(() => {
    if (state.turn !== playerColor && !state.isGameOver) {
      maybeEngineMove();
    }
    // run once after engine mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Attempt a player move. Returns true if legal and applied. */
  const move = useCallback(
    (from: string, to: string, promotion = "q"): boolean => {
      const game = gameRef.current;
      if (game.isGameOver()) return false;
      if (game.turn() !== playerColor) return false;
      try {
        const result = game.move({
          from: from as Square,
          to: to as Square,
          promotion,
        });
        if (!result) return false;
        playSound(soundForMove(result, game));
      } catch {
        return false;
      }
      const next = sync(false);
      if (!next.isGameOver) {
        void maybeEngineMove();
      }
      return true;
    },
    [playerColor, sync, maybeEngineMove],
  );

  /** Legal destination squares for a given origin (for move hints). */
  const legalMovesFrom = useCallback((square: string): string[] => {
    const game = gameRef.current;
    return game
      .moves({ square: square as Square, verbose: true })
      .map((m) => m.to);
  }, []);

  return { state, move, legalMovesFrom };
}

function deriveState(
  game: Chess,
  thinking: boolean,
  playerColor: PieceColor,
): ChessGameState {
  const over = game.isGameOver();
  let result: GameResult | null = null;
  let endReason: string | null = null;

  if (over) {
    if (game.isCheckmate()) {
      endReason = "Checkmate";
      // Side to move is checkmated → they lost.
      result = game.turn() === playerColor ? "loss" : "win";
    } else if (game.isStalemate()) {
      endReason = "Stalemate";
      result = "draw";
    } else if (game.isInsufficientMaterial()) {
      endReason = "Insufficient material";
      result = "draw";
    } else if (game.isThreefoldRepetition()) {
      endReason = "Threefold repetition";
      result = "draw";
    } else if (game.isDraw()) {
      endReason = "Draw (50-move rule)";
      result = "draw";
    } else {
      endReason = "Game over";
      result = "draw";
    }
  }

  return {
    fen: game.fen(),
    pgn: game.pgn(),
    turn: game.turn() as PieceColor,
    isThinking: thinking,
    isGameOver: over,
    result,
    endReason,
    history: game.history(),
    inCheck: game.inCheck(),
  };
}
