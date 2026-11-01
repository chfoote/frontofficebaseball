-- Standardize the Front Office Baseball minimum contract at $250,000.

alter table public.auctions
  alter column minimum_aav set default 250000;

alter table public.auctions
  drop constraint if exists auctions_minimum_aav_check;

alter table public.auctions
  add constraint auctions_minimum_aav_check check (minimum_aav >= 250000) not valid;

alter table public.auctions validate constraint auctions_minimum_aav_check;

update public.auctions
set minimum_aav = 250000
where status = 'open'
  and minimum_aav in (500000, 750000);

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.place_auction_bid(bigint,integer,integer)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'coalesce(a.qualifying_aav, 500000)',
    'coalesce(a.qualifying_aav, 250000)'
  );

  execute function_definition;
end;
$$;
