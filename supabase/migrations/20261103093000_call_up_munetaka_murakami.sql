-- Promote Munetaka Murakami to the Daytona G-Stringers on a three-year ELC.
do $$
declare
  daytona_team_id bigint;
  murakami_player_id bigint;
  murakami_2027_season_id bigint;
  contract_year integer;
begin
  select id into daytona_team_id
  from public.fantasy_teams
  where abbreviation = 'DBG'
  limit 1;

  if daytona_team_id is null then
    raise exception 'Munetaka Murakami call-up stopped: Daytona G-Stringers were not found.';
  end if;

  insert into public.players (
    player_api_id, first_name, last_name, full_name, on_trade_block
  ) values (
    '808959', 'Munetaka', 'Murakami', 'Munetaka Murakami', false
  )
  on conflict (player_api_id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      full_name = excluded.full_name,
      updated_at = now()
  returning id into murakami_player_id;

  for contract_year in 2027..2029 loop
    insert into public.player_seasons (
      player_id, season_year, fantasy_team_id, salary, position,
      term_end_year, contract_group, notes
    ) values (
      murakami_player_id, contract_year, daytona_team_id, 250000, '1B',
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
        updated_at = now()
    returning id into murakami_2027_season_id;

    if contract_year = 2027 then
      update public.league_transactions
      set player_id = murakami_player_id,
          fantasy_team_id = daytona_team_id,
          transaction_type = 'signing',
          action = 'called_up',
          transaction_date = current_date,
          season_year = 2027,
          salary = 250000,
          term_end_year = 2029,
          contract_group = 'ELC',
          position = '1B',
          notes = 'Prospect call-up · Three years at $250,000 annually (2027-2029)'
      where id = (
        select id from public.league_transactions
        where player_season_id = murakami_2027_season_id
        order by id desc limit 1
      );

      if not found then
        insert into public.league_transactions (
          player_season_id, player_id, fantasy_team_id, transaction_type,
          action, transaction_date, season_year, salary, term_end_year,
          contract_group, position, notes
        ) values (
          murakami_2027_season_id, murakami_player_id, daytona_team_id,
          'signing', 'called_up', current_date, 2027, 250000, 2029,
          'ELC', '1B',
          'Prospect call-up · Three years at $250,000 annually (2027-2029)'
        );
      end if;
    end if;
  end loop;

  update public.mlb_initial_signings
  set player_api_id = '808959', position = '1B'
  where lower(regexp_replace(player_name, '[^a-z0-9]', '', 'g')) = 'munetakamurakami';

  delete from public.mlb_acquired_prospect_rights
  where season_year = 2027
    and lower(regexp_replace(player_name, '[^a-z0-9]', '', 'g')) = 'munetakamurakami';
end $$;
