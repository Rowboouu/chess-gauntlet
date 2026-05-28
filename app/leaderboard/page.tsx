import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { MAX_LEVEL } from "@/lib/bots";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("elo", { ascending: false })
    .order("games_played", { ascending: false })
    .limit(100)
    .returns<Profile[]>();

  const rows = profiles ?? [];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="mb-6 font-display text-3xl font-bold">
          Global Leaderboard
        </h1>

        <div className="overflow-hidden rounded-2xl border border-panel-border">
          <table className="w-full text-sm">
            <thead className="bg-panel text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3 text-right">Elo</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">W/L/D</th>
                <th className="px-4 py-3 text-right">Gauntlet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const isMe = p.id === user?.id;
                return (
                  <tr
                    key={p.id}
                    className={`border-t border-panel-border ${
                      isMe ? "bg-accent/10" : "hover:bg-panel/50"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-muted">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">
                      {p.username}
                      {isMe && (
                        <span className="ml-2 text-xs text-accent">you</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-accent-strong">
                      {p.elo}
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono text-muted sm:table-cell">
                      {p.wins}/{p.losses}/{p.draws}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted">
                      {p.highest_level_cleared}/{MAX_LEVEL}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No players yet — be the first to climb.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
