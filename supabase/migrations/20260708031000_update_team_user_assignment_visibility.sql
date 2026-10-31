alter table public.team_user_assignments
  add column if not exists user_email text;

create index if not exists team_user_assignments_user_email_idx
  on public.team_user_assignments (user_email);

drop policy if exists "Users can read their own team assignments"
  on public.team_user_assignments;

drop policy if exists "Authenticated users can read team assignments"
  on public.team_user_assignments;

create policy "Authenticated users can read team assignments"
  on public.team_user_assignments
  for select
  to authenticated
  using (true);

drop policy if exists "Users can create their own team assignments"
  on public.team_user_assignments;

create policy "Users can create their own team assignments"
  on public.team_user_assignments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      user_email is null
      or lower(user_email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "Users can update their own team assignments"
  on public.team_user_assignments;

create policy "Users can update their own team assignments"
  on public.team_user_assignments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      user_email is null
      or lower(user_email) = lower(auth.jwt() ->> 'email')
    )
  );
