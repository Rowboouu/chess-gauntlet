"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChessGame } from "@/hooks/useChessGame";
import { createClient } from "@/lib/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { GameStatus } from "@/components/GameStatus";
import { Board } from "@/components/Board";
import { SoundToggle } from "@/components/SoundToggle";
import { QuitControls } from "@/components/QuitControls";
import type { BotLevel } from "@/lib/bots";
import type { GameResult } from "@/lib/elo";
import type { Game } from "@/lib/types";

type FinishState = "idle" | "saving" | "done" | "error";

export function GameClient({ game, bot }: { game: Game; bot: BotLevel }) {
  const router = useRouter();
  const [finishState, setFinishState] = useState<FinishState>(
    game.status === "completed" ? "done" : "idle",
  );
  const [newElo, setNewElo] = useState<number | null>(game.elo_after);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autosave of fen/pgn to the in-progress game row.
  const persist = useCallback(
    (fen: string, pgn: string) => {
      if (game.status === "completed") return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const supabase = createClient();
        await supabase
          .from("games")
          .update({ fen, pgn, updated_at: new Date().toISOString() })
          .eq("id", game.id)
          .eq("status", "in_progress");
      }, 700);
    },
    [game.id, game.status],
  );

  const handleEnd = useCallback(
    async (_result: GameResult, _fen: string, pgn: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setFinishState("saving");
      try {
        const res = await fetch("/api/finish-game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: game.id, pgn }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setNewElo(data.profile?.elo ?? null);
        setFinishState("done");
      } catch {
        setFinishState("error");
      }
    },
    [game.id],
  );

  const { state, move } = useChessGame({
    initialFen: game.fen,
    initialPgn: game.pgn || undefined,
    playerColor: game.player_color,
    bot,
    onPersist: persist,
    onGameEnd: handleEnd,
  });

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Keep the game (resume later via "Continue") — flush the latest position
  // immediately so nothing is lost to the autosave debounce.
  const saveAndQuit = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const supabase = createClient();
    await supabase
      .from("games")
      .update({
        fen: state.fen,
        pgn: state.pgn,
        updated_at: new Date().toISOString(),
      })
      .eq("id", game.id)
      .eq("status", "in_progress");
    router.push("/");
  }, [game.id, router, state.fen, state.pgn]);

  // Discard the game entirely (RLS allows deleting only own in-progress games).
  const discardAndQuit = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const supabase = createClient();
    await supabase
      .from("games")
      .delete()
      .eq("id", game.id)
      .eq("status", "in_progress");
    router.push("/");
  }, [game.id, router]);

  const eloDelta =
    newElo !== null && game.elo_before !== null
      ? newElo - game.elo_before
      : null;

  const interactive =
    !state.isGameOver && !state.isThinking && state.turn === game.player_color;

  return (
    <>
      <AppHeader right={<SoundToggle />} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
        <div className="mx-auto w-full max-w-[min(90vw,640px)] lg:flex-1">
          <Board
            fen={state.fen}
            orientation={game.player_color === "w" ? "white" : "black"}
            onMove={move}
            interactive={interactive}
          />
        </div>
        <GameStatus
          bot={bot}
          playerColor={game.player_color}
          state={state}
          finishState={finishState}
          eloDelta={eloDelta}
          newElo={newElo}
          quitControls={
            !state.isGameOver ? (
              <QuitControls
                onSaveQuit={saveAndQuit}
                onDiscardQuit={discardAndQuit}
              />
            ) : null
          }
        />
      </main>
    </>
  );
}
