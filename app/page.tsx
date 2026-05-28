import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Title } from "@/components/Title";
import { MenuButton } from "@/components/MenuButton";
import { QuitButton } from "@/components/QuitButton";
import { MAX_LEVEL } from "@/lib/bots";
import type { Game, Profile } from "@/lib/types";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware guarantees a user here, but guard anyway.
  if (!user) return null;

  const [{ data: profile }, { data: savedGame }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single<Profile>(),
    supabase
      .from("games")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<Game>(),
  ]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="mb-10 text-center">
        <Title />
        {profile && (
          <p className="mt-6 text-sm text-muted">
            Welcome back,{" "}
            <span className="font-semibold text-foreground">
              {profile.username}
            </span>{" "}
            · <span className="text-accent">{profile.elo}</span> Elo · Gauntlet{" "}
            {profile.highest_level_cleared}/{MAX_LEVEL}
          </p>
        )}
      </div>

      <nav className="flex w-full max-w-sm flex-col gap-3">
        <MenuButton
          href="/new"
          variant="primary"
          icon="♞"
          label="New Game"
          sublabel="Climb the gauntlet or pick a difficulty"
        />
        <MenuButton
          href={savedGame ? `/game/${savedGame.id}` : undefined}
          disabled={!savedGame}
          icon="▶"
          label="Continue"
          sublabel={
            savedGame
              ? `Resume your ${savedGame.mode} game`
              : "No saved game in progress"
          }
        />
        <MenuButton
          href="/leaderboard"
          icon="♛"
          label="Leaderboards"
          sublabel="Global Elo rankings"
        />
        <QuitButton />
      </nav>

      <footer className="mt-12 text-center text-xs text-muted">
        <Link href="/leaderboard" className="hover:text-accent">
          Standard Elo · {MAX_LEVEL} bot levels · more to come
        </Link>
      </footer>
    </main>
  );
}
