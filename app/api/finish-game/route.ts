import { NextResponse, type NextRequest } from "next/server";
import { Chess } from "chess.js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { GameResult } from "@/lib/elo";
import type { Game, PieceColor, Profile } from "@/lib/types";

/**
 * Authoritatively completes a game and applies Elo.
 *
 * The client sends the final PGN; the server REPLAYS it with chess.js to
 * determine the true terminal result (it never trusts a client-claimed
 * outcome), confirms the game belongs to the caller and is still in progress,
 * then calls the service-role-only `finish_game` RPC which atomically updates
 * the game + profile. This is the only path that can change a rating.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { gameId?: string; pgn?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { gameId, pgn } = body;
  if (!gameId || typeof pgn !== "string") {
    return NextResponse.json({ error: "Missing gameId or pgn" }, { status: 400 });
  }

  // Fetch the game under the caller's session (RLS ensures ownership).
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single<Game>();
  if (gameErr || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (game.status === "completed") {
    return NextResponse.json({ error: "Game already completed" }, { status: 409 });
  }

  // Replay the PGN to verify it actually reached a terminal position.
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return NextResponse.json({ error: "Invalid PGN" }, { status: 400 });
  }
  if (!chess.isGameOver()) {
    return NextResponse.json(
      { error: "Game is not over" },
      { status: 400 },
    );
  }

  const result = resultFor(chess, game.player_color);

  // Apply atomically via the locked-down RPC (service role only).
  const admin = createAdminClient();
  const { data: profile, error: rpcErr } = await admin
    .rpc("finish_game", { p_game_id: gameId, p_result: result })
    .single<Profile>();

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  return NextResponse.json({ result, profile });
}

function resultFor(chess: Chess, playerColor: PieceColor): GameResult {
  if (chess.isCheckmate()) {
    // The side to move is checkmated → they lost.
    return chess.turn() === playerColor ? "loss" : "win";
  }
  return "draw";
}
