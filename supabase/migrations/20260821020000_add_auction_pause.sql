alter table public.auctions
  add column paused_at timestamptz,
  add column paused_seconds_remaining integer check (paused_seconds_remaining is null or paused_seconds_remaining >= 0);

create or replace function public.reject_bid_while_auction_paused()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.auctions where id = new.auction_id and paused_at is not null) then
    raise exception 'The auction timer is paused. Bidding is temporarily unavailable.';
  end if;
  return new;
end;
$$;

create trigger reject_bid_during_auction_pause
  before insert or update of aav, years on public.auction_bids
  for each row execute function public.reject_bid_while_auction_paused();

create or replace function public.set_auction_paused(p_auction_id bigint, p_paused boolean)
returns public.auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions;
  result public.auctions;
  remaining integer;
begin
  if not public.is_admin() then raise exception 'Only admins can pause auctions.'; end if;
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'open' then raise exception 'Only an open auction can be paused.'; end if;

  if p_paused then
    if a.paused_at is not null then return a; end if;
    remaining := greatest(ceil(extract(epoch from (a.ends_at - now())))::integer, 0);
    update public.auctions set paused_at = now(), paused_seconds_remaining = remaining where id = a.id returning * into result;
  else
    if a.paused_at is null then return a; end if;
    update public.auctions
      set ends_at = now() + make_interval(secs => coalesce(a.paused_seconds_remaining, 0)),
          paused_at = null,
          paused_seconds_remaining = null
      where id = a.id returning * into result;
  end if;
  return result;
end;
$$;
grant execute on function public.set_auction_paused(bigint, boolean) to authenticated;

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
    and paused_at is null
    and ends_at > now()
    and ends_at < now() + interval '30 seconds';
  return new;
end;
$$;
