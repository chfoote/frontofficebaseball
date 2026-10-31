-- Preserve the Shelbyville identity and Molnar's ownership for 2026, then
-- rebrand the same franchise for Zack Donat beginning with the 2027 season.
do $$
declare
  target_team_id bigint;
  new_logo text := '/team-logos/dollar-tree-carjackers.png';
begin
  select id into target_team_id
  from public.fantasy_teams
  where abbreviation = 'SSV';

  if target_team_id is null then
    raise exception 'Dollar Tree Carjackers rebrand stopped: SSV franchise not found.';
  end if;

  update public.fantasy_team_branding_history
  set end_season = 2026
  where fantasy_team_id = target_team_id
    and start_season < 2027
    and (end_season is null or end_season > 2026);

  insert into public.fantasy_team_branding_history (
    fantasy_team_id,
    start_season,
    end_season,
    team_name,
    abbreviation,
    logo,
    primary_color,
    secondary_color
  ) values (
    target_team_id,
    2027,
    null,
    'Dollar Tree Carjackers',
    'SSV',
    new_logo,
    '#075b2a',
    '#92f000'
  )
  on conflict (fantasy_team_id, start_season) do update
  set end_season = excluded.end_season,
      team_name = excluded.team_name,
      abbreviation = excluded.abbreviation,
      logo = excluded.logo,
      primary_color = excluded.primary_color,
      secondary_color = excluded.secondary_color;

  update public.fantasy_team_manager_tenures
  set manager_name = 'Molnar',
      end_season = 2026
  where fantasy_team_id = target_team_id
    and start_season <= 2026;

  insert into public.fantasy_team_manager_tenures (
    fantasy_team_id,
    manager_name,
    start_season,
    end_season
  ) values (
    target_team_id,
    'Zack Donat',
    2027,
    null
  )
  on conflict (fantasy_team_id, start_season) do update
  set manager_name = excluded.manager_name,
      end_season = excluded.end_season;

  update public.fantasy_teams
  set team_name = 'Dollar Tree Carjackers',
      logo = new_logo,
      primary_color = '#075b2a',
      secondary_color = '#92f000',
      manager_name = 'Zack Donat',
      manager_since = date '2027-01-01',
      notes = concat_ws(' · ', nullif(notes, ''), 'Rebranded from Shelbyville Shelby-Villians for 2027')
  where id = target_team_id;
end;
$$;
