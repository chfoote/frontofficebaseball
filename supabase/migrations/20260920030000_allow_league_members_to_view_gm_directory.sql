drop policy if exists "Users can read own assignments and admins can read all"
  on public.team_user_assignments;

drop policy if exists "Authenticated users can read team assignments"
  on public.team_user_assignments;

create policy "Authenticated users can read team assignments"
  on public.team_user_assignments
  for select
  to authenticated
  using (true);

comment on table public.team_user_assignments is
  'Team ownership by season. Authenticated league members may read assignments for the GM directory; writes remain admin-only.';
