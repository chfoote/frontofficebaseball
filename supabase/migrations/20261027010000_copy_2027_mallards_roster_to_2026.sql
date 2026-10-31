-- Copy the St Thomas Mallards' 2027 roster into the 2026 season.
-- This migration is idempotent and deliberately preserves every 2027 row.

do $$
declare
  mallards_team_id bigint;
begin
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
    season.player_id,
    2026,
    season.fantasy_team_id,
    season.position,
    season.salary,
    season.term_end_year,
    season.contract_group,
    season.notes
  from public.player_seasons season
  where season.season_year = 2027
    and season.fantasy_team_id = mallards_team_id
  on conflict (player_id, season_year) do update
  set fantasy_team_id = excluded.fantasy_team_id,
      position = excluded.position,
      salary = excluded.salary,
      term_end_year = excluded.term_end_year,
      contract_group = excluded.contract_group,
      notes = excluded.notes;
end;
$$;
