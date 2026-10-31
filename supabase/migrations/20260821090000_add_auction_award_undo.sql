alter table public.auctions
  add column pre_award_player_seasons jsonb,
  add column awarded_transaction_id bigint references public.league_transactions(id) on delete set null,
  add column award_undone_at timestamptz,
  add column award_undone_by uuid references public.profiles(id);

create or replace function public.finalize_auction_contract(
  p_auction_id bigint,
  p_bid_id bigint,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions;
  b public.auction_bids;
  nominated_season public.player_seasons;
  first_season_id bigint;
  contract_end_year integer;
  roster_snapshot jsonb;
  transaction_id bigint;
begin
  select * into a from public.auctions where id = p_auction_id;
  select * into b from public.auction_bids where id = p_bid_id and auction_id = p_auction_id;
  select * into nominated_season from public.player_seasons where id = a.player_season_id;
  if a.id is null or b.id is null or nominated_season.id is null then
    raise exception 'The auction contract cannot be completed because its player or winning bid is missing.';
  end if;

  contract_end_year := a.season_year + b.years - 1;
  select coalesce(jsonb_agg(to_jsonb(ps) order by ps.season_year), '[]'::jsonb)
    into roster_snapshot
  from public.player_seasons ps
  where ps.player_id = nominated_season.player_id
    and ps.season_year between a.season_year and contract_end_year;

  insert into public.player_seasons (player_id, season_year, fantasy_team_id, salary, position, term_end_year, contract_group, notes)
  select nominated_season.player_id, contract_year, b.fantasy_team_id, b.aav, a.roster_position,
    contract_end_year, upper(a.auction_type), 'Awarded through Auction #' || a.id
  from generate_series(a.season_year, contract_end_year) as years(contract_year)
  on conflict (player_id, season_year) do update
  set fantasy_team_id = excluded.fantasy_team_id,
      salary = excluded.salary,
      position = excluded.position,
      term_end_year = excluded.term_end_year,
      contract_group = excluded.contract_group,
      notes = excluded.notes;

  select id into first_season_id from public.player_seasons
  where player_id = nominated_season.player_id and season_year = a.season_year;

  insert into public.league_transactions (
    player_season_id, player_id, fantasy_team_id, transaction_type, action,
    transaction_date, season_year, salary, term_end_year, contract_group, position, notes
  ) values (
    first_season_id, nominated_season.player_id, b.fantasy_team_id, 'signing',
    case when p_resolution = 'matched' then 'matched_rfa_offer' else 'signed' end,
    current_date, a.season_year, b.aav, contract_end_year, upper(a.auction_type),
    a.roster_position, 'Auction #' || a.id || ' ' || p_resolution
  ) returning id into transaction_id;

  update public.auctions
  set pre_award_player_seasons = roster_snapshot,
      awarded_transaction_id = transaction_id,
      award_undone_at = null,
      award_undone_by = null
  where id = a.id;
end;
$$;

revoke all on function public.finalize_auction_contract(bigint, bigint, text) from public;

create or replace function public.undo_auction_award(p_auction_id bigint)
returns public.auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions;
  winning_offer public.auction_bids;
  player_id_value bigint;
  contract_end_year integer;
  contract_year integer;
  snapshot_row jsonb;
  restored_first_season_id bigint;
  result public.auctions;
begin
  if not public.is_admin() then raise exception 'Only admins can undo auction results.'; end if;
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'completed' or a.pre_award_player_seasons is null or a.award_undone_at is not null then
    raise exception 'This auction result cannot be undone.';
  end if;
  select * into winning_offer from public.auction_bids where id = a.winning_bid_id;
  select ps.player_id into player_id_value from public.player_seasons ps where ps.id = a.player_season_id;
  if player_id_value is null or winning_offer.id is null then raise exception 'The awarded player or offer is missing.'; end if;
  contract_end_year := a.season_year + winning_offer.years - 1;

  for contract_year in a.season_year..contract_end_year loop
    select value into snapshot_row
    from jsonb_array_elements(a.pre_award_player_seasons)
    where (value ->> 'season_year')::integer = contract_year;

    if snapshot_row is null then
      delete from public.player_seasons
      where player_id = player_id_value and season_year = contract_year;
    else
      insert into public.player_seasons (player_id, season_year, fantasy_team_id, salary, position, term_end_year, contract_group, notes)
      values (
        player_id_value,
        contract_year,
        (snapshot_row ->> 'fantasy_team_id')::bigint,
        (snapshot_row ->> 'salary')::integer,
        snapshot_row ->> 'position',
        (snapshot_row ->> 'term_end_year')::integer,
        snapshot_row ->> 'contract_group',
        snapshot_row ->> 'notes'
      )
      on conflict (player_id, season_year) do update
      set fantasy_team_id = excluded.fantasy_team_id,
          salary = excluded.salary,
          position = excluded.position,
          term_end_year = excluded.term_end_year,
          contract_group = excluded.contract_group,
          notes = excluded.notes;
    end if;
    snapshot_row := null;
  end loop;

  delete from public.league_transactions where id = a.awarded_transaction_id;
  select id into restored_first_season_id from public.player_seasons
  where player_id = player_id_value and season_year = a.season_year;

  update public.auctions
  set player_season_id = restored_first_season_id,
      status = 'cancelled',
      resolution = 'cancelled',
      winning_bid_id = null,
      award_undone_at = now(),
      award_undone_by = auth.uid()
  where id = a.id
  returning * into result;
  return result;
end;
$$;

grant execute on function public.undo_auction_award(bigint) to authenticated;
