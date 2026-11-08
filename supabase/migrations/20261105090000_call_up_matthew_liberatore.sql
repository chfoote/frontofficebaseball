-- Call up Matthew Liberatore to LBO at SP for $250,000 annually, 2027-2029.
-- Roster-only update: publishing a transaction/Discord announcement is separate.
do $$
declare
  target_team_id bigint;
  target_player_id bigint;
  contract_year integer;
begin
  select id into strict target_team_id
  from public.fantasy_teams
  where abbreviation = 'LBO';

  select id into strict target_player_id
  from public.players
  where player_api_id = '669461';

  if exists (
    select 1 from public.player_seasons
    where player_id = target_player_id
      and season_year between 2027 and 2029
      and fantasy_team_id is not null
      and fantasy_team_id <> target_team_id
  ) then
    raise exception 'Liberatore call-up stopped: another team owns a 2027-2029 season record.';
  end if;

  for contract_year in 2027..2029 loop
    insert into public.player_seasons (
      player_id, season_year, fantasy_team_id, salary, position,
      term_end_year, contract_group, notes
    ) values (
      target_player_id, contract_year, target_team_id, 250000, 'SP',
      2029, 'ELC',
      'Prospect call-up · Year ' || (contract_year - 2026) || ' of three-year ELC'
    )
    on conflict (player_id, season_year) do update
    set fantasy_team_id = excluded.fantasy_team_id,
        salary = excluded.salary,
        position = excluded.position,
        term_end_year = excluded.term_end_year,
        contract_group = excluded.contract_group,
        notes = excluded.notes,
        updated_at = now();
  end loop;

  delete from public.mlb_acquired_prospect_rights
  where season_year = 2027
    and fantasy_team_id = target_team_id
    and lower(regexp_replace(player_name, '[^a-z0-9]', '', 'g')) = 'matthewliberatore';

  if (select count(*) from public.player_seasons
      where player_id = target_player_id
        and fantasy_team_id = target_team_id
        and season_year between 2027 and 2029
        and position = 'SP' and salary = 250000
        and term_end_year = 2029 and contract_group = 'ELC') <> 3 then
    raise exception 'Liberatore call-up failed contract verification.';
  end if;
end $$;
