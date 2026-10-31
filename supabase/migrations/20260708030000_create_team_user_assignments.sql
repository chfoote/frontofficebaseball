create table if not exists public.team_user_assignments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  season_year integer not null,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_user_assignments_role_check check (role in ('owner', 'co_owner', 'admin')),
  constraint team_user_assignments_user_season_key unique (user_id, season_year),
  constraint team_user_assignments_team_season_key unique (fantasy_team_id, season_year)
);

create index if not exists team_user_assignments_user_id_idx
  on public.team_user_assignments (user_id);

create index if not exists team_user_assignments_user_email_idx
  on public.team_user_assignments (user_email);

create index if not exists team_user_assignments_fantasy_team_id_idx
  on public.team_user_assignments (fantasy_team_id);

drop trigger if exists set_team_user_assignments_updated_at
  on public.team_user_assignments;

create trigger set_team_user_assignments_updated_at
  before update on public.team_user_assignments
  for each row
  execute function public.set_updated_at();

alter table public.team_user_assignments enable row level security;

create policy "Authenticated users can read team assignments"
  on public.team_user_assignments
  for select
  to authenticated
  using (true);

create policy "Users can create their own team assignments"
  on public.team_user_assignments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and lower(user_email) = lower(auth.jwt() ->> 'email')
  );

create policy "Users can update their own team assignments"
  on public.team_user_assignments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and lower(user_email) = lower(auth.jwt() ->> 'email')
  );

create policy "Users can delete their own team assignments"
  on public.team_user_assignments
  for delete
  to authenticated
  using (auth.uid() = user_id);
