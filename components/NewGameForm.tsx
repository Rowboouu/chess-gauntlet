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
import {
  DEFAULT_TIME_CONTROL_ID,
  TIME_CONTROLS,
  getTimeControl,
} from "@/lib/timeControls";
import type { GameMode, PieceColor } from "@/lib/types";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type ColorChoice = PieceColor | "random";
type Tab = GameMode | "multiplayer";

export function NewGameForm({
  highestCleared,
  playerElo,
}: {
  highestCleared: number;
  playerElo: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("gauntlet");
  const [color, setColor] = useState<ColorChoice>("w");
  const [freeLevel, setFreeLevel] = useState<number>(
    Math.min(highestCleared + 1, MAX_LEVEL),
  );
  const [timeControlId, setTimeControlId] = useState(DEFAULT_TIME_CONTROL_ID);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const gauntletDone = highestCleared >= MAX_LEVEL;
  const nextBot = nextGauntletLevel(highestCleared);
  const bot: BotLevel | null =
    tab === "gauntlet"
      ? nextBot
      : tab === "free"
        ? BOT_LEVELS[freeLevel - 1]
        : null;
  const tc = getTimeControl(timeControlId);

  async function startBotGame(mode: GameMode, b: BotLevel) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      return;
    }
    const playerColor: PieceColor =
      color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color;
    const { data, error } = await supabase
      .from("games")
      .insert({
        user_id: user.id,
        mode,
        bot_level: b.level,
        bot_elo: b.elo,
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
      return;
    }
    router.push(`/game/${data.id}`);
  }

  async function startMultiplayer() {
    const res = await fetch("/api/mp-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time_control_id: timeControlId, color }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not create game");
      return;
    }
    const { id } = await res.json();
    router.push(`/mp/${id}`);
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      if (tab === "gauntlet" || tab === "free") {
        if (!bot) throw new Error("No bot");
        await startBotGame(tab, bot);
      } else {
        await startMultiplayer();
      }
    } finally {
      setStarting(false);
    }
  }

  const ctaLabel = starting
    ? "Setting the board…"
    : tab === "multiplayer"
      ? "Create Game"
      : bot
        ? `Play ${bot.name}`
        : "Start";

  return (
    <div className="flex flex-col gap-6">
      {/* Mode tabs */}
      <div className="flex rounded-xl border border-panel-border p-1">
        {(["gauntlet", "free", "multiplayer"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={`flex-1 rounded-lg px-4 py-2.5 font-display font-semibold tracking-wide transition-colors ${
              tab === t
                ? "bg-accent/20 text-accent-strong"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t === "gauntlet" ? "Gauntlet" : t === "free" ? "Free Play" : "Multiplayer"}
          </button>
        ))}
      </div>

      {/* Mode-specific panel */}
      <div className="rounded-xl border border-panel-border bg-panel p-5">
        {tab === "gauntlet" &&
          (gauntletDone ? (
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
          ))}

        {tab === "free" && (
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
            <p className="mt-2 text-sm text-muted">{bot?.blurb}</p>
          </label>
        )}

        {tab === "multiplayer" && (
          <div>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-wider text-muted">
                Time control
              </span>
              <select
                value={timeControlId}
                onChange={(e) => setTimeControlId(e.target.value)}
                className="w-full rounded-lg border border-panel-border bg-background px-3 py-2.5 outline-none focus:border-accent"
              >
                {TIME_CONTROLS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} · {t.category}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-sm text-muted">
              You&rsquo;ll get a shareable link — send it to your opponent. The
              game starts when they join.
              {tc && tc.initialMs === 0 && " No clock; play at your own pace."}
            </p>
          </div>
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
        {ctaLabel}
      </button>
    </div>
  );
}
