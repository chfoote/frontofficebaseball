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
begin
  select * into a from public.auctions where id = p_auction_id;
  select * into b from public.auction_bids where id = p_bid_id and auction_id = p_auction_id;
  select * into nominated_season from public.player_seasons where id = a.player_season_id;

  if a.id is null or b.id is null or nominated_season.id is null then
    raise exception 'The auction contract cannot be completed because its player or winning bid is missing.';
  end if;

  contract_end_year := a.season_year + b.years - 1;

  insert into public.player_seasons (
    player_id,
    season_year,
    fantasy_team_id,
    salary,
    position,
    term_end_year,
    contract_group,
    notes
  )
  select
    nominated_season.player_id,
    contract_year,
    b.fantasy_team_id,
    b.aav,
    a.roster_position,
    contract_end_year,
    upper(a.auction_type),
    'Awarded through Auction #' || a.id
  from generate_series(a.season_year, contract_end_year) as years(contract_year)
  on conflict (player_id, season_year) do update
  set fantasy_team_id = excluded.fantasy_team_id,
      salary = excluded.salary,
      position = excluded.position,
      term_end_year = excluded.term_end_year,
      contract_group = excluded.contract_group,
      notes = excluded.notes;

  select id into first_season_id
  from public.player_seasons
  where player_id = nominated_season.player_id
    and season_year = a.season_year;

  insert into public.league_transactions (
    player_season_id,
    player_id,
    fantasy_team_id,
    transaction_type,
    action,
    transaction_date,
    season_year,
    salary,
    term_end_year,
    contract_group,
    position,
    notes
  )
  values (
    first_season_id,
    nominated_season.player_id,
    b.fantasy_team_id,
    'signing',
    case when p_resolution = 'matched' then 'matched_rfa_offer' else 'signed' end,
    current_date,
    a.season_year,
    b.aav,
    contract_end_year,
    upper(a.auction_type),
    a.roster_position,
    'Auction #' || a.id || ' ' || p_resolution
  );
end;
$$;

revoke all on function public.finalize_auction_contract(bigint, bigint, text) from public;
