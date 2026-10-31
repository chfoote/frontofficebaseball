create table if not exists public.monthly_player_honours (
  id bigint generated always as identity primary key,
  season_year integer not null,
  month_index smallint not null check (month_index between 0 and 6),
  category text not null check (category in ('forward', 'defenceman', 'goalie')),
  player_id bigint not null references public.players(id) on delete cascade,
  fantasy_team_id bigint references public.fantasy_teams(id) on delete set null,
  games_played integer not null default 0 check (games_played >= 0),
  fantasy_points numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_player_honours_period_category_key unique (season_year, month_index, category)
);

create index if not exists monthly_player_honours_player_idx
  on public.monthly_player_honours (player_id, season_year desc, month_index desc);

alter table public.monthly_player_honours enable row level security;

create policy "Monthly player honours are publicly readable"
  on public.monthly_player_honours for select using (true);

create policy "Admins can create monthly player honours"
  on public.monthly_player_honours for insert to authenticated
  with check (public.is_admin());

create policy "Admins can update monthly player honours"
  on public.monthly_player_honours for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins can delete monthly player honours"
  on public.monthly_player_honours for delete to authenticated
  using (public.is_admin());
