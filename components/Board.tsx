"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";

interface BoardProps {
  fen: string;
  orientation: "white" | "black";
  /** Apply a player move. Returns true if it was legal/accepted. */
  onMove: (from: string, to: string, promotion?: string) => boolean;
  interactive: boolean;
}

const RED_MARK = { backgroundColor: "rgba(214, 59, 59, 0.55)" } as const;

/**
 * Thin wrapper over react-chessboard v5 (single `options` prop).
 *
 * Right-click toggles a red marker on a square (chess.com-style); markers clear
 * when a move is made (fen changes) or on any left-click. Pawn promotions
 * auto-queen — the move action defaults promotion to "q".
 */
export function Board({ fen, orientation, onMove, interactive }: BoardProps) {
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
    for (const sq of Object.keys(marked)) styles[sq] = RED_MARK;
    return styles;
  }, [marked]);

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
          allowDragging: interactive,
          showNotation: true,
          animationDurationInMs: 200,
          darkSquareStyle: { backgroundColor: "#5b4a36" },
          lightSquareStyle: { backgroundColor: "#cdbb94" },
          boardStyle: { width: "100%" },
          squareStyles,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            return onMove(sourceSquare, targetSquare);
          },
          onSquareClick: () => {
            setMarked((m) => (Object.keys(m).length ? {} : m));
          },
          onSquareRightClick: ({ square }) => {
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
