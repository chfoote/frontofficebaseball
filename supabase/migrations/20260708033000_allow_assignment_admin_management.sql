drop policy if exists "Users can create their own team assignments"
  on public.team_user_assignments;

drop policy if exists "Users can update their own team assignments"
  on public.team_user_assignments;

drop policy if exists "Users can delete their own team assignments"
  on public.team_user_assignments;

create policy "Authenticated users can create team assignments"
  on public.team_user_assignments
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update team assignments"
  on public.team_user_assignments
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete team assignments"
  on public.team_user_assignments
  for delete
  to authenticated
  using (true);
