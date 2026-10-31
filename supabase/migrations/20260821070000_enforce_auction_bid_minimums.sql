alter table public.auctions
  add column minimum_aav integer not null default 500000
    check (minimum_aav >= 500000),
  add column bid_increment integer not null default 25000
    check (bid_increment > 0);

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
begin
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'open' or now() >= a.ends_at then
    raise exception 'Bidding is not open.';
  end if;
  if p_years < 1 or p_years > 10 then
    raise exception 'Enter a contract term between 1 and 10 years.';
  end if;
  if p_aav < a.minimum_aav then
    raise exception 'The minimum opening bid is $%.', trim(to_char(a.minimum_aav, 'FM999,999,999'));
  end if;
  if mod(p_aav - a.minimum_aav, a.bid_increment) <> 0 then
    raise exception 'Bid amounts must use $% increments.', trim(to_char(a.bid_increment, 'FM999,999,999'));
  end if;

  select fantasy_team_id into team_id
  from public.team_user_assignments
  where user_id = auth.uid()
  order by (season_year = a.season_year) desc, season_year desc
  limit 1;
  if team_id is null then raise exception 'Your account is not assigned to a team.'; end if;

  if a.auction_type = 'ufa' then
    select * into high_bid
    from public.auction_bids
    where auction_id = a.id
    order by aav desc, years desc, created_at asc
    limit 1;
    if high_bid.id is not null and p_aav < high_bid.aav + a.bid_increment then
      raise exception 'The next open bid must be at least $%.', trim(to_char(high_bid.aav + a.bid_increment, 'FM999,999,999'));
    end if;
  end if;

  insert into public.auction_bids (auction_id, fantasy_team_id, created_by, aav, years)
  values (a.id, team_id, auth.uid(), p_aav, p_years)
  on conflict (auction_id, fantasy_team_id) do update
    set aav = excluded.aav,
        years = excluded.years,
        created_by = excluded.created_by,
        is_qualifying_bid = false
  returning * into result;
  return result;
end;
$$;

grant execute on function public.place_auction_bid(bigint, integer, integer) to authenticated;
