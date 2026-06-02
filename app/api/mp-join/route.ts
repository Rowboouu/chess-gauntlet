import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { joinWaitingGame } from "@/lib/multiplayer-server";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { MultiplayerGame } from "@/lib/types";

export const preferredRegion = "sin1";

/**
 * Join a waiting multiplayer game as the second player.
 *
 * The /mp/[id] page also performs this server-side before render, so this
 * route is the explicit-action fallback (e.g. when the client needs to
 * re-attempt). Body: { gameId: string }
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
  const limited = await enforceRateLimit(admin, user.id, {
    bucket: "mp_join",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { data: game, error: gErr } = await admin
    .from("multiplayer_games")
    .select("*")
    .eq("id", gameId)
    .single<MultiplayerGame>();
  if (gErr || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const result = await joinWaitingGame(admin, game, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
