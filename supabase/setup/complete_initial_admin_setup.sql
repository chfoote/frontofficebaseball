-- Run once in the standalone Front Office Baseball Supabase SQL Editor.
-- This aligns the database authorization with the app and adds Ketel Marte's
-- 2026 St Thomas Mallards contract copy. The existing 2027 row is preserved.

do $$
declare
  admin_user_id uuid;
  ketel_player_id bigint;
  mallards_team_id bigint;
begin
  select id
  into admin_user_id
  from auth.users
  where lower(email) = 'chfoote@icloud.com'
  limit 1;

  if admin_user_id is null then
    raise exception 'Sign in to the baseball app as chfoote@icloud.com before running this script.';
  end if;

  insert into public.profiles (id, email, is_admin)
  values (admin_user_id, 'chfoote@icloud.com', true)
  on conflict (id) do update
  set email = excluded.email,
      is_admin = true;

  select id
  into ketel_player_id
  from public.players
  where player_api_id = '606466'
  limit 1;

  if ketel_player_id is null then
    raise exception 'Ketel Marte (MLB ID 606466) is not present in public.players.';
  end if;

  select id
  into mallards_team_id
  from public.fantasy_teams
  where lower(team_name) = 'st thomas mallards'
  limit 1;

  if mallards_team_id is null then
    raise exception 'The St Thomas Mallards are not present in public.fantasy_teams.';
  end if;

  insert into public.player_seasons (
    player_id,
    season_year,
    fantasy_team_id,
    position,
    salary,
    term_end_year,
    contract_group,
    notes
  )
  select
    ketel_player_id,
    target_season.season_year,
    mallards_team_id,
    '2B',
    5500000,
    2027,
    null,
    null
  from (values (2026), (2027)) as target_season(season_year)
  on conflict (player_id, season_year) do update
  set fantasy_team_id = excluded.fantasy_team_id,
      position = excluded.position,
      salary = excluded.salary,
      term_end_year = excluded.term_end_year;

end;
$$;

-- The Results panel should return one row with is_admin = true and Ketel's
-- 2026 Mallards contract. This readback also makes verification unambiguous.
select
  profile.email,
  profile.is_admin,
  player.full_name,
  season.season_year,
  season.position,
  team.team_name,
  season.salary,
  season.term_end_year
from public.profiles profile
cross join public.player_seasons season
join public.players player on player.id = season.player_id
join public.fantasy_teams team on team.id = season.fantasy_team_id
where lower(profile.email) = 'chfoote@icloud.com'
  and player.player_api_id = '606466'
  and season.season_year = 2026;
