-- Rowboouu's Chess Gauntlet — initial schema
-- Run in the Supabase SQL editor, or via `supabase db push` with the CLI.

-- ─────────────────────────────────────────────────────────────────────────
-- profiles: one row per auth user. Auto-created on signup (trigger below).
-- World-readable for the leaderboard; rating fields are NOT user-writable
-- (only the SECURITY DEFINER finish_game function may change them).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  username              text not null unique,
  elo                   integer not null default 1000,
  games_played          integer not null default 0,
  wins                  integer not null default 0,
  losses                integer not null default 0,
  draws                 integer not null default 0,
  highest_level_cleared integer not null default 0,
  created_at            timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- games: every game a user starts. fen+pgn make "Continue" work and keep a
-- replayable record. bot_level/bot_elo are the opponent; this is the seam
-- where a future opponent_user_id slots in for multiplayer.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.games (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  mode         text not null check (mode in ('gauntlet', 'free')),
  bot_level    integer not null,
  bot_elo      integer not null,
  player_color text not null check (player_color in ('w', 'b')),
  fen          text not null,
  pgn          text not null default '',
  status       text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  result       text check (result in ('win', 'loss', 'draw')),
  elo_before   integer not null,
  elo_after    integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists games_user_status_idx
  on public.games (user_id, status, updated_at desc);

create index if not exists profiles_elo_idx on public.profiles (elo desc);

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.games enable row level security;

-- Anyone signed in can read all profiles (leaderboard).
drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
  on public.profiles for select
  using (true);

-- A user may update only their own profile, and only the username — rating
-- columns are guarded by the trigger below so they can't be self-edited.
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users see and manage only their own games.
drop policy if exists "users read own games" on public.games;
create policy "users read own games"
  on public.games for select
  using (auth.uid() = user_id);

drop policy if exists "users insert own games" on public.games;
create policy "users insert own games"
  on public.games for insert
  with check (auth.uid() = user_id);

-- Users may autosave fen/pgn on their own in-progress games. Completing a
-- game (status/result/elo_after) goes through finish_game, not here; the
-- trigger below blocks client-side rating writes.
drop policy if exists "users update own games" on public.games;
create policy "users update own games"
  on public.games for update
  using (auth.uid() = user_id and status = 'in_progress')
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Guard: prevent users from editing their own rating/stats directly.
-- Any non-finish_game UPDATE that tries to change rating columns is rejected.
-- finish_game runs as SECURITY DEFINER and sets a flag to bypass this.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.protect_profile_stats()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_rating_write', true) = 'on' then
    return new;
  end if;
  if new.elo is distinct from old.elo
     or new.games_played is distinct from old.games_played
     or new.wins is distinct from old.wins
     or new.losses is distinct from old.losses
     or new.draws is distinct from old.draws
     or new.highest_level_cleared is distinct from old.highest_level_cleared then
    raise exception 'rating columns are read-only';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_stats on public.profiles;
create trigger protect_profile_stats
  before update on public.profiles
  for each row execute function public.protect_profile_stats();

-- ─────────────────────────────────────────────────────────────────────────
-- Auto-create a profile when a new auth user signs up. Username comes from
-- the signup metadata ("username"), falling back to the email local part.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired text;
begin
  desired := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  );
  -- Ensure uniqueness by suffixing if needed.
  if exists (select 1 from public.profiles where username = desired) then
    desired := desired || '_' || substr(new.id::text, 1, 6);
  end if;

  insert into public.profiles (id, username)
  values (new.id, desired);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- finish_game: the ONLY path that mutates rating/stats. Computes standard
-- Elo, updates the game and profile atomically, and advances gauntlet
-- progress. Locked to the service_role — the app's server validates the
-- result (by replaying the PGN) before calling this.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.finish_game(p_game_id uuid, p_result text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  g           public.games;
  p           public.profiles;
  v_expected  numeric;
  v_score     numeric;
  v_k         integer;
  v_new_elo   integer;
  v_cleared   integer;
begin
  if p_result not in ('win', 'loss', 'draw') then
    raise exception 'invalid result %', p_result;
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if g.status = 'completed' then raise exception 'game already completed'; end if;

  select * into p from public.profiles where id = g.user_id for update;

  v_expected := 1.0 / (1 + power(10, (g.bot_elo - p.elo) / 400.0));
  v_score    := case p_result when 'win' then 1 when 'draw' then 0.5 else 0 end;
  v_k        := case when p.games_played < 30 then 40 else 20 end;
  v_new_elo  := round(p.elo + v_k * (v_score - v_expected));

  -- Advance the gauntlet only on a win at the exact next rung.
  v_cleared := p.highest_level_cleared;
  if g.mode = 'gauntlet'
     and p_result = 'win'
     and g.bot_level = p.highest_level_cleared + 1 then
    v_cleared := g.bot_level;
  end if;

  update public.games
     set status     = 'completed',
         result     = p_result,
         elo_after  = v_new_elo,
         updated_at = now()
   where id = g.id;

  perform set_config('app.allow_rating_write', 'on', true);
  update public.profiles
     set elo                   = v_new_elo,
         games_played          = games_played + 1,
         wins                  = wins   + (case when p_result = 'win'  then 1 else 0 end),
         losses                = losses + (case when p_result = 'loss' then 1 else 0 end),
         draws                 = draws  + (case when p_result = 'draw' then 1 else 0 end),
         highest_level_cleared = v_cleared
   where id = p.id
   returning * into p;
  perform set_config('app.allow_rating_write', 'off', true);

  return p;
end;
$$;

-- Only the server (service_role) may finish a game.
revoke all on function public.finish_game(uuid, text) from public, anon, authenticated;
grant execute on function public.finish_game(uuid, text) to service_role;
