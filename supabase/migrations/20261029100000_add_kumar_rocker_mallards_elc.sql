-- Add Kumar Rocker to the St Thomas Mallards on a three-year ELC.
do $$
declare
  mallards_team_id bigint;
  rocker_player_id bigint;
begin
  select id into mallards_team_id
  from public.fantasy_teams
  where abbreviation = 'STM'
     or lower(team_name) = 'st thomas mallards'
  order by case when abbreviation = 'STM' then 0 else 1 end
  limit 1;

  if mallards_team_id is null then
    raise exception 'The St Thomas Mallards are not present in public.fantasy_teams.';
  end if;

  insert into public.players (
    player_api_id, first_name, last_name, full_name, on_trade_block, notes
  ) values (
    '677958', 'Kumar', 'Rocker', 'Kumar Rocker', false,
    'Texas Rangers pitcher; St Thomas Mallards 2027-2029 ELC.'
  )
  on conflict (player_api_id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      full_name = excluded.full_name,
      notes = excluded.notes
  returning id into rocker_player_id;

  insert into public.player_seasons (
    player_id, season_year, fantasy_team_id, salary, position,
    term_end_year, contract_group, notes
  ) values
    (rocker_player_id, 2027, mallards_team_id, 250000, 'SP', 2029, 'ELC', 'Year 1 of three-year ELC'),
    (rocker_player_id, 2028, mallards_team_id, 250000, 'SP', 2029, 'ELC', 'Year 2 of three-year ELC'),
    (rocker_player_id, 2029, mallards_team_id, 250000, 'SP', 2029, 'ELC', 'Year 3 of three-year ELC')
  on conflict (player_id, season_year) do update
  set fantasy_team_id = excluded.fantasy_team_id,
      salary = excluded.salary,
      position = excluded.position,
      term_end_year = excluded.term_end_year,
      contract_group = excluded.contract_group,
      notes = excluded.notes,
      updated_at = now();

  -- Active roster ownership supersedes any acquired-prospect placeholder.
  delete from public.mlb_acquired_prospect_rights
  where season_year = 2027
    and lower(regexp_replace(player_name, '[^a-z0-9]', '', 'g')) = 'kumarrocker';
end $$;
