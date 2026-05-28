-- Allow a user to delete their own in-progress game (the "Quit without saving"
-- option). Completed games are kept as a permanent record and can't be deleted.

drop policy if exists "users delete own in-progress games" on public.games;
create policy "users delete own in-progress games"
  on public.games for delete
  using (auth.uid() = user_id and status = 'in_progress');
