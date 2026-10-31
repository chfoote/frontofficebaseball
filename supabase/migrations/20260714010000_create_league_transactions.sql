create table public.league_transactions (
  id bigint generated always as identity primary key,
  player_season_id bigint unique references public.player_seasons(id) on delete set null,
  player_id bigint references public.players(id) on delete set null,
  fantasy_team_id bigint references public.fantasy_teams(id) on delete set null,
  transaction_type text not null default 'signing',
  transaction_date date not null default current_date,
  season_year integer not null,
  salary integer,
  term_end_year integer,
  contract_group text,
  notes text,
  created_at timestamptz not null default now(),
  constraint league_transactions_type_check check (
    transaction_type in ('signing', 'extension', 'trade', 'waiver', 'release')
  ),
  constraint league_transactions_salary_check check (salary is null or salary >= 0),
  constraint league_transactions_term_check check (
    term_end_year is null or term_end_year >= season_year
  )
);

create index league_transactions_date_idx
  on public.league_transactions (transaction_date desc, created_at desc);

alter table public.league_transactions enable row level security;

create policy "League transactions are publicly readable"
  on public.league_transactions for select using (true);

create policy "Admins can create league transactions"
  on public.league_transactions for insert to authenticated
  with check (public.is_admin());

create policy "Admins can update league transactions"
  on public.league_transactions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins can delete league transactions"
  on public.league_transactions for delete to authenticated
  using (public.is_admin());
