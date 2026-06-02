"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { BotLevel } from "@/lib/bots";
import type { GameResult } from "@/lib/elo";
import type { PieceColor } from "@/lib/types";
import type { ChessGameState } from "@/hooks/useChessGame";

interface GameStatusProps {
  bot: BotLevel;
  playerColor: PieceColor;
  state: ChessGameState;
  finishState: "idle" | "saving" | "done" | "error";
  eloDelta: number | null;
  newElo: number | null;
  /** In-game quit controls, shown only while the game is in progress. */
  quitControls?: ReactNode;
}

const RESULT_COPY: Record<GameResult, { title: string; tone: string }> = {
  win: { title: "Victory", tone: "text-emerald-400" },
  loss: { title: "Defeat", tone: "text-red-400" },
  draw: { title: "Draw", tone: "text-amber-300" },
};

export function GameStatus({
  bot,
  playerColor,
  state,
  finishState,
  eloDelta,
  newElo,
  quitControls,
}: GameStatusProps) {
  const yourTurn = state.turn === playerColor && !state.isGameOver;

  // Pair SAN history into numbered move rows.
  const rows: { n: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < state.history.length; i += 2) {
    rows.push({
      n: i / 2 + 1,
      white: state.history[i],
      black: state.history[i + 1],
    });
  }

  return (
    <div className="flex w-full flex-col gap-3 sm:gap-4 lg:w-72">
      {/* Opponent card */}
      <div className="rounded-xl border border-panel-border bg-panel p-4">
        <p className="text-xs uppercase tracking-wider text-muted">
          Opponent · Level {bot.level}
        </p>
        <p className="font-display text-xl font-bold">
          {bot.name} <span className="text-accent">{bot.elo}</span>
        </p>
        <p className="mt-2 text-sm">
          {state.isGameOver ? (
            <span className="text-muted">Game over</span>
          ) : state.isThinking ? (
            <span className="animate-pulse text-accent">Thinking…</span>
          ) : yourTurn ? (
            <span className="text-emerald-400">Your move</span>
          ) : (
            <span className="text-muted">Waiting…</span>
          )}
          {state.inCheck && !state.isGameOver && (
            <span className="ml-2 font-semibold text-red-400">Check!</span>
          )}
        </p>
      </div>

      {/* Move list */}
      <div className="flex-1 overflow-hidden rounded-xl border border-panel-border bg-panel">
        <div className="border-b border-panel-border px-4 py-2 text-xs uppercase tracking-wider text-muted">
          Moves
        </div>
        <ol className="max-h-40 overflow-y-auto px-2 py-1 font-mono text-sm sm:max-h-48 lg:max-h-88">
          {rows.length === 0 && (
            <li className="px-2 py-2 text-muted">No moves yet.</li>
          )}
          {rows.map((r) => (
            <li key={r.n} className="flex gap-2 px-2 py-0.5">
              <span className="w-6 text-muted">{r.n}.</span>
              <span className="w-16">{r.white}</span>
              <span className="w-16">{r.black ?? ""}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Result banner */}
      {state.isGameOver && state.result && (
        <div className="rounded-xl border border-panel-border bg-panel p-4 text-center">
          <p
            className={`font-display text-2xl font-black ${RESULT_COPY[state.result].tone}`}
          >
            {RESULT_COPY[state.result].title}
          </p>
          <p className="mt-1 text-sm text-muted">{state.endReason}</p>

          <div className="mt-3 min-h-6 text-sm">
            {finishState === "saving" && (
              <span className="text-muted">Updating Elo…</span>
            )}
            {finishState === "done" && newElo !== null && (
              <span>
                New Elo:{" "}
                <span className="font-mono text-accent-strong">{newElo}</span>{" "}
                {eloDelta !== null && (
                  <span
                    className={eloDelta >= 0 ? "text-emerald-400" : "text-red-400"}
                  >
                    ({eloDelta >= 0 ? "+" : ""}
                    {eloDelta})
                  </span>
                )}
              </span>
            )}
            {finishState === "error" && (
              <span className="text-red-400">
                Couldn&rsquo;t save the result.
              </span>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <Link
              href="/new"
              className="flex-1 rounded-lg border border-accent/50 bg-accent/15 py-2 text-sm font-semibold text-accent-strong hover:bg-accent/25"
            >
              New Game
            </Link>
            <Link
              href="/leaderboard"
              className="flex-1 rounded-lg border border-panel-border py-2 text-sm hover:border-accent/50"
            >
              Leaderboard
            </Link>
          </div>
        </div>
      )}

      {quitControls}
    </div>
  );
}
