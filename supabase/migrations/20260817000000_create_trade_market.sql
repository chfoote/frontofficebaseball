create table public.trade_block_listings (
  id bigint generated always as identity primary key,
  player_season_id bigint not null references public.player_seasons(id) on delete cascade,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  season_year integer not null,
  listed_by uuid not null references public.profiles(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_block_listings_player_season_key unique (player_season_id)
);

create table public.player_trade_interests (
  id bigint generated always as identity primary key,
  player_season_id bigint not null references public.player_seasons(id) on delete cascade,
  interested_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  owner_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  season_year integer not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint player_trade_interests_team_player_key unique (player_season_id, interested_team_id),
  constraint player_trade_interests_distinct_teams_check check (interested_team_id <> owner_team_id)
);

create index trade_block_listings_season_idx
  on public.trade_block_listings (season_year, created_at desc);
create index player_trade_interests_owner_idx
  on public.player_trade_interests (owner_team_id, season_year, created_at desc);
create index player_trade_interests_interested_idx
  on public.player_trade_interests (interested_team_id, season_year, created_at desc);

create trigger set_trade_block_listings_updated_at
  before update on public.trade_block_listings
  for each row execute function public.set_updated_at();

create or replace function public.validate_trade_market_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_team_id bigint;
  current_season_year integer;
begin
  select fantasy_team_id, season_year
    into current_team_id, current_season_year
  from public.player_seasons
  where id = new.player_season_id;

  if not found or current_team_id is null then
    raise exception 'The player is not assigned to a fantasy team.';
  end if;

  if tg_table_name = 'trade_block_listings' then
    if new.fantasy_team_id <> current_team_id or new.season_year <> current_season_year then
      raise exception 'Trade-block listing does not match the player roster record.';
    end if;
    if new.listed_by <> auth.uid() or not public.user_controls_team(new.fantasy_team_id, new.season_year) then
      raise exception 'You can only list players belonging to your team.';
    end if;
  else
    if new.owner_team_id <> current_team_id or new.season_year <> current_season_year then
      raise exception 'Trade interest does not match the player roster record.';
    end if;
    if new.created_by <> auth.uid() or not public.user_controls_team(new.interested_team_id, new.season_year) then
      raise exception 'You can only register interest for your assigned team.';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_trade_block_listing
  before insert or update on public.trade_block_listings
  for each row execute function public.validate_trade_market_record();

create trigger validate_player_trade_interest
  before insert or update on public.player_trade_interests
  for each row execute function public.validate_trade_market_record();

create or replace function public.notify_player_trade_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment record;
  interested_team_name text;
  player_name text;
begin
  select team_name into interested_team_name
  from public.fantasy_teams where id = new.interested_team_id;

  select coalesce(p.full_name, concat_ws(' ', p.first_name, p.last_name), 'A player')
    into player_name
  from public.player_seasons ps
  join public.players p on p.id = ps.player_id
  where ps.id = new.player_season_id;

  for assignment in
    select distinct user_id
    from public.team_user_assignments
    where fantasy_team_id = new.owner_team_id
      and user_id <> new.created_by
  loop
    perform public.create_notification(
      assignment.user_id,
      new.created_by,
      'player_trade_interest',
      'New player interest',
      coalesce(interested_team_name, 'Another team') || ' is interested in acquiring ' || player_name || '.',
      '/trade-market',
      jsonb_build_object(
        'interest_id', new.id,
        'player_season_id', new.player_season_id,
        'interested_team_id', new.interested_team_id,
        'owner_team_id', new.owner_team_id,
        'season_year', new.season_year
      )
    );
  end loop;
  return new;
end;
$$;

create trigger notify_player_trade_interest_insert
  after insert on public.player_trade_interests
  for each row execute function public.notify_player_trade_interest();

create or replace function public.clear_stale_trade_market_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.fantasy_team_id is distinct from new.fantasy_team_id then
    delete from public.trade_block_listings where player_season_id = new.id;
    delete from public.player_trade_interests where player_season_id = new.id;
  end if;
  return new;
end;
$$;

create trigger clear_trade_market_after_player_move
  after update of fantasy_team_id on public.player_seasons
  for each row execute function public.clear_stale_trade_market_records();

alter table public.trade_block_listings enable row level security;
alter table public.player_trade_interests enable row level security;

create policy "Authenticated users can read trade block"
  on public.trade_block_listings for select to authenticated using (true);
create policy "Managers can list their players"
  on public.trade_block_listings for insert to authenticated
  with check (auth.uid() = listed_by and public.user_controls_team(fantasy_team_id, season_year));
create policy "Managers can update their listings"
  on public.trade_block_listings for update to authenticated
  using (public.is_admin() or public.user_controls_team(fantasy_team_id, season_year))
  with check (public.is_admin() or public.user_controls_team(fantasy_team_id, season_year));
create policy "Managers can remove their listings"
  on public.trade_block_listings for delete to authenticated
  using (public.is_admin() or public.user_controls_team(fantasy_team_id, season_year));

create policy "Trade interest participants can read interests"
  on public.player_trade_interests for select to authenticated
  using (
    public.is_admin()
    or auth.uid() = created_by
    or public.user_controls_team(interested_team_id, season_year)
    or public.user_controls_team(owner_team_id, season_year)
  );
create policy "Managers can register trade interest"
  on public.player_trade_interests for insert to authenticated
  with check (
    auth.uid() = created_by
    and public.user_controls_team(interested_team_id, season_year)
    and interested_team_id <> owner_team_id
  );
create policy "Managers can withdraw trade interest"
  on public.player_trade_interests for delete to authenticated
  using (
    public.is_admin()
    or auth.uid() = created_by
    or public.user_controls_team(interested_team_id, season_year)
  );
