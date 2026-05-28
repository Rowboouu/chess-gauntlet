import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GameClient } from "@/components/GameClient";
import { getBotLevel } from "@/lib/bots";
import type { Game } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single<Game>();

  if (!game) notFound();

  const bot = getBotLevel(game.bot_level);
  if (!bot) notFound();

  return <GameClient game={game} bot={bot} />;
}
