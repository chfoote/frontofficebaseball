-- Register the eight non-Mallards franchises represented in Bby2k26 (2).xlsm.
-- This runs before the companion contract-season import and is idempotent.

do $$
begin
  create temporary table team_import (
    team_name text not null,
    abbreviation text not null,
    manager_name text not null,
    primary key (abbreviation)
  ) on commit drop;

  insert into team_import (team_name, abbreviation, manager_name) values
    ('Oklahoma City Bombers', 'OCB', 'Mike Borduas'),
    ('Boston Blood Sox', 'BBS', 'Jeremy Kinsella'),
    ('Maccon Whoopee', 'MCW', 'Sean Barron'),
    ('Daytona Beach G-Stringers', 'DBG', 'Collin'),
    ('Texas Leaguers', 'TEX', 'Linc MacAulay'),
    ('Late Boomers', 'LBO', 'Kevin'),
    ('Shelbyville Shelby-Villians', 'SSV', 'Zol'),
    ('Warren Warriors', 'WAR', 'Carl Thomas');

  insert into public.fantasy_teams (
    team_name,
    abbreviation,
    manager_name,
    manager_since,
    championships,
    runner_up_finishes,
    third_place_finishes,
    created_date,
    active,
    notes
  )
  select
    imported.team_name,
    imported.abbreviation,
    imported.manager_name,
    date '2026-01-01',
    0,
    0,
    0,
    date '2026-01-01',
    true,
    'Imported from Bby2k26 (2).xlsm'
  from team_import imported
  on conflict (abbreviation) do update
  set team_name = excluded.team_name,
      manager_name = excluded.manager_name,
      manager_since = excluded.manager_since,
      active = true;

  -- Record the original 2026 manager for the historical season views.
  insert into public.fantasy_team_manager_tenures (
    fantasy_team_id,
    manager_name,
    start_season,
    end_season
  )
  select
    team.id,
    imported.manager_name,
    2026,
    null
  from team_import imported
  join public.fantasy_teams team
    on team.abbreviation = imported.abbreviation
  on conflict (fantasy_team_id, start_season) do update
  set manager_name = excluded.manager_name,
      end_season = excluded.end_season;

  -- Seed the current names in branding history so season-aware pages resolve
  -- the franchises correctly from the league's first season onward.
  insert into public.fantasy_team_branding_history (
    fantasy_team_id,
    start_season,
    end_season,
    team_name,
    abbreviation,
    logo,
    primary_color,
    secondary_color
  )
  select
    team.id,
    2026,
    null,
    imported.team_name,
    imported.abbreviation,
    team.logo,
    team.primary_color,
    team.secondary_color
  from team_import imported
  join public.fantasy_teams team
    on team.abbreviation = imported.abbreviation
  on conflict (fantasy_team_id, start_season) do update
  set end_season = excluded.end_season,
      team_name = excluded.team_name,
      abbreviation = excluded.abbreviation,
      logo = excluded.logo,
      primary_color = excluded.primary_color,
      secondary_color = excluded.secondary_color;

  if (
    select count(*)
    from public.fantasy_teams team
    join team_import imported on imported.abbreviation = team.abbreviation
    where team.active = true
  ) <> 8 then
    raise exception 'Team registry import stopped: expected all eight active franchises.';
  end if;
end;
$$;
