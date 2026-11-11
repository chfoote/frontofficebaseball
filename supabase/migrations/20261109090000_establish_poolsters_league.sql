-- Foundation only. Further league activation stays closed until every workflow,
-- policy, RPC, notification, and record table has been isolated and tested.
begin;

create table public.leagues (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  current_season integer not null,
  first_recorded_season integer not null,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  check (first_recorded_season <= current_season),
  constraint league_activation_poolsters_only check (
    not is_enabled or id = '00000000-0000-4000-8000-000000000001'::uuid
  )
);
insert into public.leagues (id, slug, name, current_season, first_recorded_season, is_enabled)
values ('00000000-0000-4000-8000-000000000001', 'poolsters', 'Poolsters', 2027, 2026, true);

create table public.league_memberships (
  league_id uuid not null references public.leagues(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'commissioner')),
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_memberships_user_idx on public.league_memberships(user_id, league_id);

-- Preserve access for existing registered Poolsters users, including users who
-- are waiting for a team assignment. Platform administrators retain their role.
insert into public.league_memberships (league_id, user_id, role)
select '00000000-0000-4000-8000-000000000001'::uuid, id,
  case when is_admin then 'commissioner' else 'member' end
from public.profiles;

create function public.add_legacy_poolsters_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.league_memberships (league_id, user_id, role)
  values ('00000000-0000-4000-8000-000000000001', new.id, 'member')
  on conflict (league_id, user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.add_legacy_poolsters_membership() from public, anon, authenticated;
create trigger add_legacy_poolsters_membership after insert on public.profiles
for each row execute function public.add_legacy_poolsters_membership();

alter table public.leagues enable row level security;
alter table public.league_memberships enable row level security;
revoke all on public.leagues, public.league_memberships from anon, authenticated;
grant select on public.leagues to anon, authenticated;
grant select on public.league_memberships to authenticated;
create policy "Enabled league identity is public" on public.leagues for select to anon, authenticated
using (is_enabled);
create policy "Users read their own league memberships" on public.league_memberships for select to authenticated
using (user_id = (select auth.uid()));

-- Constant defaults backfill existing rows while preserving IDs and old clients.
alter table public.fantasy_teams add column league_id uuid not null
  default '00000000-0000-4000-8000-000000000001' references public.leagues(id);
alter table public.player_seasons add column league_id uuid not null
  default '00000000-0000-4000-8000-000000000001' references public.leagues(id);
alter table public.team_user_assignments add column league_id uuid not null
  default '00000000-0000-4000-8000-000000000001' references public.leagues(id);
alter table public.manager_targets add column league_id uuid not null
  default '00000000-0000-4000-8000-000000000001' references public.leagues(id);

create unique index fantasy_teams_league_id_id_key on public.fantasy_teams(league_id, id);
create index player_seasons_league_season_idx on public.player_seasons(league_id, season_year);
create index team_assignments_league_user_season_idx on public.team_user_assignments(league_id, user_id, season_year);
create unique index manager_targets_league_user_player_key on public.manager_targets(league_id, user_id, player_api_id);

-- Replace the original team FKs (rather than adding a second relationship) so
-- PostgREST's existing fantasy_team:fantasy_teams(*) joins remain unambiguous.
alter table public.player_seasons drop constraint player_seasons_fantasy_team_id_fkey;
alter table public.player_seasons add constraint player_seasons_fantasy_team_id_fkey
  foreign key (league_id, fantasy_team_id) references public.fantasy_teams(league_id, id)
  on delete set null (fantasy_team_id);
alter table public.team_user_assignments drop constraint team_user_assignments_fantasy_team_id_fkey;
alter table public.team_user_assignments add constraint team_user_assignments_fantasy_team_id_fkey
  foreign key (league_id, fantasy_team_id) references public.fantasy_teams(league_id, id) on delete cascade;

-- Transitional write guard applies even to service-side code that bypasses RLS.
-- Keep the old uniqueness rules until all legacy ON CONFLICT paths are migrated.
alter table public.fantasy_teams add constraint fantasy_teams_poolsters_transition
  check (league_id = '00000000-0000-4000-8000-000000000001'::uuid);
alter table public.player_seasons add constraint player_seasons_poolsters_transition
  check (league_id = '00000000-0000-4000-8000-000000000001'::uuid);
alter table public.team_user_assignments add constraint assignments_poolsters_transition
  check (league_id = '00000000-0000-4000-8000-000000000001'::uuid);
alter table public.manager_targets add constraint targets_poolsters_transition
  check (league_id = '00000000-0000-4000-8000-000000000001'::uuid);

notify pgrst, 'reload schema';
commit;
