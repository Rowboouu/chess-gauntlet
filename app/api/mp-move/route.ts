import { NextResponse, type NextRequest } from "next/server";
import { Chess, type Square } from "chess.js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { colorOf, terminalState } from "@/lib/multiplayer";
import { broadcastMpState } from "@/lib/realtime-broadcast";
import type { MultiplayerGame } from "@/lib/types";

export const preferredRegion = "sin1";

/**
 * Apply a move to a multiplayer game (server-authoritative).
 *
 * Validates: caller is a participant, it's their turn, the move is legal,
 * the game is in progress. Updates fen/pgn and the chess clock atomically.
 * If the position is terminal (mate, stalemate, etc.) or the mover's clock
 * fell during their turn, finalizes the game via `finish_mp_game` so both
 * Elos update.
 *
 * Body: { gameId: string, from: string, to: string, promotion?: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    gameId?: string;
    from?: string;
    to?: string;
    promotion?: string;
  };
  const { gameId, from, to } = body;
  if (!gameId || !from || !to) {
    return NextResponse.json(
      { error: "Missing gameId/from/to" },
      { status: 400 },
    );
  }
  const promotion = body.promotion ?? "q";

  const admin = createAdminClient();
  const { data: game, error: gErr } = await admin
    .from("multiplayer_games")
    .select("*")
    .eq("id", gameId)
    .single<MultiplayerGame>();
  if (gErr || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (game.status !== "in_progress") {
    return NextResponse.json(
      { error: "Game is not in progress" },
      { status: 409 },
    );
  }

  const myColor = colorOf(game, user.id);
  if (!myColor) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const chess = new Chess(game.fen);
  if (chess.turn() !== myColor) {
    return NextResponse.json({ error: "Not your turn" }, { status: 409 });
  }

  // --- Clock: deduct elapsed since the side-to-move's clock started. -----
  const now = new Date();
  const nowMs = now.getTime();
  const timed = game.time_initial_ms > 0;
  let newWhiteMs = game.white_time_ms;
  let newBlackMs = game.black_time_ms;
  let flagged = false;

  if (timed) {
    const startedAt = game.clock_running_since
      ? new Date(game.clock_running_since).getTime()
      : nowMs;
    const elapsed = Math.max(0, nowMs - startedAt);
    if (myColor === "w") {
      newWhiteMs = game.white_time_ms - elapsed;
      if (newWhiteMs <= 0) {
        newWhiteMs = 0;
        flagged = true;
      }
    } else {
      newBlackMs = game.black_time_ms - elapsed;
      if (newBlackMs <= 0) {
        newBlackMs = 0;
        flagged = true;
      }
    }
  }

  if (flagged) {
    // Mover's own time ran out while they were thinking — they lose on time.
    const result = myColor === "w" ? "black_win" : "white_win";
    await admin
      .from("multiplayer_games")
      .update({
        white_time_ms: newWhiteMs,
        black_time_ms: newBlackMs,
        updated_at: now.toISOString(),
      })
      .eq("id", game.id);
    await admin.rpc("finish_mp_game", {
      p_game_id: game.id,
      p_result: result,
      p_end_reason: "time",
    });
    return NextResponse.json({ ok: true, flagged: true });
  }

  // --- Apply the move. ----------------------------------------------------
  let san: string | null = null;
  try {
    const r = chess.move({ from: from as Square, to: to as Square, promotion });
    if (!r) {
      return NextResponse.json({ error: "Illegal move" }, { status: 400 });
    }
    san = r.san;
  } catch {
    return NextResponse.json({ error: "Illegal move" }, { status: 400 });
  }

  // Increment is added AFTER the move (Fischer style), and the running clock
  // hands off to the opponent.
  if (timed) {
    if (myColor === "w") newWhiteMs += game.increment_ms;
    else newBlackMs += game.increment_ms;
  }

  const terminal = terminalState(chess);

  const updates = {
    fen: chess.fen(),
    pgn: chess.pgn(),
    white_time_ms: newWhiteMs,
    black_time_ms: newBlackMs,
    // The opponent's clock starts now (or stops if the game just ended).
    clock_running_since: (terminal || !timed ? null : now.toISOString()) as
      | string
      | null,
    draw_offer_by: null,
    updated_at: now.toISOString(),
  };

  // Parallelize the DB write and the fast-path broadcast. Opponent receives
  // the broadcast in ~30-50 ms; postgres_changes echo lands later as a
  // confirmation. We need to await the DB write so a failure surfaces;
  // broadcast is fire-and-forget.
  const [updateResult] = await Promise.all([
    admin
      .from("multiplayer_games")
      .update(updates)
      .eq("id", game.id)
      .eq("status", "in_progress"),
    broadcastMpState(game.id, { ...game, ...updates }),
  ]);

  if (updateResult.error) {
    return NextResponse.json(
      { error: updateResult.error.message },
      { status: 500 },
    );
  }

  if (terminal) {
    const { error: fErr } = await admin.rpc("finish_mp_game", {
      p_game_id: game.id,
      p_result: terminal.result,
      p_end_reason: terminal.endReason,
    });
    if (fErr) {
      return NextResponse.json({ error: fErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, san });
}
