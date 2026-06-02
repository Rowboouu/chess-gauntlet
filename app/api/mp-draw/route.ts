import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { colorOf } from "@/lib/multiplayer";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { MultiplayerGame } from "@/lib/types";

export const preferredRegion = "sin1";

/**
 * Draw offer flow.
 *
 * - `offer`: set `draw_offer_by` to caller's color. No-op if same offer
 *   already pending. The next move by either side cancels the offer.
 * - `accept`: only valid when the OTHER side has an offer pending. Ends the
 *   game as a draw with `end_reason = 'agreement'`.
 * - `decline`: clears the offer.
 *
 * Body: { gameId, action: 'offer' | 'accept' | 'decline' }
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
    action?: "offer" | "accept" | "decline";
  };
  const { gameId, action } = body;
  if (!gameId || !action) {
    return NextResponse.json({ error: "Missing gameId/action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const limited = await enforceRateLimit(admin, user.id, {
    bucket: "mp_draw",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

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

  if (action === "offer") {
    if (game.draw_offer_by === myColor) {
      return NextResponse.json({ ok: true }); // idempotent
    }
    await admin
      .from("multiplayer_games")
      .update({ draw_offer_by: myColor, updated_at: new Date().toISOString() })
      .eq("id", game.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    await admin
      .from("multiplayer_games")
      .update({ draw_offer_by: null, updated_at: new Date().toISOString() })
      .eq("id", game.id);
    return NextResponse.json({ ok: true });
  }

  // accept
  if (!game.draw_offer_by || game.draw_offer_by === myColor) {
    return NextResponse.json(
      { error: "No draw offer from the opponent to accept" },
      { status: 409 },
    );
  }
  const { error } = await admin.rpc("finish_mp_game", {
    p_game_id: game.id,
    p_result: "draw",
    p_end_reason: "agreement",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
