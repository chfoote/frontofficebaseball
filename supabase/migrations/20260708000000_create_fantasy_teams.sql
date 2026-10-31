create table if not exists public.fantasy_teams (
  id bigint generated always as identity primary key,
  team_name text not null,
  abbreviation text not null,
  logo text,
  primary_color text,
  secondary_color text,
  manager_name text,
  manager_since date,
  al_farm_system text,
  nl_farm_system text,
  championships integer not null default 0,
  runner_up_finishes integer not null default 0,
  third_place_finishes integer not null default 0,
  created_date date not null default current_date,
  active boolean not null default true,
  notes text,
  constraint fantasy_teams_abbreviation_key unique (abbreviation)
);

comment on table public.fantasy_teams is 'Fantasy baseball teams for the Off-Speed league.';
comment on column public.fantasy_teams.logo is 'Logo URL or asset path.';
comment on column public.fantasy_teams.primary_color is 'Primary team color, preferably a hex value such as #0f172a.';
comment on column public.fantasy_teams.secondary_color is 'Secondary team color, preferably a hex value such as #f8fafc.';
comment on column public.fantasy_teams.al_farm_system is 'American League MLB organization used as this fantasy team farm system.';
comment on column public.fantasy_teams.nl_farm_system is 'National League MLB organization used as this fantasy team farm system.';
comment on column public.fantasy_teams.championships is 'Number of league championships won.';
comment on column public.fantasy_teams.runner_up_finishes is 'Number of second-place league finishes.';
comment on column public.fantasy_teams.third_place_finishes is 'Number of third-place league finishes.';

alter table public.fantasy_teams enable row level security;

create policy "Fantasy teams are publicly readable"
  on public.fantasy_teams
  for select
  using (true);

create policy "Authenticated users can create fantasy teams"
  on public.fantasy_teams
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update fantasy teams"
  on public.fantasy_teams
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete fantasy teams"
  on public.fantasy_teams
  for delete
  to authenticated
  using (true);

insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do nothing;

create policy "Team logos are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'team-logos');

create policy "Authenticated users can upload team logos"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'team-logos');

create policy "Authenticated users can update team logos"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'team-logos')
  with check (bucket_id = 'team-logos');

create policy "Authenticated users can delete team logos"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'team-logos');
