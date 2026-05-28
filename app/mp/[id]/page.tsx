import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MultiplayerGameClient } from "@/components/MultiplayerGameClient";
import type { MultiplayerGame, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

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

  const { data: game } = await supabase
    .from("multiplayer_games")
    .select("*")
    .eq("id", id)
    .single<MultiplayerGame>();
  if (!game) notFound();

  // Fetch participant profiles (both readable due to the world-read policy).
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
