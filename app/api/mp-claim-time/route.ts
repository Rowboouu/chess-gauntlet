import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { colorOf, clocksAsOf } from "@/lib/multiplayer";
import type { MultiplayerGame } from "@/lib/types";

export const preferredRegion = "sin1";

/**
 * Claim victory because the opponent's clock has expired.
 *
 * The server recomputes the clocks against the current moment; only the
 * side NOT to move can claim, and only when the side-to-move's clock has
 * actually hit zero on the server. Body: { gameId }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { gameId } = (await request.json().catch(() => ({}))) as { gameId?: string };
  if (!gameId) {
    return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("multiplayer_games")
    .select("*")
    .eq("id", gameId)
    .single<MultiplayerGame>();
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (game.status !== "in_progress") {
    return NextResponse.json({ error: "Game is not in progress" }, { status: 409 });
  }
  if (game.time_initial_ms === 0) {
    return NextResponse.json({ error: "Untimed game" }, { status: 409 });
  }

  const myColor = colorOf(game, user.id);
  if (!myColor) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const { white, black, sideToMove } = clocksAsOf(game, Date.now());
  if (sideToMove === myColor) {
    return NextResponse.json(
      { error: "Can't claim while it's your turn" },
      { status: 409 },
    );
  }
  const opponentRemaining = sideToMove === "w" ? white : black;
  if (opponentRemaining > 0) {
    return NextResponse.json(
      { error: "Opponent still has time", remainingMs: opponentRemaining },
      { status: 409 },
    );
  }

  const result = sideToMove === "w" ? "black_win" : "white_win";
  await admin
    .from("multiplayer_games")
    .update({
      white_time_ms: white,
      black_time_ms: black,
      updated_at: new Date().toISOString(),
    })
    .eq("id", game.id);
  const { error } = await admin.rpc("finish_mp_game", {
    p_game_id: game.id,
    p_result: result,
    p_end_reason: "time",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
