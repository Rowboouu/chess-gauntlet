"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BOT_LEVELS,
  MAX_LEVEL,
  nextGauntletLevel,
  type BotLevel,
} from "@/lib/bots";
import type { GameMode, PieceColor } from "@/lib/types";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type ColorChoice = PieceColor | "random";

export function NewGameForm({
  highestCleared,
  playerElo,
}: {
  highestCleared: number;
  playerElo: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<GameMode>("gauntlet");
  const [color, setColor] = useState<ColorChoice>("w");
  const [freeLevel, setFreeLevel] = useState<number>(
    Math.min(highestCleared + 1, MAX_LEVEL),
  );
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const gauntletDone = highestCleared >= MAX_LEVEL;
  const nextBot = nextGauntletLevel(highestCleared);
  const bot: BotLevel =
    mode === "gauntlet" ? nextBot : BOT_LEVELS[freeLevel - 1];

  async function start() {
    setStarting(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      setStarting(false);
      return;
    }

    const playerColor: PieceColor =
      color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color;

    const { data, error } = await supabase
      .from("games")
      .insert({
        user_id: user.id,
        mode,
        bot_level: bot.level,
        bot_elo: bot.elo,
        player_color: playerColor,
        fen: START_FEN,
        pgn: "",
        status: "in_progress",
        elo_before: playerElo,
      })
      .select("id")
      .single();

    if (error || !data) {
      setError(error?.message ?? "Could not start game");
      setStarting(false);
      return;
    }
    router.push(`/game/${data.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Mode tabs */}
      <div className="flex rounded-xl border border-panel-border p-1">
        {(["gauntlet", "free"] as GameMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-4 py-2.5 font-display font-semibold tracking-wide transition-colors ${
              mode === m
                ? "bg-accent/20 text-accent-strong"
                : "text-muted hover:text-foreground"
            }`}
          >
            {m === "gauntlet" ? "Gauntlet" : "Free Play"}
          </button>
        ))}
      </div>

      {/* Opponent panel */}
      <div className="rounded-xl border border-panel-border bg-panel p-5">
        {mode === "gauntlet" ? (
          gauntletDone ? (
            <p className="text-accent-strong">
              🏆 You&rsquo;ve cleared the entire gauntlet! Replay the
              Grandmaster below or switch to Free Play.
            </p>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider text-muted">
                Next rung — Level {nextBot.level} of {MAX_LEVEL}
              </p>
              <p className="mt-1 font-display text-2xl font-bold">
                {nextBot.name}{" "}
                <span className="text-accent">{nextBot.elo}</span>
              </p>
              <p className="mt-1 text-sm text-muted">{nextBot.blurb}</p>
            </>
          )
        ) : (
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-wider text-muted">
              Choose your opponent
            </span>
            <select
              value={freeLevel}
              onChange={(e) => setFreeLevel(Number(e.target.value))}
              className="w-full rounded-lg border border-panel-border bg-background px-3 py-2.5 outline-none focus:border-accent"
            >
              {BOT_LEVELS.map((b) => (
                <option key={b.level} value={b.level}>
                  Lv {b.level} · {b.name} · {b.elo} Elo
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-muted">{bot.blurb}</p>
          </label>
        )}
      </div>

      {/* Color choice */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">
          Play as
        </p>
        <div className="flex gap-2">
          {(
            [
              ["w", "White"],
              ["b", "Black"],
              ["random", "Random"],
            ] as [ColorChoice, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setColor(value)}
              className={`flex-1 rounded-lg border px-4 py-2.5 transition-colors ${
                color === value
                  ? "border-accent bg-accent/15 text-accent-strong"
                  : "border-panel-border hover:border-accent/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        onClick={start}
        disabled={starting}
        className="rounded-xl border border-accent/50 bg-accent/15 py-3.5 font-display text-lg font-semibold tracking-wide text-accent-strong transition-colors hover:bg-accent/25 disabled:opacity-50"
      >
        {starting ? "Setting the board…" : `Play ${bot.name}`}
      </button>
    </div>
  );
}
