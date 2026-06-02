import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getTimeControl } from "@/lib/timeControls";
import { START_FEN } from "@/lib/multiplayer";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { PieceColor, Profile } from "@/lib/types";

export const preferredRegion = "sin1";

/**
 * Create a new multiplayer game. The creator is always seated as white in
 * the row (white_user_id is NOT NULL); their requested color is stored in
 * `creator_color`. If they picked black, /api/mp-join swaps participants
 * when the opponent joins.
 *
 * Body: { time_control_id: string, color: 'w' | 'b' | 'random' }
 * Returns: { id, creatorColor }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const limited = await enforceRateLimit(admin, user.id, {
    bucket: "mp_create",
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const tc = getTimeControl(body?.time_control_id);
  const colorChoice = body?.color as PieceColor | "random" | undefined;
  if (!tc || !colorChoice) {
    return NextResponse.json(
      { error: "Missing or invalid time_control_id / color" },
      { status: 400 },
    );
  }

  const creatorColor: PieceColor =
    colorChoice === "random"
      ? Math.random() < 0.5
        ? "w"
        : "b"
      : colorChoice;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("multiplayer_games")
    .insert({
      white_user_id: user.id,
      black_user_id: null,
      creator_color: creatorColor,
      fen: START_FEN,
      pgn: "",
      status: "waiting",
      time_initial_ms: tc.initialMs,
      increment_ms: tc.incrementMs,
      white_time_ms: tc.initialMs,
      black_time_ms: tc.initialMs,
      white_elo_before: profile.elo,
      black_elo_before: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create game" },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data.id, creatorColor });
}
