create table public.contract_retentions (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players(id) on delete restrict,
  source_player_season_id bigint references public.player_seasons(id) on delete set null,
  trade_offer_id bigint not null references public.trade_offers(id) on delete restrict,
  retaining_team_id bigint not null references public.fantasy_teams(id) on delete restrict,
  receiving_team_id bigint not null references public.fantasy_teams(id) on delete restrict,
  retention_percentage integer not null default 25 check (retention_percentage = 25),
  original_aav integer not null check (original_aav >= 0),
  annual_retained_amount integer not null check (annual_retained_amount >= 0),
  first_season_year integer not null,
  term_end_year integer not null,
  retention_date date not null,
  notes text,
  status text not null default 'active' check (status in ('active', 'reversed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_retentions_distinct_teams check (retaining_team_id <> receiving_team_id),
  constraint contract_retentions_season_order check (term_end_year >= first_season_year),
  constraint contract_retentions_trade_player_key unique (trade_offer_id, player_id)
);

create table public.retention_cap_adjustments (
  id bigint generated always as identity primary key,
  retention_id bigint not null references public.contract_retentions(id) on delete cascade,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete restrict,
  player_id bigint not null references public.players(id) on delete restrict,
  season_year integer not null,
  adjustment_type text not null check (adjustment_type in ('charge', 'relief')),
  amount integer not null check (amount <> 0),
  created_at timestamptz not null default now(),
  constraint retention_adjustments_sign check (
    (adjustment_type = 'charge' and amount > 0)
    or (adjustment_type = 'relief' and amount < 0)
  ),
  constraint retention_adjustments_entry_key unique (retention_id, fantasy_team_id, season_year, adjustment_type)
);

create index contract_retentions_teams_idx on public.contract_retentions(retaining_team_id, receiving_team_id, retention_date desc);
create index retention_adjustments_team_season_idx on public.retention_cap_adjustments(fantasy_team_id, season_year);
create trigger set_contract_retentions_updated_at before update on public.contract_retentions
  for each row execute function public.set_updated_at();

alter table public.contract_retentions enable row level security;
alter table public.retention_cap_adjustments enable row level security;
create policy "Authenticated users can read retentions" on public.contract_retentions for select to authenticated using (true);
create policy "Admins can manage retentions" on public.contract_retentions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated users can read retention adjustments" on public.retention_cap_adjustments for select to authenticated using (true);
create policy "Admins can manage retention adjustments" on public.retention_cap_adjustments for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.process_contract_retention(
  p_trade_offer_id bigint,
  p_player_season_id bigint,
  p_retention_date date,
  p_first_season_year integer,
  p_notes text default null
)
returns public.contract_retentions
language plpgsql
security definer
set search_path = public
as $$
declare
  source_season public.player_seasons;
  trade_player public.trade_offer_players;
  trade_record public.trade_offers;
  retention_record public.contract_retentions;
  retained_amount integer;
  year_value integer;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  select * into trade_record from public.trade_offers where id = p_trade_offer_id;
  if not found or trade_record.status <> 'completed' then raise exception 'Choose a completed trade.'; end if;
  select * into trade_player from public.trade_offer_players where trade_offer_id = p_trade_offer_id and player_season_id = p_player_season_id;
  if not found then raise exception 'The selected player is not part of that trade.'; end if;
  select * into source_season from public.player_seasons where id = p_player_season_id;
  if not found or source_season.salary is null or source_season.term_end_year is null then raise exception 'The player needs a valid AAV and contract end year.'; end if;
  if p_first_season_year < trade_record.season_year or p_first_season_year > source_season.term_end_year then raise exception 'The first retention season is outside the contract term.'; end if;
  retained_amount := round(source_season.salary * 0.25);
  insert into public.contract_retentions (
    player_id, source_player_season_id, trade_offer_id, retaining_team_id, receiving_team_id,
    original_aav, annual_retained_amount, first_season_year, term_end_year,
    retention_date, notes, created_by
  ) values (
    source_season.player_id, source_season.id, trade_record.id, trade_player.from_team_id, trade_player.to_team_id,
    source_season.salary, retained_amount, p_first_season_year, source_season.term_end_year,
    p_retention_date, nullif(trim(p_notes), ''), auth.uid()
  ) returning * into retention_record;
  for year_value in p_first_season_year..source_season.term_end_year loop
    insert into public.retention_cap_adjustments (retention_id, fantasy_team_id, player_id, season_year, adjustment_type, amount)
    values (retention_record.id, trade_player.from_team_id, source_season.player_id, year_value, 'charge', retained_amount);
    insert into public.retention_cap_adjustments (retention_id, fantasy_team_id, player_id, season_year, adjustment_type, amount)
    values (retention_record.id, trade_player.to_team_id, source_season.player_id, year_value, 'relief', -retained_amount);
  end loop;
  return retention_record;
end;
$$;

grant execute on function public.process_contract_retention(bigint, bigint, date, integer, text) to authenticated;
