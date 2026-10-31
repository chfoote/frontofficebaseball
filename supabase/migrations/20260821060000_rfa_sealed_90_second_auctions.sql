drop policy if exists "Auction bids follow auction visibility" on public.auction_bids;
create policy "Auction bids follow auction visibility"
on public.auction_bids
for select
to authenticated
using (
  auth.uid() = created_by
  or exists (
    select 1
    from public.auctions a
    where a.id = auction_id
      and (
        (a.auction_type = 'ufa' and a.status in ('open', 'awaiting_match', 'completed', 'cancelled'))
        or (a.auction_type = 'rfa' and a.status in ('awaiting_match', 'completed', 'cancelled'))
        or a.winning_bid_id = auction_bids.id
      )
  )
);

create or replace function public.set_auction_timer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.auction_type = 'ufa'
    and (tg_op = 'INSERT' or old.auction_type is distinct from 'ufa' or (old.status is distinct from 'open' and new.status = 'open')) then
    new.starts_at := now();
    new.ends_at := now() + interval '60 seconds';
  elsif new.auction_type = 'rfa' and new.status = 'open'
    and (tg_op = 'INSERT' or old.auction_type is distinct from 'rfa' or old.status is distinct from 'open') then
    new.starts_at := now();
    new.ends_at := now() + interval '90 seconds';
  end if;
  return new;
end;
$$;

drop trigger if exists set_ufa_auction_timer_before_write on public.auctions;
drop trigger if exists set_auction_timer_before_write on public.auctions;
create trigger set_auction_timer_before_write
before insert or update of auction_type, status on public.auctions
for each row execute function public.set_auction_timer();

create or replace function public.close_auction(p_auction_id bigint)
returns public.auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions;
  winner public.auction_bids;
  result public.auctions;
begin
  if not public.is_admin() then raise exception 'Only admins can close auctions.'; end if;
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'open' then raise exception 'Auction is not open.'; end if;
  if a.auction_type = 'rfa' and now() < a.ends_at then
    raise exception 'Sealed RFA offers cannot be revealed before the timer ends.';
  end if;

  select * into winner
  from public.auction_bids
  where auction_id = a.id
  order by aav desc, years desc, created_at asc
  limit 1;

  if winner.id is null then
    update public.auctions set status = 'cancelled', resolution = 'no_bids'
    where id = a.id returning * into result;
    return result;
  end if;

  if a.auction_type = 'rfa' and a.rights_qualified and winner.fantasy_team_id <> a.rights_team_id then
    update public.auctions set winning_bid_id = winner.id, status = 'awaiting_match'
    where id = a.id returning * into result;
  else
    perform public.finalize_auction_contract(a.id, winner.id, 'won');
    update public.auctions set winning_bid_id = winner.id, status = 'completed', resolution = 'won'
    where id = a.id returning * into result;
  end if;
  return result;
end;
$$;

grant execute on function public.close_auction(bigint) to authenticated;
