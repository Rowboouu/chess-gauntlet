-- Realtime + RLS need REPLICA IDENTITY FULL to deliver UPDATE events.
--
-- Postgres's WAL only includes the columns in the REPLICA IDENTITY when a row
-- changes. With the default (PK only), Supabase Realtime can't evaluate our
-- SELECT policy against the new row (it doesn't know white_user_id /
-- black_user_id / status), so it conservatively drops the event for every
-- subscriber. Setting FULL ships the whole row and policies evaluate
-- correctly — which is what unblocks the "joiner stuck on waiting" symptom.
alter table public.multiplayer_games replica identity full;
