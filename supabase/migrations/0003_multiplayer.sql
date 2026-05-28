-- Multiplayer: invite-link 1v1 games with server-authoritative moves, a
-- server-authoritative chess clock (Fischer increment), draw offers, and
-- Elo updates for both players on completion.

-- ─────────────────────────────────────────────────────────────────────────
-- Table: kept separate from public.games so the bot-game schema doesn't grow
-- a pile of nullable columns. A single row represents one 1v1 game.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.multiplayer_games (
  id                  uuid primary key default gen_random_uuid(),
  white_user_id       uuid not null references auth.users (id) on delete cascade,
  black_user_id       uuid          references auth.users (id) on delete cascade,
  -- Color the creator requested at create time. Used by mp-join to swap
  -- participants when the creator picked black, so the seating matches.
  creator_color       text not null default 'w' check (creator_color in ('w', 'b')),
  fen                 text not null,
  pgn                 text not null default '',
  status              text not null default 'waiting'
                        check (status in ('waiting', 'in_progress', 'completed', 'aborted')),
  result              text check (result in ('white_win', 'black_win', 'draw')),
  end_reason          text, -- 'checkmate' | 'resignation' | 'time' | 'stalemate' | etc.
  draw_offer_by       text check (draw_offer_by in ('w', 'b')),

  -- Clock (server-authoritative, milliseconds).
  time_initial_ms     integer not null, -- 0 = no time control
  increment_ms        integer not null default 0,
  white_time_ms       integer not null,
  black_time_ms       integer not null,
  clock_running_since timestamptz, -- when the side-to-move's clock started; null while waiting or completed

  white_elo_before    integer not null,
  black_elo_before    integer,
  white_elo_after     integer,
  black_elo_after     integer,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists mp_games_white_idx  on public.multiplayer_games (white_user_id, status, updated_at desc);
create index if not exists mp_games_black_idx  on public.multiplayer_games (black_user_id, status, updated_at desc);
create index if not exists mp_games_status_idx on public.multiplayer_games (status, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS: participants can SELECT the row; anyone authenticated can SELECT
-- a 'waiting' row (the invite link assumes you know the id). INSERT is
-- gated to creating yourself as white. UPDATE/DELETE go through service
-- role only (the API routes) — clients never write game state directly.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.multiplayer_games enable row level security;

drop policy if exists "mp participants and waiting visible" on public.multiplayer_games;
create policy "mp participants and waiting visible"
  on public.multiplayer_games for select
  using (
    auth.uid() = white_user_id
    or auth.uid() = black_user_id
    or status = 'waiting'
  );

drop policy if exists "mp create as self" on public.multiplayer_games;
create policy "mp create as self"
  on public.multiplayer_games for insert
  with check (auth.uid() = white_user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Realtime: subscribe to row UPDATEs so both clients see each move/clock tick.
-- ─────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.multiplayer_games;

-- ─────────────────────────────────────────────────────────────────────────
-- finish_mp_game: end a multiplayer game, computing standard Elo for BOTH
-- players atomically. Service role only — called by the API after the
-- server has verified the terminal state (checkmate replay, time-out,
-- resignation, draw acceptance, etc.).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.finish_mp_game(
  p_game_id uuid,
  p_result text,
  p_end_reason text
)
returns public.multiplayer_games
language plpgsql
security definer
set search_path = public
as $$
declare
  g          public.multiplayer_games;
  pw         public.profiles;
  pb         public.profiles;
  v_w_score  numeric;
  v_b_score  numeric;
  v_w_exp    numeric;
  v_b_exp    numeric;
  v_w_k      integer;
  v_b_k      integer;
  v_w_new    integer;
  v_b_new    integer;
begin
  if p_result not in ('white_win', 'black_win', 'draw') then
    raise exception 'invalid result %', p_result;
  end if;

  select * into g from public.multiplayer_games where id = p_game_id for update;
  if not found                       then raise exception 'game not found'; end if;
  if g.status = 'completed'          then raise exception 'game already completed'; end if;
  if g.black_user_id is null         then raise exception 'no opponent joined yet'; end if;

  select * into pw from public.profiles where id = g.white_user_id for update;
  select * into pb from public.profiles where id = g.black_user_id for update;

  v_w_score := case p_result when 'white_win' then 1 when 'draw' then 0.5 else 0 end;
  v_b_score := 1 - v_w_score;

  v_w_exp := 1.0 / (1 + power(10, (pb.elo - pw.elo) / 400.0));
  v_b_exp := 1.0 - v_w_exp;

  v_w_k := case when pw.games_played < 30 then 40 else 20 end;
  v_b_k := case when pb.games_played < 30 then 40 else 20 end;

  v_w_new := round(pw.elo + v_w_k * (v_w_score - v_w_exp));
  v_b_new := round(pb.elo + v_b_k * (v_b_score - v_b_exp));

  update public.multiplayer_games
     set status              = 'completed',
         result              = p_result,
         end_reason          = p_end_reason,
         white_elo_after     = v_w_new,
         black_elo_after     = v_b_new,
         clock_running_since = null,
         draw_offer_by       = null,
         updated_at          = now()
   where id = g.id
   returning * into g;

  perform set_config('app.allow_rating_write', 'on', true);
  update public.profiles
     set elo          = v_w_new,
         games_played = games_played + 1,
         wins         = wins   + (case when p_result = 'white_win' then 1 else 0 end),
         losses       = losses + (case when p_result = 'black_win' then 1 else 0 end),
         draws        = draws  + (case when p_result = 'draw'      then 1 else 0 end)
   where id = pw.id;

  update public.profiles
     set elo          = v_b_new,
         games_played = games_played + 1,
         wins         = wins   + (case when p_result = 'black_win' then 1 else 0 end),
         losses       = losses + (case when p_result = 'white_win' then 1 else 0 end),
         draws        = draws  + (case when p_result = 'draw'      then 1 else 0 end)
   where id = pb.id;
  perform set_config('app.allow_rating_write', 'off', true);

  return g;
end;
$$;

revoke all on function public.finish_mp_game(uuid, text, text) from public, anon, authenticated;
grant execute on function public.finish_mp_game(uuid, text, text) to service_role;
