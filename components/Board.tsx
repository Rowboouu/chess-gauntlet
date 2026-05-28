"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { PreMove } from "@/hooks/useChessGame";

interface BoardProps {
  fen: string;
  orientation: "white" | "black";
  /** Apply a player move now. Returns true if it was legal/accepted. */
  onMove: (from: string, to: string, promotion?: string) => boolean;
  /** It's the player's turn — drags execute moves. */
  interactive: boolean;
  /** It's the bot's turn but a pre-move can be queued. */
  acceptPreMoves: boolean;
  /** Queue a pre-move (to fire when it becomes the player's turn). */
  onPreMove: (from: string, to: string, promotion?: string) => boolean;
  /** Currently queued pre-move, if any (highlighted on the board). */
  preMove: PreMove | null;
  /** Cancel the queued pre-move. */
  onClearPreMove: () => void;
}

const RED_MARK = { backgroundColor: "rgba(214, 59, 59, 0.55)" } as const;
const PREMOVE_MARK = { backgroundColor: "rgba(255, 159, 64, 0.55)" } as const;

/**
 * Thin wrapper over react-chessboard v5 (single `options` prop).
 *
 * - Drag during your turn → executes the move.
 * - Drag during the bot's turn → queues a pre-move (orange highlight); the
 *   hook auto-plays it when it becomes your turn (or discards it if the bot's
 *   reply made it illegal).
 * - Right-click → cancels the pre-move if one is queued; otherwise toggles a
 *   chess.com-style red marker on that square.
 * - Markers clear on any left-click and on every move.
 * - Pawn promotions auto-queen (default in onMove).
 */
export function Board({
  fen,
  orientation,
  onMove,
  interactive,
  acceptPreMoves,
  onPreMove,
  preMove,
  onClearPreMove,
}: BoardProps) {
  const [marked, setMarked] = useState<Record<string, true>>({});
  const prevFen = useRef(fen);

  // Clear right-click markers whenever the position changes (a move happened).
  useEffect(() => {
    if (prevFen.current !== fen) {
      prevFen.current = fen;
      setMarked((m) => (Object.keys(m).length ? {} : m));
    }
  }, [fen]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (preMove) {
      styles[preMove.from] = PREMOVE_MARK;
      styles[preMove.to] = PREMOVE_MARK;
    }
    // Red marks layer on top, so right-click can mark a pre-move square too.
    for (const sq of Object.keys(marked)) styles[sq] = RED_MARK;
    return styles;
  }, [marked, preMove]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-panel-border shadow-2xl"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Chessboard
        options={{
          id: "gauntlet-board",
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive || acceptPreMoves,
          showNotation: true,
          animationDurationInMs: 200,
          darkSquareStyle: { backgroundColor: "#5b4a36" },
          lightSquareStyle: { backgroundColor: "#cdbb94" },
          boardStyle: { width: "100%" },
          squareStyles,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            if (interactive) return onMove(sourceSquare, targetSquare);
            if (acceptPreMoves) {
              onPreMove(sourceSquare, targetSquare);
              // Always snap the piece back — the actual move only happens
              // when it becomes the player's turn. The orange highlight
              // shows the queued intent.
              return false;
            }
            return false;
          },
          onSquareClick: () => {
            setMarked((m) => (Object.keys(m).length ? {} : m));
          },
          onSquareRightClick: ({ square }) => {
            if (preMove) {
              onClearPreMove();
              return;
            }
            setMarked((m) => {
              const next = { ...m };
              if (next[square]) delete next[square];
              else next[square] = true;
              return next;
            });
          },
        }}
      />
    </div>
  );
}
