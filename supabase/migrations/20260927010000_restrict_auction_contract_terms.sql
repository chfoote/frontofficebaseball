-- Season 2 auction contracts may be 1, 2, 3, or 5 years. Historical
-- four-year bids remain readable, but all new or updated bids are restricted.
alter table public.auction_bids
  drop constraint if exists auction_bids_allowed_contract_terms;

alter table public.auction_bids
  add constraint auction_bids_allowed_contract_terms
  check (years in (1, 2, 3, 5)) not valid;

create or replace function public.place_auction_bid(
  p_auction_id bigint,
  p_aav integer,
  p_years integer
)
returns public.auction_bids
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions;
  team_id bigint;
  result public.auction_bids;
  high_bid public.auction_bids;
  team_minimum integer;
  offered_total bigint;
  high_total bigint;
begin
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'open' or now() >= a.ends_at then
    raise exception 'Bidding is not open.';
  end if;
  if p_years not in (1, 2, 3, 5) then
    raise exception 'Choose a 1, 2, 3, or 5-year contract. Four-year contracts are not permitted.';
  end if;

  select fantasy_team_id into team_id
  from public.team_user_assignments
  where user_id = auth.uid()
  order by (season_year = a.season_year) desc, season_year desc
  limit 1;
  if team_id is null then raise exception 'Your account is not assigned to a team.'; end if;

  team_minimum := a.minimum_aav;
  if a.auction_type = 'rfa' and team_id = a.rights_team_id then
    team_minimum := greatest(team_minimum, coalesce(a.qualifying_aav, 500000));
  end if;

  if p_aav < team_minimum then
    raise exception 'Your minimum offer is $%.', trim(to_char(team_minimum, 'FM999,999,999'));
  end if;
  if a.auction_type = 'ufa' and mod(p_aav - a.minimum_aav, a.bid_increment) <> 0 then
    raise exception 'Bid amounts must use $% increments.', trim(to_char(a.bid_increment, 'FM999,999,999'));
  end if;

  if a.auction_type = 'ufa' then
    select * into high_bid
    from public.auction_bids
    where auction_id = a.id
    order by (aav::bigint * years) desc, years asc, created_at asc
    limit 1;

    offered_total := p_aav::bigint * p_years;
    high_total := high_bid.aav::bigint * high_bid.years;
    if high_bid.id is not null and (
      offered_total < high_total
      or (offered_total = high_total and p_years >= high_bid.years)
    ) then
      raise exception 'Your contract must beat the current $% total value. An equal total only wins with a shorter term.',
        trim(to_char(high_total, 'FM999,999,999'));
    end if;
  end if;

  insert into public.auction_bids (auction_id, fantasy_team_id, created_by, aav, years)
  values (a.id, team_id, auth.uid(), p_aav, p_years)
  on conflict (auction_id, fantasy_team_id) do update
    set aav = excluded.aav,
        years = excluded.years,
        created_by = excluded.created_by,
        is_qualifying_bid = false,
        created_at = now()
  returning * into result;
  return result;
end;
$$;

grant execute on function public.place_auction_bid(bigint, integer, integer) to authenticated;
