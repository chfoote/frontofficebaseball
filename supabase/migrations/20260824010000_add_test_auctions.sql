alter table public.auctions
  add column if not exists is_test boolean not null default false;

comment on column public.auctions.is_test is
  'When true, the auction exercises the complete bidding workflow but never awards a contract or posts a league transaction.';

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

  if a.id is null or b.id is null then
    raise exception 'The auction contract cannot be completed because its auction or winning bid is missing.';
  end if;

  -- Test auctions intentionally stop after determining the winner. This protects
  -- player seasons, rosters, contracts, league transactions, chat, and Discord.
  if a.is_test then
    return;
  end if;

  select * into nominated_season from public.player_seasons where id = a.player_season_id;
  if nominated_season.id is null then
    raise exception 'The auction contract cannot be completed because its player is missing.';
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

