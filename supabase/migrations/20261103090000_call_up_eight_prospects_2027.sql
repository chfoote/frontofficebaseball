-- Promote eight prospects to three-year, $250,000 ELCs for 2027-2029.
-- MLB identities were verified against the MLB Stats API on 2026-11-03.
do $$
declare
  callup record;
  target_team_id bigint;
  target_player_id bigint;
  first_season_id bigint;
  contract_year integer;
begin
  for callup in
    select * from (values
      ('MCW', '694819', 'Jacob',  'Misiorowski', 'Jacob Misiorowski', 'SP'),
      ('MCW', '701398', 'Sal',    'Stewart',     'Sal Stewart',       '1B'),
      ('TEX', '693645', 'Cam',    'Schlittler',  'Cam Schlittler',    'SP'),
      ('TEX', '695505', 'Chase',  'Burns',       'Chase Burns',       'SP'),
      ('WAR', '800048', 'Parker', 'Messick',     'Parker Messick',    'SP'),
      ('WAR', '691023', 'Jordan', 'Walker',      'Jordan Walker',     'OF'),
      ('LBO', '682254', 'Mason',  'Montgomery',  'Mason Montgomery',  'SP'),
      ('DTC', '678246', 'Miguel', 'Vargas',      'Miguel Vargas',     '3B')
    ) as source(team_abbreviation, player_api_id, first_name, last_name, full_name, roster_position)
  loop
    select id into target_team_id
    from public.fantasy_teams
    where abbreviation = callup.team_abbreviation
    limit 1;

    if target_team_id is null then
      raise exception 'Prospect call-up stopped: fantasy team % was not found.', callup.team_abbreviation;
    end if;

    insert into public.players (
      player_api_id, first_name, last_name, full_name, on_trade_block
    ) values (
      callup.player_api_id, callup.first_name, callup.last_name,
      callup.full_name, false
    )
    on conflict (player_api_id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        full_name = excluded.full_name,
        updated_at = now()
    returning id into target_player_id;

    for contract_year in 2027..2029 loop
      insert into public.player_seasons (
        player_id, season_year, fantasy_team_id, salary, position,
        term_end_year, contract_group, notes
      ) values (
        target_player_id, contract_year, target_team_id, 250000,
        callup.roster_position, 2029, 'ELC',
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
      returning id into first_season_id;

      if contract_year = 2027 then
        update public.league_transactions
        set player_id = target_player_id,
            fantasy_team_id = target_team_id,
            transaction_type = 'signing',
            action = 'called_up',
            transaction_date = current_date,
            season_year = 2027,
            salary = 250000,
            term_end_year = 2029,
            contract_group = 'ELC',
            position = callup.roster_position,
            notes = 'Prospect call-up · Three years at $250,000 annually (2027-2029)'
        where id = (
          select id from public.league_transactions
          where player_season_id = first_season_id
          order by id desc
          limit 1
        );

        if not found then
          insert into public.league_transactions (
            player_season_id, player_id, fantasy_team_id, transaction_type,
            action, transaction_date, season_year, salary, term_end_year,
            contract_group, position, notes
          ) values (
            first_season_id, target_player_id, target_team_id, 'signing',
            'called_up', current_date, 2027, 250000, 2029,
            'ELC', callup.roster_position,
            'Prospect call-up · Three years at $250,000 annually (2027-2029)'
          );
        end if;
      end if;
    end loop;

    -- An active roster contract supersedes any acquired-prospect placeholder.
    delete from public.mlb_acquired_prospect_rights
    where season_year = 2027
      and lower(regexp_replace(player_name, '[^a-z0-9]', '', 'g')) =
          lower(regexp_replace(callup.full_name, '[^a-z0-9]', '', 'g'));
  end loop;
end $$;
