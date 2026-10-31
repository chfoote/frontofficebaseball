alter table public.profiles
  add column if not exists is_admin boolean not null default false;

insert into public.profiles (id, email, is_admin)
select id, email, true
from auth.users
where lower(email) = 'charlesfoote13@gmail.com'
on conflict (id) do update
set
  email = excluded.email,
  is_admin = true;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select profiles.is_admin
      from public.profiles
      where profiles.id = auth.uid()
    ),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, false)
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop policy if exists "Users can create their own profile"
  on public.profiles;

drop policy if exists "Users can update their own profile"
  on public.profiles;

drop policy if exists "Authenticated users can update profiles"
  on public.profiles;

drop policy if exists "Users can delete their own profile"
  on public.profiles;

drop policy if exists "Admins can update profiles"
  on public.profiles;

drop policy if exists "Admins can delete profiles"
  on public.profiles;

create policy "Users can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id and is_admin = false);

create policy "Admins can update profiles"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete profiles"
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can create fantasy teams"
  on public.fantasy_teams;

drop policy if exists "Authenticated users can update fantasy teams"
  on public.fantasy_teams;

drop policy if exists "Authenticated users can delete fantasy teams"
  on public.fantasy_teams;

drop policy if exists "Admins can create fantasy teams"
  on public.fantasy_teams;

drop policy if exists "Admins can update fantasy teams"
  on public.fantasy_teams;

drop policy if exists "Admins can delete fantasy teams"
  on public.fantasy_teams;

create policy "Admins can create fantasy teams"
  on public.fantasy_teams
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update fantasy teams"
  on public.fantasy_teams
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete fantasy teams"
  on public.fantasy_teams
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can create players"
  on public.players;

drop policy if exists "Authenticated users can update players"
  on public.players;

drop policy if exists "Authenticated users can delete players"
  on public.players;

drop policy if exists "Admins can create players"
  on public.players;

drop policy if exists "Admins can update players"
  on public.players;

drop policy if exists "Admins can delete players"
  on public.players;

create policy "Admins can create players"
  on public.players
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update players"
  on public.players
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete players"
  on public.players
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can create player seasons"
  on public.player_seasons;

drop policy if exists "Authenticated users can update player seasons"
  on public.player_seasons;

drop policy if exists "Authenticated users can delete player seasons"
  on public.player_seasons;

drop policy if exists "Admins can create player seasons"
  on public.player_seasons;

drop policy if exists "Admins can update player seasons"
  on public.player_seasons;

drop policy if exists "Admins can delete player seasons"
  on public.player_seasons;

create policy "Admins can create player seasons"
  on public.player_seasons
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update player seasons"
  on public.player_seasons
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete player seasons"
  on public.player_seasons
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can read team assignments"
  on public.team_user_assignments;

drop policy if exists "Users can read their own team assignments"
  on public.team_user_assignments;

drop policy if exists "Users can create their own team assignments"
  on public.team_user_assignments;

drop policy if exists "Users can update their own team assignments"
  on public.team_user_assignments;

drop policy if exists "Users can delete their own team assignments"
  on public.team_user_assignments;

drop policy if exists "Authenticated users can create team assignments"
  on public.team_user_assignments;

drop policy if exists "Authenticated users can update team assignments"
  on public.team_user_assignments;

drop policy if exists "Authenticated users can delete team assignments"
  on public.team_user_assignments;

drop policy if exists "Users can read own assignments and admins can read all"
  on public.team_user_assignments;

drop policy if exists "Admins can create team assignments"
  on public.team_user_assignments;

drop policy if exists "Admins can update team assignments"
  on public.team_user_assignments;

drop policy if exists "Admins can delete team assignments"
  on public.team_user_assignments;

create policy "Users can read own assignments and admins can read all"
  on public.team_user_assignments
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

create policy "Admins can create team assignments"
  on public.team_user_assignments
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update team assignments"
  on public.team_user_assignments
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete team assignments"
  on public.team_user_assignments
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can upload team logos"
  on storage.objects;

drop policy if exists "Authenticated users can update team logos"
  on storage.objects;

drop policy if exists "Authenticated users can delete team logos"
  on storage.objects;

drop policy if exists "Admins can upload team logos"
  on storage.objects;

drop policy if exists "Admins can update team logos"
  on storage.objects;

drop policy if exists "Admins can delete team logos"
  on storage.objects;

create policy "Admins can upload team logos"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'team-logos' and public.is_admin());

create policy "Admins can update team logos"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'team-logos' and public.is_admin())
  with check (bucket_id = 'team-logos' and public.is_admin());

create policy "Admins can delete team logos"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'team-logos' and public.is_admin());
