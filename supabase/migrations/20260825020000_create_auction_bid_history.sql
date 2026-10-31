create table public.auction_bid_history (
  id bigint generated always as identity primary key,
  auction_id bigint not null references public.auctions(id) on delete cascade,
  bid_id bigint references public.auction_bids(id) on delete set null,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  aav integer not null check (aav > 0),
  years integer not null check (years between 1 and 10),
  total_value bigint generated always as (aav::bigint * years) stored,
  is_qualifying_bid boolean not null default false,
  event_type text not null check (event_type in ('submitted', 'updated', 'backfilled')),
  recorded_at timestamptz not null default now()
);

create index auction_bid_history_auction_time_idx
  on public.auction_bid_history(auction_id, recorded_at, id);

alter table public.auction_bid_history enable row level security;

create policy "Admins can read auction bid history"
  on public.auction_bid_history
  for select
  to authenticated
  using (public.is_admin());

insert into public.auction_bid_history (
  auction_id,
  bid_id,
  fantasy_team_id,
  created_by,
  aav,
  years,
  is_qualifying_bid,
  event_type,
  recorded_at
)
select
  auction_id,
  id,
  fantasy_team_id,
  created_by,
  aav,
  years,
  is_qualifying_bid,
  'backfilled',
  created_at
from public.auction_bids;

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
    event_type
  ) values (
    new.auction_id,
    new.id,
    new.fantasy_team_id,
    new.created_by,
    new.aav,
    new.years,
    new.is_qualifying_bid,
    case when tg_op = 'INSERT' then 'submitted' else 'updated' end
  );
  return new;
end;
$$;

create trigger record_auction_bid_history
after insert or update of aav, years, fantasy_team_id, created_by, is_qualifying_bid
on public.auction_bids
for each row execute function public.record_auction_bid_history();

