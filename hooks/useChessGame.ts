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

export interface PreMove {
  from: string;
  to: string;
  promotion?: string;
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

  // Pre-move: a player move queued while the bot is thinking. Stored in both
  // state (for rendering) and a ref (so maybeEngineMove can read the latest
  // value without re-creating its useCallback closure each pre-move change).
  const [preMove, setPreMoveState] = useState<PreMove | null>(null);
  const preMoveRef = useRef<PreMove | null>(null);
  const commitPreMove = useCallback((pm: PreMove | null) => {
    preMoveRef.current = pm;
    setPreMoveState(pm);
  }, []);

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

  // Forward-declared ref so the engine cycle can re-trigger itself after a
  // pre-move executes without forming a useCallback dependency loop.
  const maybeEngineMoveRef = useRef<() => Promise<void>>(null as unknown as () => Promise<void>);

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

      // Apply a queued pre-move if one is waiting and still legal. Illegal
      // pre-moves (the bot's move changed the position) are silently discarded.
      const pm = preMoveRef.current;
      if (pm && !game.isGameOver() && game.turn() === playerColor) {
        commitPreMove(null);
        try {
          const pmResult = game.move({
            from: pm.from as Square,
            to: pm.to as Square,
            promotion: pm.promotion ?? "q",
          });
          if (pmResult) {
            playSound(soundForMove(pmResult, game));
            sync(false);
            if (!game.isGameOver()) {
              queueMicrotask(() => void maybeEngineMoveRef.current?.());
            }
          }
        } catch {
          // Pre-move illegal in the new position — drop it.
        }
      }
    } catch {
      // Engine failed — leave it as the player's read of the board.
      setState((s) => ({ ...s, isThinking: false }));
    }
  }, [bot, playerColor, sync, commitPreMove]);

  maybeEngineMoveRef.current = maybeEngineMove;

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
      // A direct move supersedes any queued pre-move.
      commitPreMove(null);
      const next = sync(false);
      if (!next.isGameOver) {
        void maybeEngineMove();
      }
      return true;
    },
    [playerColor, sync, maybeEngineMove, commitPreMove],
  );

  /**
   * Queue a move to play automatically the moment it's the player's turn.
   * Validates that the source actually holds a friendly piece — illegal
   * pre-moves still get caught at execution time, but this rejects obvious
   * mistakes upfront so the UI doesn't show a confusing highlight.
   */
  const queuePreMove = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const game = gameRef.current;
      if (game.isGameOver()) return false;
      if (game.turn() === playerColor) return false; // it's our turn — just play it
      const piece = game.get(from as Square);
      if (!piece || piece.color !== playerColor) return false;
      commitPreMove({ from, to, promotion });
      return true;
    },
    [playerColor, commitPreMove],
  );

  const clearPreMove = useCallback(() => commitPreMove(null), [commitPreMove]);

  /** Legal destination squares for a given origin (for move hints). */
  const legalMovesFrom = useCallback((square: string): string[] => {
    const game = gameRef.current;
    return game
      .moves({ square: square as Square, verbose: true })
      .map((m) => m.to);
  }, []);

  return { state, move, legalMovesFrom, preMove, queuePreMove, clearPreMove };
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
