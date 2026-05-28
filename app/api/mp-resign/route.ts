import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { colorOf } from "@/lib/multiplayer";
import type { MultiplayerGame } from "@/lib/types";

/** Resign — caller loses, opponent wins. Body: { gameId } */
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

  const myColor = colorOf(game, user.id);
  if (!myColor) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const result = myColor === "w" ? "black_win" : "white_win";
  const { error } = await admin.rpc("finish_mp_game", {
    p_game_id: game.id,
    p_result: result,
    p_end_reason: "resignation",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
