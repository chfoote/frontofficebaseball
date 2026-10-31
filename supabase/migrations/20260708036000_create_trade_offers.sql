create table if not exists public.trade_offers (
  id bigint generated always as identity primary key,
  season_year integer not null,
  from_team_id bigint not null
    constraint trade_offers_from_team_id_fkey
    references public.fantasy_teams(id)
    on delete cascade,
  to_team_id bigint not null
    constraint trade_offers_to_team_id_fkey
    references public.fantasy_teams(id)
    on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  parent_trade_offer_id bigint references public.trade_offers(id) on delete set null,
  notes text,
  response_notes text,
  admin_notes text,
  accepted_at timestamptz,
  declined_at timestamptz,
  completed_at timestamptz,
  admin_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_offers_status_check check (
    status in (
      'pending',
      'accepted',
      'declined',
      'admin_declined',
      'completed',
      'countered'
    )
  ),
  constraint trade_offers_distinct_teams_check check (from_team_id <> to_team_id)
);

create table if not exists public.trade_offer_players (
  id bigint generated always as identity primary key,
  trade_offer_id bigint not null
    references public.trade_offers(id)
    on delete cascade,
  player_season_id bigint not null
    references public.player_seasons(id)
    on delete cascade,
  from_team_id bigint not null
    constraint trade_offer_players_from_team_id_fkey
    references public.fantasy_teams(id)
    on delete cascade,
  to_team_id bigint not null
    constraint trade_offer_players_to_team_id_fkey
    references public.fantasy_teams(id)
    on delete cascade,
  created_at timestamptz not null default now(),
  constraint trade_offer_players_distinct_teams_check check (from_team_id <> to_team_id),
  constraint trade_offer_players_unique_player_per_offer unique (
    trade_offer_id,
    player_season_id
  )
);

create index if not exists trade_offers_season_status_idx
  on public.trade_offers (season_year, status);

create index if not exists trade_offers_from_team_id_idx
  on public.trade_offers (from_team_id);

create index if not exists trade_offers_to_team_id_idx
  on public.trade_offers (to_team_id);

create index if not exists trade_offer_players_trade_offer_id_idx
  on public.trade_offer_players (trade_offer_id);

create or replace function public.validate_trade_offer_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.trade_offers;
  player_team_id bigint;
begin
  select *
  into offer
  from public.trade_offers
  where id = new.trade_offer_id;

  if not found then
    raise exception 'Trade offer not found.';
  end if;

  if not (
    (
      new.from_team_id = offer.from_team_id
      and new.to_team_id = offer.to_team_id
    )
    or (
      new.from_team_id = offer.to_team_id
      and new.to_team_id = offer.from_team_id
    )
  ) then
    raise exception 'Trade player teams must match the offer teams.';
  end if;

  select fantasy_team_id
  into player_team_id
  from public.player_seasons
  where id = new.player_season_id
    and season_year = offer.season_year;

  if player_team_id is distinct from new.from_team_id then
    raise exception 'Player does not belong to the listed source team for this season.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_trade_offer_player
  on public.trade_offer_players;

create trigger validate_trade_offer_player
  before insert or update on public.trade_offer_players
  for each row
  execute function public.validate_trade_offer_player();

drop trigger if exists set_trade_offers_updated_at on public.trade_offers;

create trigger set_trade_offers_updated_at
  before update on public.trade_offers
  for each row
  execute function public.set_updated_at();

create or replace function public.user_controls_team(
  team_id bigint,
  season_year integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.team_user_assignments
      where team_user_assignments.user_id = auth.uid()
        and team_user_assignments.fantasy_team_id = team_id
        and team_user_assignments.season_year = user_controls_team.season_year
    ),
    false
  );
$$;

grant execute on function public.user_controls_team(bigint, integer)
  to authenticated;

create or replace function public.approve_trade_offer(trade_offer_id bigint)
returns public.trade_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.trade_offers;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve trades.';
  end if;

  select *
  into offer
  from public.trade_offers
  where id = trade_offer_id
  for update;

  if not found then
    raise exception 'Trade offer not found.';
  end if;

  if offer.status <> 'accepted' then
    raise exception 'Only accepted trades can be completed.';
  end if;

  update public.player_seasons
  set fantasy_team_id = trade_offer_players.to_team_id
  from public.trade_offer_players
  where trade_offer_players.trade_offer_id = offer.id
    and player_seasons.id = trade_offer_players.player_season_id;

  update public.trade_offers
  set
    status = 'completed',
    completed_at = now(),
    admin_reviewed_at = now()
  where id = offer.id
  returning * into offer;

  return offer;
end;
$$;

grant execute on function public.approve_trade_offer(bigint)
  to authenticated;

alter table public.trade_offers enable row level security;
alter table public.trade_offer_players enable row level security;

drop policy if exists "Trade participants and admins can read offers"
  on public.trade_offers;

create policy "Trade participants and admins can read offers"
  on public.trade_offers
  for select
  to authenticated
  using (
    public.is_admin()
    or public.user_controls_team(from_team_id, season_year)
    or public.user_controls_team(to_team_id, season_year)
  );

drop policy if exists "Assigned managers can create trade offers"
  on public.trade_offers;

create policy "Assigned managers can create trade offers"
  on public.trade_offers
  for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and status = 'pending'
    and public.user_controls_team(from_team_id, season_year)
  );

drop policy if exists "Trade recipients and admins can update offers"
  on public.trade_offers;

create policy "Trade recipients and admins can update offers"
  on public.trade_offers
  for update
  to authenticated
  using (
    public.is_admin()
    or public.user_controls_team(to_team_id, season_year)
  )
  with check (
    public.is_admin()
    or public.user_controls_team(to_team_id, season_year)
  );

drop policy if exists "Admins can delete trade offers"
  on public.trade_offers;

create policy "Admins can delete trade offers"
  on public.trade_offers
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Trade participants and admins can read offer players"
  on public.trade_offer_players;

create policy "Trade participants and admins can read offer players"
  on public.trade_offer_players
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.trade_offers
      where trade_offers.id = trade_offer_players.trade_offer_id
        and (
          public.is_admin()
          or public.user_controls_team(trade_offers.from_team_id, trade_offers.season_year)
          or public.user_controls_team(trade_offers.to_team_id, trade_offers.season_year)
        )
    )
  );

drop policy if exists "Offer creators can add offer players"
  on public.trade_offer_players;

create policy "Offer creators can add offer players"
  on public.trade_offer_players
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.trade_offers
      where trade_offers.id = trade_offer_players.trade_offer_id
        and trade_offers.created_by = auth.uid()
        and trade_offers.status = 'pending'
        and public.user_controls_team(trade_offers.from_team_id, trade_offers.season_year)
    )
  );

drop policy if exists "Admins can delete offer players"
  on public.trade_offer_players;

create policy "Admins can delete offer players"
  on public.trade_offer_players
  for delete
  to authenticated
  using (public.is_admin());
