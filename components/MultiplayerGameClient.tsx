"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Chess, type Move, type Square } from "chess.js";
import { createClient } from "@/lib/supabase/client";
import { clocksAsOf, colorOf } from "@/lib/multiplayer";
import { playSound, type SoundType } from "@/lib/sounds";
import { formatClock } from "@/lib/timeControls";
import { AppHeader } from "@/components/AppHeader";
import { Board } from "@/components/Board";
import { Clock } from "@/components/Clock";
import { SoundToggle } from "@/components/SoundToggle";
import type { PreMove } from "@/hooks/useChessGame";
import type { MultiplayerGame, PieceColor, Profile } from "@/lib/types";

type MiniProfile = Pick<Profile, "id" | "username" | "elo">;

function initialMoveCount(pgn: string): number {
  if (!pgn) return 0;
  const c = new Chess();
  try {
    c.loadPgn(pgn);
  } catch {
    return 0;
  }
  return c.history().length;
}

function soundForMove(move: Move, chess: Chess): SoundType {
  if (chess.isGameOver()) return "end";
  if (chess.inCheck()) return "check";
  if (move.flags.includes("p")) return "promote";
  if (move.flags.includes("k") || move.flags.includes("q")) return "castle";
  if (move.flags.includes("c") || move.flags.includes("e")) return "capture";
  return "move";
}

interface Props {
  initialGame: MultiplayerGame;
  viewerId: string;
  whiteProfile: MiniProfile | null;
  blackProfile: MiniProfile | null;
}

