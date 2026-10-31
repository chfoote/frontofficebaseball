alter table public.fantasy_teams
  rename column al_farm_system to eastern_farm_system;

alter table public.fantasy_teams
  rename column nl_farm_system to western_farm_system;

comment on column public.fantasy_teams.eastern_farm_system is
  'Eastern Conference NHL organization used as this fantasy team farm system.';
comment on column public.fantasy_teams.western_farm_system is
  'Western Conference NHL organization used as this fantasy team farm system.';

create table public.fantasy_team_manager_tenures (
  id bigint generated always as identity primary key,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  manager_name text not null,
  start_season integer not null,
  end_season integer,
  created_at timestamptz not null default now(),
  constraint fantasy_team_manager_tenures_name_check check (length(trim(manager_name)) > 0),
  constraint fantasy_team_manager_tenures_seasons_check check (
    end_season is null or end_season >= start_season
  ),
  constraint fantasy_team_manager_tenures_team_start_key unique (fantasy_team_id, start_season)
);

create index fantasy_team_manager_tenures_team_season_idx
  on public.fantasy_team_manager_tenures (fantasy_team_id, start_season desc);

alter table public.fantasy_team_manager_tenures enable row level security;

create policy "Team manager tenures are publicly readable"
  on public.fantasy_team_manager_tenures for select using (true);

create policy "Admins can create team manager tenures"
  on public.fantasy_team_manager_tenures for insert to authenticated
  with check (public.is_admin());

create policy "Admins can update team manager tenures"
  on public.fantasy_team_manager_tenures for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins can delete team manager tenures"
  on public.fantasy_team_manager_tenures for delete to authenticated
  using (public.is_admin());

insert into public.fantasy_team_manager_tenures (
  fantasy_team_id,
  manager_name,
  start_season
)
select
  id,
  manager_name,
  greatest(extract(year from coalesce(manager_since, created_date))::integer, 2026)
from public.fantasy_teams
where manager_name is not null and trim(manager_name) <> ''
on conflict (fantasy_team_id, start_season) do nothing;
