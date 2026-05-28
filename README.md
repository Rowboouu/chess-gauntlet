# Rowboouu's Chess Gauntlet

Climb a ladder of progressively stronger chess bots, earn a standard Elo rating, and top the
global leaderboard. Built with **Next.js (App Router)**, **Tailwind CSS**, **Supabase**
(Postgres + Auth), **chess.js**, **react-chessboard**, and **Stockfish** (WASM, in a Web Worker).

## Features

- **Gauntlet mode** — 10 fixed-strength bot rungs (500 → 2400 Elo). Beat one to unlock the next.
- **Free play** — pick any rung as a one-off rated game.
- **Standard Elo**, computed **server-side** so the leaderboard can't be faked.
- **Saved games** — leave mid-game and "Continue" resumes the exact position.
- **Global leaderboard** tied to Supabase Auth accounts.
- Designed so **human-vs-human multiplayer** can be added later via Supabase Realtime — no stack change.

## Setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

At [supabase.com](https://supabase.com) → New project. Then:

- **SQL Editor** → paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
  This creates the `profiles` and `games` tables, RLS policies, the signup trigger, and the
  `finish_game` RPC.
- **Authentication → Providers → Email**: for instant play during development, turn **off**
  "Confirm email" so new accounts get a session immediately. (Leave it on in production and the
  app will prompt users to confirm.)

### 3. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in from **Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; used by the `finish-game` route to apply Elo. **Never** expose it to the browser.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

## How it fits together

- `app/page.tsx` — home screen (New Game / Continue / Leaderboards / Quit).
- `app/new` — choose Gauntlet (next rung) or Free Play (any difficulty) + color.
- `app/game/[id]` — the board. `components/GameClient.tsx` wires `useChessGame` (chess.js +
  Stockfish) to the UI, autosaves FEN/PGN, and on game-over POSTs to `app/api/finish-game`.
- `app/api/finish-game/route.ts` — re-derives the result from the PGN server-side, then calls the
  `finish_game` RPC (service-role only) to update Elo atomically.
- `lib/bots.ts` — the ladder. `lib/elo.ts` — Elo math (mirrored in SQL inside the RPC).
- `lib/engine/stockfish.ts` — UCI Web Worker wrapper. Engine files live in `public/stockfish/`.

## Deploying to Vercel

Push to GitHub, import into Vercel, and set the three env vars in the Vercel project settings.
The Stockfish build is single-threaded, so no special cross-origin-isolation headers are needed.

## Anti-cheat note

Clients can't write rating columns directly — RLS blocks it and a trigger guards the `profiles`
rating fields. The only path that changes Elo is the `finish_game` RPC, callable only by the
service role, and only after the server has verified the game actually ended.
