alter table public.auction_bids
  add column if not exists submitted_seconds_remaining integer;

alter table public.auction_bid_history
  add column if not exists seconds_remaining integer;

create or replace function public.capture_auction_bid_time_remaining()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  auction_ends_at timestamptz;
begin
  select ends_at into auction_ends_at
  from public.auctions
  where id = new.auction_id;

  new.submitted_seconds_remaining := greatest(
    ceil(extract(epoch from (auction_ends_at - now())))::integer,
    0
  );
  return new;
end;
$$;

drop trigger if exists capture_auction_bid_time_remaining on public.auction_bids;
create trigger capture_auction_bid_time_remaining
before insert or update of aav, years
on public.auction_bids
for each row execute function public.capture_auction_bid_time_remaining();

create or replace function public.record_auction_bid_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.auction_bid_history (
    auction_id,
    bid_id,
    fantasy_team_id,
    created_by,
    aav,
    years,
    is_qualifying_bid,
    event_type,
    seconds_remaining
  ) values (
    new.auction_id,
    new.id,
    new.fantasy_team_id,
    new.created_by,
    new.aav,
    new.years,
    new.is_qualifying_bid,
    case when tg_op = 'INSERT' then 'submitted' else 'updated' end,
    new.submitted_seconds_remaining
  );
  return new;
end;
$$;
