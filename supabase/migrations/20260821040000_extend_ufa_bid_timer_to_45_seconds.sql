create or replace function public.extend_ufa_auction_timer_after_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auctions
  set ends_at = now() + interval '45 seconds'
  where id = new.auction_id
    and auction_type = 'ufa'
    and status = 'open'
    and paused_at is null
    and ends_at > now()
    and ends_at < now() + interval '45 seconds';
  return new;
end;
$$;
