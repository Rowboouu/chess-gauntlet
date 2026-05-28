import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { MultiplayerGame, Profile } from "@/lib/types";

/**
 * Join a waiting multiplayer game as the second player.
 *
 * - Caller must be authenticated and not already a participant.
 * - If `creator_color === 'b'`, swap participant ids so the creator sits as
 *   black and the joiner sits as white. Elo-before snapshots swap too.
 * - Start the clock by stamping `clock_running_since = now()` and flipping
 *   `status` to `in_progress`.
 *
 * Body: { gameId: string }
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
  const { data: game, error: gErr } = await admin
    .from("multiplayer_games")
    .select("*")
    .eq("id", gameId)
    .single<MultiplayerGame>();
  if (gErr || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (game.status !== "waiting") {
    return NextResponse.json(
      { error: "Game is not joinable" },
      { status: 409 },
    );
  }
  if (game.white_user_id === user.id || game.black_user_id === user.id) {
    return NextResponse.json(
      { error: "You're already in this game" },
      { status: 409 },
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Decide seating based on the creator's stated color preference.
  const updates =
    game.creator_color === "w"
      ? {
          black_user_id: user.id,
          black_elo_before: profile.elo,
        }
      : {
          // Creator wanted black → swap: creator becomes black, joiner is white.
          white_user_id: user.id,
          black_user_id: game.white_user_id,
          white_elo_before: profile.elo,
          black_elo_before: game.white_elo_before,
        };

  const { error: uErr } = await admin
    .from("multiplayer_games")
    .update({
      ...updates,
      status: "in_progress",
      clock_running_since: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .eq("status", "waiting"); // race guard

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
