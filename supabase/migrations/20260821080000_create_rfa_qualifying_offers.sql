drop policy if exists "Auction bids follow auction visibility" on public.auction_bids;
create policy "Auction bids follow auction visibility"
on public.auction_bids
for select
to authenticated
using (
  auth.uid() = created_by
  or exists (
    select 1
    from public.auctions own_auction
    where own_auction.id = auction_id
      and public.user_controls_team(auction_bids.fantasy_team_id, own_auction.season_year)
  )
  or exists (
    select 1
    from public.auctions visible_auction
    where visible_auction.id = auction_id
      and (
        (visible_auction.auction_type = 'ufa' and visible_auction.status in ('open', 'awaiting_match', 'completed', 'cancelled'))
        or (visible_auction.auction_type = 'rfa' and visible_auction.status in ('awaiting_match', 'completed', 'cancelled'))
        or visible_auction.winning_bid_id = auction_bids.id
      )
  )
);

create or replace function public.create_rfa_qualifying_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auction_type = 'rfa'
    and new.rights_qualified
    and new.rights_team_id is not null
    and new.qualifying_aav is not null then
    insert into public.auction_bids (
      auction_id,
      fantasy_team_id,
      created_by,
      aav,
      years,
      is_qualifying_bid
    ) values (
      new.id,
      new.rights_team_id,
      new.nominated_by,
      new.qualifying_aav,
      1,
      true
    )
    on conflict (auction_id, fantasy_team_id) do update
      set aav = excluded.aav,
          years = 1,
          created_by = excluded.created_by,
          is_qualifying_bid = true;
  end if;
  return new;
end;
$$;

drop trigger if exists create_rfa_qualifying_offer_after_insert on public.auctions;
create trigger create_rfa_qualifying_offer_after_insert
after insert on public.auctions
for each row execute function public.create_rfa_qualifying_offer();

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
begin
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'open' or now() >= a.ends_at then
    raise exception 'Bidding is not open.';
  end if;
  if p_years < 1 or p_years > 10 then
    raise exception 'Enter a contract term between 1 and 10 years.';
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
