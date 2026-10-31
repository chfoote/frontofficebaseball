create table if not exists public.team_leadership (
  id bigint generated always as identity primary key,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  season_year integer not null,
  player_season_id bigint not null references public.player_seasons(id) on delete cascade,
  slot text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_leadership_slot_check check (slot in ('C', 'A1', 'A2')),
  constraint team_leadership_team_slot_key unique (fantasy_team_id, season_year, slot),
  constraint team_leadership_team_player_key unique (fantasy_team_id, season_year, player_season_id)
);

create index if not exists team_leadership_team_season_idx
  on public.team_leadership (fantasy_team_id, season_year);

create or replace function public.validate_team_leadership_player()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.player_seasons ps
    where ps.id = new.player_season_id
      and ps.fantasy_team_id = new.fantasy_team_id
      and ps.season_year = new.season_year
      and upper(coalesce(ps.position, '')) in ('C', 'LW', 'RW', 'D')
  ) then
    raise exception 'Captain assignments must use an active skater on this team and season.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_team_leadership_player on public.team_leadership;
create trigger validate_team_leadership_player
  before insert or update on public.team_leadership
  for each row execute function public.validate_team_leadership_player();

drop trigger if exists set_team_leadership_updated_at on public.team_leadership;
create trigger set_team_leadership_updated_at
  before update on public.team_leadership
  for each row execute function public.set_updated_at();

alter table public.team_leadership enable row level security;

create policy "Team leadership is publicly readable"
  on public.team_leadership for select using (true);

create policy "Team managers can create leadership assignments"
  on public.team_leadership for insert to authenticated
  with check (public.is_admin() or public.user_controls_team(fantasy_team_id, season_year));

create policy "Team managers can update leadership assignments"
  on public.team_leadership for update to authenticated
  using (public.is_admin() or public.user_controls_team(fantasy_team_id, season_year))
  with check (public.is_admin() or public.user_controls_team(fantasy_team_id, season_year));

create policy "Team managers can remove leadership assignments"
  on public.team_leadership for delete to authenticated
  using (public.is_admin() or public.user_controls_team(fantasy_team_id, season_year));

