/**
 * Server-side multiplayer helpers. Uses the admin (service-role) client and
 * therefore MUST only be imported from server contexts (route handlers,
 * server components, server actions).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { colorOf } from "./multiplayer";
import type { MultiplayerGame, Profile } from "./types";

export type JoinOutcome =
  | { ok: true; game: MultiplayerGame }
  | { ok: false; reason: string };

/**
 * Atomically transition a waiting game to in_progress by seating `userId` as
 * the missing player. Handles the `creator_color = 'b'` swap so seating
 * matches the creator's preference. Idempotent: returns the existing game
 * unchanged if the user is already a participant.
 */
export async function joinWaitingGame(
  admin: SupabaseClient,
  game: MultiplayerGame,
  userId: string,
): Promise<JoinOutcome> {
  if (colorOf(game, userId)) {
    return { ok: true, game }; // already in this game — no-op
  }
  if (game.status !== "waiting") {
    return { ok: false, reason: "Game is not joinable" };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single<Profile>();
  if (!profile) {
    return { ok: false, reason: "Profile not found" };
  }

  const updates =
    game.creator_color === "w"
      ? {
          black_user_id: userId,
          black_elo_before: profile.elo,
        }
      : {
          // Creator wanted black → swap: creator becomes black, joiner is white.
          white_user_id: userId,
          black_user_id: game.white_user_id,
          white_elo_before: profile.elo,
          black_elo_before: game.white_elo_before,
        };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("multiplayer_games")
    .update({
      ...updates,
      status: "in_progress",
      clock_running_since: now,
      updated_at: now,
    })
    .eq("id", game.id)
    .eq("status", "waiting") // race guard
    .select("*")
    .single<MultiplayerGame>();

  if (error || !data) {
    return { ok: false, reason: error?.message ?? "Update failed" };
  }
  return { ok: true, game: data };
}
