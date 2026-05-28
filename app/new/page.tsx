import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { NewGameForm } from "@/components/NewGameForm";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewGamePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <h1 className="mb-6 font-display text-3xl font-bold">New Game</h1>
        <NewGameForm
          highestCleared={profile?.highest_level_cleared ?? 0}
          playerElo={profile?.elo ?? 1000}
        />
      </main>
    </>
  );
}