export function MultiplayerGameClient({
  initialGame,
  viewerId,
  whiteProfile,
  blackProfile,
}: Props) {
  const router = useRouter();
  const [game, setGame] = useState<MultiplayerGame>(initialGame);
  const [now, setNow] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Pre-move state (mirrors the bot-game hook's pattern).
  const [preMove, setPreMoveState] = useState<PreMove | null>(null);
  const preMoveRef = useRef<PreMove | null>(null);
  const setPreMove = useCallback((pm: PreMove | null) => {
    preMoveRef.current = pm;
    setPreMoveState(pm);
  }, []);

  const lastSeenMovesRef = useRef<number>(initialMoveCount(initialGame.pgn));
  const claimedFlagRef = useRef(false);

  const myColor: PieceColor | null = colorOf(game, viewerId);

  // ─── Realtime: subscribe to the game's UPDATE events ─────────────────
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`mp:${game.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "multiplayer_games",
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          setGame(payload.new as MultiplayerGame);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [game.id]);

  // ─── Refresh server-rendered data when the game first goes live so the
  // opponent profile appears for the creator. ─────────────────────────
  const justWentLiveRef = useRef<boolean>(initialGame.status !== "waiting");
  useEffect(() => {
    if (game.status === "in_progress" && !justWentLiveRef.current) {
      justWentLiveRef.current = true;
      router.refresh();
    }
  }, [game.status, router]);

  // ─── Auto-join: if I'm not a participant and the game is waiting, join.
  useEffect(() => {
    if (game.status !== "waiting") return;
    if (myColor) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/mp-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      });
      if (cancelled) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Could not join the game");
      }
      // Successful join: Realtime will deliver the row update; router.refresh
      // happens via the effect above when status flips to in_progress.
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id, game.status, myColor]);

  // ─── Tick `now` for live clock display ───────────────────────────────
  useEffect(() => {
    if (game.status !== "in_progress" || game.time_initial_ms === 0) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [game.status, game.time_initial_ms]);

  // ─── Sound on new move ───────────────────────────────────────────────
  useEffect(() => {
    if (!game.pgn) {
      lastSeenMovesRef.current = 0;
      return;
    }
    const c = new Chess();
    try {
      c.loadPgn(game.pgn);
    } catch {
      return;
    }
    const moves = c.history({ verbose: true }) as Move[];
    if (moves.length > lastSeenMovesRef.current) {
      const last = moves[moves.length - 1];
      playSound(soundForMove(last, c));
      lastSeenMovesRef.current = moves.length;
    }
  }, [game.pgn]);

  // ─── Pre-move execution: when it becomes my turn, fire the queued move
  const postMove = useCallback(
    async (from: string, to: string, promotion?: string) => {
      const res = await fetch("/api/mp-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, from, to, promotion }),
      });
      if (!res.ok) {
        // Realtime will resync truth; surface a brief error.
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? null);
      } else {
        setError(null);
      }
    },
    [game.id],
  );

  useEffect(() => {
    if (game.status !== "in_progress" || !myColor) return;
    const sideToMove = (game.fen.split(" ")[1] ?? "w") as PieceColor;
    if (sideToMove !== myColor) return;
    const pm = preMoveRef.current;
    if (!pm) return;
    setPreMove(null);
    // Validate locally before posting (cheaper than a round-trip).
    const c = new Chess(game.fen);
    try {
      const r = c.move({
        from: pm.from as Square,
        to: pm.to as Square,
        promotion: pm.promotion ?? "q",
      });
      if (!r) return;
    } catch {
      return;
    }
    void postMove(pm.from, pm.to, pm.promotion);
  }, [game.fen, game.status, myColor, postMove, setPreMove]);

  // ─── Flag-fall claim: if opponent's clock hit zero, claim victory ────
  useEffect(() => {
    if (game.status !== "in_progress" || game.time_initial_ms === 0) return;
    if (!myColor || claimedFlagRef.current) return;
    const { white, black, sideToMove } = clocksAsOf(game, now);
    if (sideToMove === myColor) return; // can only claim while opponent's clock runs
    const opponentMs = sideToMove === "w" ? white : black;
    if (opponentMs <= 0) {
      claimedFlagRef.current = true;
      void fetch("/api/mp-claim-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      });
    }
  }, [game, now, myColor]);

  // ─── Move handlers ───────────────────────────────────────────────────
  const onMove = useCallback(
    (from: string, to: string, promotion = "q"): boolean => {
      if (!myColor || game.status !== "in_progress") return false;
      const sideToMove = (game.fen.split(" ")[1] ?? "w") as PieceColor;
      if (sideToMove !== myColor) return false;
      // Local legality check (snap-back if illegal without a round-trip).
      const c = new Chess(game.fen);
      try {
        const r = c.move({
          from: from as Square,
          to: to as Square,
          promotion,
        });
        if (!r) return false;
      } catch {
        return false;
      }
      setPreMove(null);
      void postMove(from, to, promotion);
      return true;
    },
    [game.fen, game.status, myColor, postMove, setPreMove],
  );

  const onPreMove = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      if (!myColor || game.status !== "in_progress") return false;
      const sideToMove = (game.fen.split(" ")[1] ?? "w") as PieceColor;
      if (sideToMove === myColor) return false; // play it directly instead
      // Sanity: piece on `from` is ours.
      const c = new Chess(game.fen);
      const piece = c.get(from as Square);
      if (!piece || piece.color !== myColor) return false;
      setPreMove({ from, to, promotion });
      return true;
    },
    [game.fen, game.status, myColor, setPreMove],
  );

  const clearPreMove = useCallback(() => setPreMove(null), [setPreMove]);

  // ─── Action helpers ──────────────────────────────────────────────────
  async function action(path: string, body: object) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Request failed");
    } else {
      setError(null);
    }
  }
  const resign = () => action("/api/mp-resign", { gameId: game.id });
  const offerDraw = () =>
    action("/api/mp-draw", { gameId: game.id, action: "offer" });
  const acceptDraw = () =>
    action("/api/mp-draw", { gameId: game.id, action: "accept" });
  const declineDraw = () =>
    action("/api/mp-draw", { gameId: game.id, action: "decline" });

  // ─── Derived display ─────────────────────────────────────────────────
  const sideToMove = (game.fen.split(" ")[1] ?? "w") as PieceColor;
  const clocks =
    game.time_initial_ms === 0
      ? { white: 0, black: 0, sideToMove }
      : clocksAsOf(game, now);
  const isMyTurn = !!myColor && sideToMove === myColor;
  const interactive =
    !!myColor && isMyTurn && game.status === "in_progress";
  const acceptPreMoves =
    !!myColor && !isMyTurn && game.status === "in_progress";
  const orientation: "white" | "black" =
    myColor === "b" ? "black" : "white";

  // Top clock = opponent (or black if we're not a participant).
  const topProfile = myColor === "b" ? whiteProfile : blackProfile;
  const bottomProfile = myColor === "b" ? blackProfile : whiteProfile;
  const topColor: PieceColor = myColor === "b" ? "w" : "b";
  const bottomColor: PieceColor = myColor === "b" ? "b" : "w";
  const topMs = topColor === "w" ? clocks.white : clocks.black;
  const bottomMs = bottomColor === "w" ? clocks.white : clocks.black;

  const opponentOfferingDraw =
    !!myColor &&
    game.status === "in_progress" &&
    game.draw_offer_by !== null &&
    game.draw_offer_by !== myColor;
  const myOfferPending =
    !!myColor &&
    game.status === "in_progress" &&
    game.draw_offer_by === myColor;

  // Result from viewer's perspective.
  const viewerResult =
    game.status === "completed" && game.result
      ? game.result === "draw"
        ? "Draw"
        : (game.result === "white_win" && myColor === "w") ||
            (game.result === "black_win" && myColor === "b")
          ? "Victory"
          : myColor
            ? "Defeat"
            : game.result === "white_win"
              ? "White wins"
              : "Black wins"
      : null;
  const myDelta =
    myColor === "w" && game.white_elo_after !== null
      ? game.white_elo_after - game.white_elo_before
      : myColor === "b" &&
          game.black_elo_after !== null &&
          game.black_elo_before !== null
        ? game.black_elo_after - game.black_elo_before
        : null;
  const myFinalElo =
    myColor === "w"
      ? game.white_elo_after
      : myColor === "b"
        ? game.black_elo_after
        : null;

  function shareUrl() {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/mp/${game.id}`;
  }

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <>
      <AppHeader right={<SoundToggle />} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
        <div className="mx-auto w-full max-w-[min(90vw,640px)] lg:flex-1">
          <div className="mb-2">
            <PlayerStrip
              profile={topProfile}
              ms={topMs}
              active={
                game.status === "in_progress" && clocks.sideToMove === topColor
              }
              untimed={game.time_initial_ms === 0}
              fallbackLabel={
                topProfile
                  ? topProfile.username
                  : game.status === "waiting"
                    ? "Waiting for opponent…"
                    : "Opponent"
              }
              elo={topProfile?.elo}
            />
          </div>

          <Board
            fen={game.fen}
            orientation={orientation}
            onMove={onMove}
            interactive={interactive}
            acceptPreMoves={acceptPreMoves}
            onPreMove={onPreMove}
            preMove={preMove}
            onClearPreMove={clearPreMove}
          />

          <div className="mt-2">
            <PlayerStrip
              profile={bottomProfile}
              ms={bottomMs}
              active={
                game.status === "in_progress" &&
                clocks.sideToMove === bottomColor
              }
              untimed={game.time_initial_ms === 0}
              fallbackLabel={bottomProfile?.username ?? "You"}
              elo={bottomProfile?.elo}
            />
          </div>
        </div>

        <aside className="flex w-full flex-col gap-4 lg:w-72">
          {/* Status / waiting room */}
          {game.status === "waiting" && (
            <div className="rounded-xl border border-panel-border bg-panel p-4">
              <p className="text-xs uppercase tracking-wider text-muted">
                Waiting room
              </p>
              <p className="mt-1 font-display text-xl font-bold">
                Share this link
              </p>
              <p className="mt-1 text-sm text-muted">
                The game starts as soon as your opponent opens it.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  readOnly
                  value={shareUrl()}
                  className="flex-1 truncate rounded-lg border border-panel-border bg-background px-3 py-2 text-sm"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={copyShare}
                  className="rounded-lg border border-accent/50 bg-accent/15 px-3 text-sm font-semibold text-accent-strong hover:bg-accent/25"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-3 text-xs text-muted">
                Time control:{" "}
                <span className="font-mono">
                  {game.time_initial_ms === 0
                    ? "Unlimited"
                    : `${formatClock(game.time_initial_ms)} + ${
                        game.increment_ms / 1000
                      }s`}
                </span>
              </p>
            </div>
          )}

          {/* Opponent draw offer banner */}
          {opponentOfferingDraw && (
            <div className="rounded-xl border border-accent/50 bg-accent/10 p-3">
              <p className="text-sm font-semibold text-accent-strong">
                Opponent offers a draw
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={acceptDraw}
                  className="flex-1 rounded-lg border border-accent/60 bg-accent/20 py-1.5 text-sm font-semibold text-accent-strong hover:bg-accent/30"
                >
                  Accept
                </button>
                <button
                  onClick={declineDraw}
                  className="flex-1 rounded-lg border border-panel-border py-1.5 text-sm hover:border-accent/50"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* In-game actions */}
          {game.status === "in_progress" && myColor && (
            <div className="flex flex-col gap-2 rounded-xl border border-panel-border bg-panel p-3">
              <button
                onClick={offerDraw}
                disabled={myOfferPending}
                className="rounded-lg border border-panel-border py-2 text-sm transition-colors hover:border-accent/50 disabled:opacity-50"
              >
                {myOfferPending ? "Draw offer sent…" : "Offer Draw"}
              </button>
              <button
                onClick={resign}
                className="rounded-lg border border-red-900/50 bg-red-950/30 py-2 text-sm font-semibold text-red-300 hover:border-red-700 hover:bg-red-900/30"
              >
                Resign
              </button>
            </div>
          )}

          {/* Result */}
          {game.status === "completed" && viewerResult && (
            <div className="rounded-xl border border-panel-border bg-panel p-4 text-center">
              <p
                className={`font-display text-2xl font-black ${
                  viewerResult === "Victory"
                    ? "text-emerald-400"
                    : viewerResult === "Defeat"
                      ? "text-red-400"
                      : "text-amber-300"
                }`}
              >
                {viewerResult}
              </p>
              <p className="mt-1 text-sm text-muted">
                {game.end_reason
                  ? game.end_reason.replace(/_/g, " ")
                  : "Game over"}
              </p>
              {myFinalElo !== null && myDelta !== null && (
                <p className="mt-3 text-sm">
                  Elo:{" "}
                  <span className="font-mono text-accent-strong">
                    {myFinalElo}
                  </span>{" "}
                  <span
                    className={
                      myDelta >= 0 ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    ({myDelta >= 0 ? "+" : ""}
                    {myDelta})
                  </span>
                </p>
              )}
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

          {error && (
            <p className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </aside>
      </main>
    </>
  );
}

function PlayerStrip({
  profile,
  ms,
  active,
  untimed,
  fallbackLabel,
  elo,
}: {
  profile: MiniProfile | null;
  ms: number;
  active: boolean;
  untimed: boolean;
  fallbackLabel: string;
  elo?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-baseline gap-2 truncate">
        <span className="truncate font-medium">
          {profile?.username ?? fallbackLabel}
        </span>
        {elo !== undefined && (
          <span className="text-xs text-accent">{elo}</span>
        )}
      </div>
      <div className="w-32 shrink-0">
        <Clock label="" ms={ms} active={active} untimed={untimed} />
      </div>
    </div>
  );
}

