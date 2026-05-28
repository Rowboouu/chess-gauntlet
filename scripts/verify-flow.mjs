// Temporary end-to-end backend verification. Creates a throwaway user, runs a
// game through finish_game, checks Elo + the anti-cheat guard, then deletes the
// user (cascades to profile + games). Run: node scripts/verify-flow.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;

const anon = createClient(URL, ANON);
const admin = createClient(URL, SRK, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ok = (b) => (b ? "PASS" : "FAIL");
const email = `chess-verify-${Date.now()}@example.com`;
const password = "test-Password-123";
const username = `verify_${Date.now().toString().slice(-6)}`;
let userId = null;

try {
  // 1) Sign up (anon) → should create auth user + fire profile trigger.
  const { data: signUp, error: suErr } = await anon.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (suErr) throw new Error("signup: " + suErr.message);
  userId = signUp.user?.id;
  const hasSession = !!signUp.session;
  console.log(`1. signup ......................... ${ok(!!userId)} (user created${hasSession ? ", session returned" : ", NO session — confirm-email may be ON"})`);

  // 2) Profile auto-created at Elo 1000 (read via admin to bypass RLS timing).
  const { data: prof } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  console.log(`2. profile trigger ................ ${ok(prof && prof.elo === 1000 && prof.games_played === 0)} (elo=${prof?.elo}, username=${prof?.username})`);

  // 3) Create a gauntlet game vs the level-1 bot (Elo 500).
  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const { data: game, error: gErr } = await admin
    .from("games")
    .insert({
      user_id: userId,
      mode: "gauntlet",
      bot_level: 1,
      bot_elo: 500,
      player_color: "w",
      fen: startFen,
      pgn: "",
      status: "in_progress",
      elo_before: 1000,
    })
    .select("id")
    .single();
  if (gErr) throw new Error("create game: " + gErr.message);
  console.log(`3. create game .................... ${ok(!!game?.id)}`);

  // 4) finish_game(win) via service role → Elo up, gauntlet advances.
  const { data: updated, error: fgErr } = await admin
    .rpc("finish_game", { p_game_id: game.id, p_result: "win" })
    .single();
  if (fgErr) throw new Error("finish_game: " + fgErr.message);
  const eloRose = updated.elo > 1000;
  console.log(`4. finish_game(win) ............... ${ok(eloRose && updated.wins === 1 && updated.highest_level_cleared === 1)} (elo 1000 -> ${updated.elo}, +${updated.elo - 1000}, wins=${updated.wins}, cleared=${updated.highest_level_cleared})`);

  // 5) Anti-cheat: signed-in user cannot bump their own Elo directly.
  let guardWorks = false;
  if (hasSession) {
    const userClient = createClient(URL, ANON);
    await userClient.auth.setSession({
      access_token: signUp.session.access_token,
      refresh_token: signUp.session.refresh_token,
    });
    const { error: cheatErr } = await userClient
      .from("profiles")
      .update({ elo: 9999 })
      .eq("id", userId);
    guardWorks = !!cheatErr;
    console.log(`5. anti-cheat guard ............... ${ok(guardWorks)} (${cheatErr ? "blocked: " + cheatErr.message : "NOT BLOCKED — direct elo write succeeded!"})`);
  } else {
    console.log(`5. anti-cheat guard ............... SKIP (no session; enable instant signup to test)`);
  }

  // 6) Leaderboard query returns the user.
  const { data: board } = await anon
    .from("profiles")
    .select("username, elo")
    .order("elo", { ascending: false })
    .limit(100);
  const onBoard = board?.some((r) => r.username === username);
  console.log(`6. leaderboard read (anon) ........ ${ok(onBoard)} (${board?.length} rows visible)`);
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  // Cleanup: delete the throwaway user (cascades to profile + games).
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    console.log(`cleanup: delete test user ......... ${error ? "FAIL " + error.message : "done"}`);
  }
}
