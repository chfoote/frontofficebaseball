create table public.auctions (
  id bigint generated always as identity primary key,
  player_season_id bigint not null references public.player_seasons(id) on delete cascade,
  season_year integer not null,
  auction_type text not null check (auction_type in ('ufa', 'rfa')),
  roster_position text not null check (roster_position in ('C', 'LW', 'RW', 'D', 'G')),
  rights_team_id bigint references public.fantasy_teams(id) on delete set null,
  qualifying_aav integer check (qualifying_aav is null or qualifying_aav >= 0),
  rights_qualified boolean,
  status text not null check (status in ('awaiting_qualification', 'open', 'awaiting_match', 'completed', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz not null,
  winning_bid_id bigint,
  resolution text check (resolution is null or resolution in ('won', 'matched', 'released', 'no_bids', 'cancelled')),
  nominated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auctions_one_active_player unique nulls not distinct (player_season_id, resolution)
);

create table public.auction_bids (
  id bigint generated always as identity primary key,
  auction_id bigint not null references public.auctions(id) on delete cascade,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  aav integer not null check (aav > 0),
  years integer not null check (years between 1 and 10),
  is_qualifying_bid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auction_bids_team_key unique (auction_id, fantasy_team_id)
);

alter table public.auctions add constraint auctions_winning_bid_id_fkey
  foreign key (winning_bid_id) references public.auction_bids(id) on delete set null;
create index auctions_season_status_idx on public.auctions(season_year, status, ends_at);
create index auction_bids_auction_rank_idx on public.auction_bids(auction_id, aav desc, years desc, created_at);
create trigger set_auctions_updated_at before update on public.auctions for each row execute function public.set_updated_at();
create trigger set_auction_bids_updated_at before update on public.auction_bids for each row execute function public.set_updated_at();

alter table public.auctions enable row level security;
alter table public.auction_bids enable row level security;
create policy "Authenticated users can read auctions" on public.auctions for select to authenticated using (true);
create policy "Admins can manage auctions" on public.auctions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Auction bids follow auction visibility" on public.auction_bids for select to authenticated using (
  public.is_admin() or auth.uid() = created_by or exists (
    select 1 from public.auctions a where a.id = auction_id and (
      (a.auction_type = 'ufa' and a.status in ('open','awaiting_match','completed'))
      or a.winning_bid_id = auction_bids.id
    )
  )
);

create or replace function public.place_auction_bid(p_auction_id bigint, p_aav integer, p_years integer)
returns public.auction_bids language plpgsql security definer set search_path = public as $$
declare a public.auctions; team_id bigint; existing public.auction_bids; result public.auction_bids; high_bid public.auction_bids;
begin
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'open' or now() >= a.ends_at then raise exception 'Bidding is not open.'; end if;
  if p_aav <= 0 or p_years < 1 or p_years > 10 then raise exception 'Enter a valid AAV and term.'; end if;
  select fantasy_team_id into team_id from public.team_user_assignments where user_id = auth.uid() order by (season_year = a.season_year) desc, season_year desc limit 1;
  if team_id is null then raise exception 'Your account is not assigned to a team.'; end if;
  select * into existing from public.auction_bids where auction_id = a.id and fantasy_team_id = team_id;
  if a.auction_type = 'ufa' then
    select * into high_bid from public.auction_bids where auction_id = a.id order by aav desc, years desc, created_at asc limit 1;
    if high_bid.id is not null and (existing.id is null or high_bid.id <> existing.id) and (p_aav < high_bid.aav or (p_aav = high_bid.aav and p_years <= high_bid.years)) then
      raise exception 'An open bid must beat the current high bid.';
    end if;
  end if;
  insert into public.auction_bids(auction_id, fantasy_team_id, created_by, aav, years)
  values(a.id, team_id, auth.uid(), p_aav, p_years)
  on conflict(auction_id, fantasy_team_id) do update set aav=excluded.aav, years=excluded.years, created_by=excluded.created_by, is_qualifying_bid=false
  returning * into result;
  return result;
end $$;
grant execute on function public.place_auction_bid(bigint, integer, integer) to authenticated;

create or replace function public.respond_rfa_qualification(p_auction_id bigint, p_qualify boolean)
returns public.auctions language plpgsql security definer set search_path = public as $$
declare a public.auctions; result public.auctions;
begin
  select * into a from public.auctions where id=p_auction_id for update;
  if not found or a.auction_type <> 'rfa' or a.status <> 'awaiting_qualification' then raise exception 'This qualification decision is not available.'; end if;
  if not public.user_controls_team(a.rights_team_id, a.season_year) and not public.is_admin() then raise exception 'Only the rights owner can decide.'; end if;
  if p_qualify then
    insert into public.auction_bids(auction_id,fantasy_team_id,created_by,aav,years,is_qualifying_bid)
    values(a.id,a.rights_team_id,auth.uid(),a.qualifying_aav,1,true)
    on conflict(auction_id,fantasy_team_id) do update set aav=excluded.aav,years=1,created_by=excluded.created_by,is_qualifying_bid=true;
    update public.auctions set rights_qualified=true,status='open',starts_at=now() where id=a.id returning * into result;
  else
    update public.auctions set rights_qualified=false,auction_type='ufa',rights_team_id=null,status='open',starts_at=now() where id=a.id returning * into result;
  end if;
  return result;
end $$;
grant execute on function public.respond_rfa_qualification(bigint, boolean) to authenticated;

create or replace function public.finalize_auction_contract(p_auction_id bigint, p_bid_id bigint, p_resolution text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.auctions; b public.auction_bids; ps public.player_seasons;
begin
  select * into a from public.auctions where id=p_auction_id;
  select * into b from public.auction_bids where id=p_bid_id and auction_id=p_auction_id;
  select * into ps from public.player_seasons where id=a.player_season_id;
  update public.player_seasons set fantasy_team_id=b.fantasy_team_id,salary=b.aav,position=a.roster_position,term_end_year=a.season_year+b.years-1,contract_group=upper(a.auction_type) where id=a.player_season_id;
  insert into public.league_transactions(player_season_id,player_id,fantasy_team_id,transaction_type,transaction_date,season_year,salary,term_end_year,contract_group,action,notes)
  values(a.player_season_id,ps.player_id,b.fantasy_team_id,'signing',current_date,a.season_year,b.aav,a.season_year+b.years-1,upper(a.auction_type),case when p_resolution='matched' then 'matched_rfa_offer' else 'signed' end,'Auction #'||a.id||' '||p_resolution)
  on conflict do nothing;
end $$;
revoke all on function public.finalize_auction_contract(bigint, bigint, text) from public;

create or replace function public.close_auction(p_auction_id bigint)
returns public.auctions language plpgsql security definer set search_path = public as $$
declare a public.auctions; winner public.auction_bids; result public.auctions;
begin
  if not public.is_admin() then raise exception 'Only admins can close auctions.'; end if;
  select * into a from public.auctions where id=p_auction_id for update;
  if not found or a.status <> 'open' then raise exception 'Auction is not open.'; end if;
  select * into winner from public.auction_bids where auction_id=a.id order by aav desc,years desc,created_at asc limit 1;
  if winner.id is null then update public.auctions set status='cancelled',resolution='no_bids' where id=a.id returning * into result; return result; end if;
  if a.auction_type='rfa' and a.rights_qualified and winner.fantasy_team_id <> a.rights_team_id then
    update public.auctions set winning_bid_id=winner.id,status='awaiting_match' where id=a.id returning * into result;
  else
    perform public.finalize_auction_contract(a.id,winner.id,'won');
    update public.auctions set winning_bid_id=winner.id,status='completed',resolution='won' where id=a.id returning * into result;
  end if;
  return result;
end $$;
grant execute on function public.close_auction(bigint) to authenticated;

create or replace function public.respond_rfa_match(p_auction_id bigint, p_match boolean)
returns public.auctions language plpgsql security definer set search_path = public as $$
declare a public.auctions; winner public.auction_bids; match_bid public.auction_bids; result public.auctions;
begin
  select * into a from public.auctions where id=p_auction_id for update;
  if not found or a.status <> 'awaiting_match' then raise exception 'This match decision is not available.'; end if;
  if not public.user_controls_team(a.rights_team_id,a.season_year) and not public.is_admin() then raise exception 'Only the rights owner can decide.'; end if;
  select * into winner from public.auction_bids where id=a.winning_bid_id;
  if p_match then
    insert into public.auction_bids(auction_id,fantasy_team_id,created_by,aav,years)
    values(a.id,a.rights_team_id,auth.uid(),winner.aav,winner.years)
    on conflict(auction_id,fantasy_team_id) do update set aav=excluded.aav,years=excluded.years,created_by=excluded.created_by,is_qualifying_bid=false returning * into match_bid;
    perform public.finalize_auction_contract(a.id,match_bid.id,'matched');
    update public.auctions set winning_bid_id=match_bid.id,status='completed',resolution='matched' where id=a.id returning * into result;
  else
    perform public.finalize_auction_contract(a.id,winner.id,'released');
    update public.auctions set status='completed',resolution='released' where id=a.id returning * into result;
  end if;
  return result;
end $$;
grant execute on function public.respond_rfa_match(bigint, boolean) to authenticated;
