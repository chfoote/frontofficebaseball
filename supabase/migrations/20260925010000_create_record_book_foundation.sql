create table if not exists public.daily_player_performances (
  id bigint generated always as identity primary key,
  performance_date date not null,
  season_year integer not null,
  player_id bigint not null references public.players(id) on delete cascade,
  player_season_id bigint references public.player_seasons(id) on delete set null,
  fantasy_team_id bigint references public.fantasy_teams(id) on delete set null,
  player_name text not null,
  position text,
  leadership_role text check (leadership_role in ('C', 'A')),
  games_played integer not null default 0,
  goals integer not null default 0,
  assists integer not null default 0,
  wins integer not null default 0,
  saves integer not null default 0,
  shutouts integer not null default 0,
  fantasy_points numeric not null default 0,
  stat_payload jsonb not null default '{}'::jsonb,
  verification_status text not null default 'verified' check (verification_status in ('provisional', 'verified', 'backfilled', 'corrected')),
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_player_performance_key unique (performance_date, player_id, fantasy_team_id)
);

create table if not exists public.daily_team_performances (
  id bigint generated always as identity primary key,
  performance_date date not null,
  season_year integer not null,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  fantasy_points numeric not null default 0,
  active_players integer not null default 0,
  verification_status text not null default 'verified' check (verification_status in ('provisional', 'verified', 'backfilled', 'corrected')),
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_team_performance_key unique (performance_date, fantasy_team_id)
);

create table if not exists public.record_history (
  id bigint generated always as identity primary key,
  record_key text not null,
  scope text not null check (scope in ('league', 'franchise')),
  fantasy_team_id bigint references public.fantasy_teams(id) on delete cascade,
  season_year integer,
  holder_type text not null check (holder_type in ('team', 'player', 'manager')),
  player_id bigint references public.players(id) on delete set null,
  holder_name text not null,
  record_value numeric not null,
  previous_value numeric,
  period_start date,
  period_end date,
  verification_status text not null default 'verified' check (verification_status in ('provisional', 'verified', 'backfilled', 'corrected')),
  metadata jsonb not null default '{}'::jsonb,
  achieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint record_history_event_key unique (record_key, scope, fantasy_team_id, holder_type, holder_name, record_value, period_start, period_end)
);

create table if not exists public.milestone_events (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  event_type text not null,
  season_year integer,
  fantasy_team_id bigint references public.fantasy_teams(id) on delete cascade,
  player_id bigint references public.players(id) on delete set null,
  title text not null,
  body text not null,
  event_date date not null,
  status text not null default 'published' check (status in ('provisional', 'published', 'superseded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists daily_player_performances_date_idx on public.daily_player_performances(performance_date desc, fantasy_team_id);
create index if not exists daily_team_performances_score_idx on public.daily_team_performances(fantasy_points desc, performance_date desc);
create index if not exists record_history_lookup_idx on public.record_history(scope, fantasy_team_id, record_key, record_value desc);
create index if not exists milestone_events_date_idx on public.milestone_events(event_date desc, created_at desc);

alter table public.daily_player_performances enable row level security;
alter table public.daily_team_performances enable row level security;
alter table public.record_history enable row level security;
alter table public.milestone_events enable row level security;

create policy "Daily player performances are publicly readable" on public.daily_player_performances for select using (true);
create policy "Daily team performances are publicly readable" on public.daily_team_performances for select using (true);
create policy "Record history is publicly readable" on public.record_history for select using (true);
create policy "Milestone events are publicly readable" on public.milestone_events for select using (true);

create policy "Admins manage daily player performances" on public.daily_player_performances for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage daily team performances" on public.daily_team_performances for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage record history" on public.record_history for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage milestone events" on public.milestone_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

