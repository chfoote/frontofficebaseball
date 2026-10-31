-- Materialize the final year of Sebastian Walcott's Mallards contract.
do $$
declare
  mallards_team_id bigint;
  walcott_player_id bigint;
begin
  select id into mallards_team_id
  from public.fantasy_teams
  where abbreviation = 'STM'
     or lower(team_name) = 'st thomas mallards'
  order by case when abbreviation = 'STM' then 0 else 1 end
  limit 1;

  select id into walcott_player_id
  from public.players
  where player_api_id = '806964'
     or lower(regexp_replace(coalesce(full_name, ''), '[^a-z0-9]', '', 'g')) = 'sebastianwalcott'
  order by case when player_api_id = '806964' then 0 else 1 end
  limit 1;

  if mallards_team_id is null then
    raise exception 'The St Thomas Mallards are not present in public.fantasy_teams.';
  end if;
  if walcott_player_id is null then
    raise exception 'Sebastian Walcott is not present in public.players.';
  end if;

  insert into public.player_seasons (
    player_id, season_year, fantasy_team_id, salary, position,
    term_end_year, contract_group, notes
  ) values (
    walcott_player_id, 2027, mallards_team_id, 250000, 'SS',
    2027, null, 'Final year of existing Mallards contract'
  )
  on conflict (player_id, season_year) do update
  set fantasy_team_id = excluded.fantasy_team_id,
      salary = excluded.salary,
      position = excluded.position,
      term_end_year = excluded.term_end_year,
      contract_group = excluded.contract_group,
      notes = excluded.notes,
      updated_at = now();

  delete from public.mlb_acquired_prospect_rights
  where season_year = 2027
    and lower(regexp_replace(player_name, '[^a-z0-9]', '', 'g')) = 'sebastianwalcott';
end $$;
