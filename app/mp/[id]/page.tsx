import { notFound } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { joinWaitingGame } from "@/lib/multiplayer-server";
import { colorOf } from "@/lib/multiplayer";
import { MultiplayerGameClient } from "@/components/MultiplayerGameClient";
import type { MultiplayerGame, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export default async function MultiplayerGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let game = (
    await supabase
      .from("multiplayer_games")
      .select("*")
      .eq("id", id)
      .single<MultiplayerGame>()
  ).data;
  if (!game) notFound();

  // If the viewer isn't a participant yet and the game is waiting, seat them
  // server-side so the first render already shows the joined state — no
  // client-side race against Realtime subscription timing.
  if (game.status === "waiting" && colorOf(game, user.id) === null) {
    const admin = createAdminClient();
    const joined = await joinWaitingGame(admin, game, user.id);
    if (joined.ok) game = joined.game;
  }

  const ids = [game.white_user_id, game.black_user_id].filter(
    (x): x is string => !!x,
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, elo")
    .in("id", ids)
    .returns<Pick<Profile, "id" | "username" | "elo">[]>();

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p]),
  );

  return (
    <MultiplayerGameClient
      initialGame={game}
      viewerId={user.id}
      whiteProfile={profileMap[game.white_user_id] ?? null}
      blackProfile={
        game.black_user_id ? (profileMap[game.black_user_id] ?? null) : null
      }
    />
  );
}
