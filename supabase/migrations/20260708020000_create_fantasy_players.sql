create table if not exists public.players (
  id bigint generated always as identity primary key,
  player_api_id text unique not null,
  first_name text,
  last_name text,
  full_name text,
  on_trade_block boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_seasons (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players(id) on delete cascade,
  season_year integer not null,
  fantasy_team_id bigint references public.fantasy_teams(id) on delete set null,
  salary integer,
  position text,
  term_end_year integer,
  contract_group text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_seasons_player_id_season_year_key unique (player_id, season_year),
  constraint player_seasons_salary_nonnegative check (salary is null or salary >= 0)
);

create index if not exists players_player_api_id_idx
  on public.players (player_api_id);

create index if not exists player_seasons_season_year_idx
  on public.player_seasons (season_year);

create index if not exists player_seasons_fantasy_team_id_idx
  on public.player_seasons (fantasy_team_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_players_updated_at on public.players;
create trigger set_players_updated_at
  before update on public.players
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_player_seasons_updated_at on public.player_seasons;
create trigger set_player_seasons_updated_at
  before update on public.player_seasons
  for each row
  execute function public.set_updated_at();

alter table public.players enable row level security;
alter table public.player_seasons enable row level security;

create policy "Players are publicly readable"
  on public.players
  for select
  using (true);

create policy "Authenticated users can create players"
  on public.players
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update players"
  on public.players
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete players"
  on public.players
  for delete
  to authenticated
  using (true);

create policy "Active player seasons are publicly readable"
  on public.player_seasons
  for select
  using (
    fantasy_team_id is null
    or exists (
      select 1
      from public.fantasy_teams
      where fantasy_teams.id = player_seasons.fantasy_team_id
        and fantasy_teams.active = true
    )
  );

create policy "Authenticated users can create player seasons"
  on public.player_seasons
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update player seasons"
  on public.player_seasons
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete player seasons"
  on public.player_seasons
  for delete
  to authenticated
  using (true);
