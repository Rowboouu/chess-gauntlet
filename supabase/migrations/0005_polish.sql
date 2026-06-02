-- Polish pass: rate limiting on write endpoints, and spectator visibility on
-- multiplayer games.

-- ─────────────────────────────────────────────────────────────────────────
-- Rate limits: a tiny event log we count against per (user, bucket, window).
-- The API layer calls public.check_rate_limit(...) before mutating; if it
-- returns false, the route responds 429. Skipped for the hot mp-move path
-- (game-turn validation already constrains abuse there).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  bucket     text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limits_lookup_idx
  on public.rate_limits (user_id, bucket, created_at desc);

alter table public.rate_limits enable row level security;
-- No client-facing policies — this table is only touched by SECURITY DEFINER
-- functions running as the service role.

create or replace function public.check_rate_limit(
  p_user_id   uuid,
  p_bucket    text,
  p_limit     integer,
  p_window_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.rate_limits
  where user_id    = p_user_id
    and bucket     = p_bucket
    and created_at > now() - (p_window_ms || ' milliseconds')::interval;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limits (user_id, bucket) values (p_user_id, p_bucket);
  return true;
end;
$$;

-- Periodic best-effort cleanup of ancient rows so the table stays small.
-- Anything older than 1 day can never affect a check.
create or replace function public.prune_rate_limits() returns void
language sql security definer set search_path = public as $$
  delete from public.rate_limits where created_at < now() - interval '1 day';
$$;

-- Lock down: only the server (service_role) calls these.
revoke all on function public.check_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer)
  to service_role;
revoke all on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Spectator mode: anyone signed in can SELECT a multiplayer game by id (the
-- URL is the invite/share token — game ids are UUIDs, unguessable). Writes
-- are still blocked by the absent UPDATE/DELETE policies; only the server's
-- service-role API routes mutate.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "mp participants and waiting visible" on public.multiplayer_games;
create policy "mp games are readable by anyone authenticated"
  on public.multiplayer_games for select
  to authenticated
  using (true);
