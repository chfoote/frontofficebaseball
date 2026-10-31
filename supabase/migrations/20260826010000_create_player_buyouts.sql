create table public.player_buyouts (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players(id) on delete restrict,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete restrict,
  source_player_season_id bigint references public.player_seasons(id) on delete set null,
  transaction_id bigint references public.league_transactions(id) on delete set null,
  buyout_date date not null,
  contract_season_year integer not null,
  original_aav integer not null check (original_aav >= 0),
  original_term_end_year integer not null,
  free_agent_season integer not null,
  notes text,
  status text not null default 'active' check (status in ('active', 'reversed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_buyouts_season_order check (
    original_term_end_year >= contract_season_year
    and free_agent_season >= contract_season_year
  )
);

create table public.buyout_cap_penalties (
  id bigint generated always as identity primary key,
  buyout_id bigint not null references public.player_buyouts(id) on delete cascade,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete restrict,
  player_id bigint not null references public.players(id) on delete restrict,
  season_year integer not null,
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now(),
  constraint buyout_cap_penalties_buyout_season_key unique (buyout_id, season_year)
);

create index player_buyouts_team_idx on public.player_buyouts(fantasy_team_id, buyout_date desc);
create index buyout_cap_penalties_team_season_idx on public.buyout_cap_penalties(fantasy_team_id, season_year);
create trigger set_player_buyouts_updated_at before update on public.player_buyouts
  for each row execute function public.set_updated_at();

alter table public.player_buyouts enable row level security;
alter table public.buyout_cap_penalties enable row level security;

create policy "Authenticated users can read buyouts" on public.player_buyouts
  for select to authenticated using (true);
create policy "Admins can manage buyouts" on public.player_buyouts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated users can read buyout penalties" on public.buyout_cap_penalties
  for select to authenticated using (true);
create policy "Admins can manage buyout penalties" on public.buyout_cap_penalties
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.process_player_buyout(
  p_player_season_id bigint,
  p_buyout_date date,
  p_free_agent_season integer,
  p_penalties jsonb,
  p_notes text default null
)
returns public.player_buyouts
language plpgsql
security definer
set search_path = public
as $$
declare
  source_season public.player_seasons;
  buyout_record public.player_buyouts;
  penalty jsonb;
  transaction_id_value bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;

  select * into source_season from public.player_seasons
  where id = p_player_season_id for update;
  if not found or source_season.fantasy_team_id is null then
    raise exception 'Choose a player who is currently assigned to a team.';
  end if;
  if source_season.salary is null or source_season.term_end_year is null then
    raise exception 'The selected player needs an AAV and contract end year.';
  end if;
  if p_free_agent_season < source_season.season_year then
    raise exception 'The free-agent season cannot precede the selected contract season.';
  end if;
  if jsonb_typeof(p_penalties) <> 'array' or jsonb_array_length(p_penalties) = 0 then
    raise exception 'Enter at least one season penalty.';
  end if;
  if exists (
    select 1 from public.player_seasons
    where player_id = source_season.player_id
      and season_year >= p_free_agent_season
      and fantasy_team_id is not null
      and fantasy_team_id <> source_season.fantasy_team_id
  ) then
    raise exception 'A future player season is already assigned to another team. Review that record before processing this buyout.';
  end if;

  insert into public.player_buyouts (
    player_id, fantasy_team_id, source_player_season_id, buyout_date,
    contract_season_year, original_aav, original_term_end_year,
    free_agent_season, notes, created_by
  ) values (
    source_season.player_id, source_season.fantasy_team_id, source_season.id,
    p_buyout_date, source_season.season_year, source_season.salary,
    source_season.term_end_year, p_free_agent_season, nullif(trim(p_notes), ''), auth.uid()
  ) returning * into buyout_record;

  for penalty in select value from jsonb_array_elements(p_penalties)
  loop
    if coalesce((penalty->>'season_year')::integer, 0) < source_season.season_year
       or coalesce((penalty->>'amount')::integer, -1) < 0 then
      raise exception 'Each penalty needs a valid season and non-negative amount.';
    end if;
    insert into public.buyout_cap_penalties (
      buyout_id, fantasy_team_id, player_id, season_year, amount
    ) values (
      buyout_record.id, source_season.fantasy_team_id, source_season.player_id,
      (penalty->>'season_year')::integer, (penalty->>'amount')::integer
    );
  end loop;

  update public.player_seasons
  set fantasy_team_id = null,
      salary = null,
      term_end_year = null,
      contract_group = 'UFA',
      notes = concat_ws(' ', nullif(notes, ''), 'Released following buyout #' || buyout_record.id || '.')
  where player_id = source_season.player_id
    and fantasy_team_id = source_season.fantasy_team_id
    and season_year >= p_free_agent_season;

  insert into public.player_seasons (
    player_id, season_year, fantasy_team_id, salary, position,
    term_end_year, contract_group, notes
  ) values (
    source_season.player_id, p_free_agent_season, null, null, source_season.position,
    null, 'UFA', 'Available following buyout #' || buyout_record.id || '.'
  ) on conflict (player_id, season_year) do update
    set fantasy_team_id = null,
        salary = null,
        term_end_year = null,
        contract_group = 'UFA',
        notes = concat_ws(' ', nullif(public.player_seasons.notes, ''), 'Available following buyout #' || buyout_record.id || '.');

  insert into public.league_transactions (
    player_season_id, player_id, fantasy_team_id, transaction_type, action,
    transaction_date, season_year, salary, term_end_year, contract_group,
    position, notes
  ) values (
    source_season.id, source_season.player_id, source_season.fantasy_team_id,
    'release', 'bought_out', p_buyout_date, source_season.season_year,
    source_season.salary, source_season.term_end_year, source_season.contract_group,
    source_season.position, nullif(trim(p_notes), '')
  ) returning id into transaction_id_value;

  update public.player_buyouts set transaction_id = transaction_id_value
  where id = buyout_record.id returning * into buyout_record;
  return buyout_record;
end;
$$;

grant execute on function public.process_player_buyout(bigint, date, integer, jsonb, text) to authenticated;
