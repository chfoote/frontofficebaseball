create or replace function public.set_ufa_auction_timer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.auction_type = 'ufa'
    and (tg_op = 'INSERT' or old.auction_type is distinct from 'ufa') then
    new.starts_at := now();
    new.ends_at := now() + interval '60 seconds';
  end if;
  return new;
end;
$$;

create trigger set_ufa_auction_timer_before_write
  before insert or update of auction_type on public.auctions
  for each row execute function public.set_ufa_auction_timer();

create or replace function public.extend_ufa_auction_timer_after_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auctions
  set ends_at = now() + interval '30 seconds'
  where id = new.auction_id
    and auction_type = 'ufa'
    and status = 'open'
    and ends_at > now()
    and ends_at < now() + interval '30 seconds';
  return new;
end;
$$;

create trigger extend_ufa_timer_after_bid
  after insert or update of aav, years on public.auction_bids
  for each row execute function public.extend_ufa_auction_timer_after_bid();
