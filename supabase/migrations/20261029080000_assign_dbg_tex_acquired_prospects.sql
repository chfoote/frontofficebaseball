-- Add the complete G-Stringers and Texas acquired-prospect lists to roster
-- tables. A player who already has an active 2027 fantasy roster assignment
-- is deliberately excluded from acquired-prospect rights.
do $$
declare
  prospect record;
  destination_team_id bigint;
  matched_player_id bigint;
  roster_player_id bigint;
  synthetic_player_id bigint;
  normalized_name text;
begin
  for prospect in
    select *
    from (values
      ('DBG', 'Franklin Perez'),
      ('DBG', 'Zack Thompson'),
      ('DBG', 'Heston Kjerstad'),
      ('DBG', 'Lewin Diaz'),
      ('DBG', 'Emerson Hancock'),
      ('DBG', 'Jesus Sanchez'),
      ('DBG', 'Bryan Woo'),
      ('DBG', 'Luis Campusano'),
      ('DBG', 'Luis Urias'),
      ('DBG', 'Zack Gelof'),
      ('DBG', 'Trey Gibson'),
      ('DBG', 'Xavier Meyers'),
      ('DBG', 'Jamie Arnold'),
      ('DBG', 'Colby Thomas'),
      ('DBG', 'Joshua Kuroda-Grauer'),
      ('TEX', 'Austin Martin'),
      ('TEX', 'Benny Montgomery'),
      ('TEX', 'Chase Burns'),
      ('TEX', 'Chase Davis'),
      ('TEX', 'Daniel Espino'),
      ('TEX', 'Druw Jones'),
      ('TEX', 'Elijah Green'),
      ('TEX', 'Gunnar Hoglund'),
      ('TEX', 'Jacob Burke'),
      ('TEX', 'JJ Wetherholt'),
      ('TEX', 'Jordan Groshans'),
      ('TEX', 'Jordan Lawlar'),
      ('TEX', 'Noelvi Marte'),
      ('TEX', 'Nolan Gorman'),
      ('TEX', 'Orelvis Martinez')
    ) supplied(team_abbreviation, player_name)
  loop
    normalized_name := lower(regexp_replace(prospect.player_name, '[^a-z0-9]', '', 'g'));

    select id into destination_team_id
    from public.fantasy_teams
    where abbreviation = prospect.team_abbreviation;

    if destination_team_id is null then
      raise exception 'Unable to find fantasy team %', prospect.team_abbreviation;
    end if;

    -- Prefer the real player record if one exists. Synthetic AP records are
    -- considered only after checking the active roster.
    select player.id into matched_player_id
    from public.players player
    where lower(regexp_replace(coalesce(player.full_name, ''), '[^a-z0-9]', '', 'g')) = normalized_name
      and coalesce(player.player_api_id, '') not like 'ap-%'
    order by player.id
    limit 1;

    roster_player_id := null;
    if matched_player_id is not null then
      select season.player_id into roster_player_id
      from public.player_seasons season
      where season.player_id = matched_player_id
        and season.season_year = 2027
        and season.fantasy_team_id is not null
        and upper(coalesce(season.position, '')) not in ('AP', 'PROSPECT')
      limit 1;
    end if;

    if roster_player_id is not null then
      -- Called-up players belong only to their active roster. Remove any AP
      -- right or synthetic duplicate left by an earlier workbook import.
      delete from public.mlb_acquired_prospect_rights rights
      where rights.season_year = 2027
        and lower(regexp_replace(rights.player_name, '[^a-z0-9]', '', 'g')) = normalized_name;

      delete from public.player_seasons season
      using public.players player
      where season.player_id = player.id
        and season.season_year = 2027
        and upper(coalesce(season.position, '')) in ('AP', 'PROSPECT')
        and lower(regexp_replace(coalesce(player.full_name, ''), '[^a-z0-9]', '', 'g')) = normalized_name;

      continue;
    end if;

    -- Remove differently-cased or misspelled duplicates before inserting the
    -- canonical display name supplied above.
    delete from public.mlb_acquired_prospect_rights rights
    where rights.season_year = 2027
      and lower(regexp_replace(rights.player_name, '[^a-z0-9]', '', 'g')) = normalized_name
      and rights.player_name <> prospect.player_name;

    insert into public.mlb_acquired_prospect_rights (
      season_year, player_name, fantasy_team_id, acquisition_note
    ) values (
      2027, prospect.player_name, destination_team_id, 'Workbook acquired prospect'
    )
    on conflict (season_year, player_name) do update
    set fantasy_team_id = excluded.fantasy_team_id,
        acquisition_note = excluded.acquisition_note;

    if matched_player_id is null then
      select player.id into synthetic_player_id
      from public.players player
      where lower(regexp_replace(coalesce(player.full_name, ''), '[^a-z0-9]', '', 'g')) = normalized_name
      order by player.id
      limit 1;

      if synthetic_player_id is null then
        insert into public.players (player_api_id, full_name, on_trade_block, notes)
        values (
          'ap-2027-' || substr(md5(lower(prospect.player_name)), 1, 16),
          prospect.player_name,
          false,
          'Created from the 2027 acquired-prospect workbook import.'
        )
        on conflict (player_api_id) do update set full_name = excluded.full_name
        returning id into synthetic_player_id;
      end if;

      matched_player_id := synthetic_player_id;
    end if;

    insert into public.player_seasons (
      player_id, season_year, fantasy_team_id, salary, position,
      term_end_year, contract_group, notes
    ) values (
      matched_player_id, 2027, destination_team_id, null, 'AP',
      null, 'ACQUIRED_PROSPECT', 'Workbook acquired prospect'
    )
    on conflict (player_id, season_year) do update
    set fantasy_team_id = excluded.fantasy_team_id,
        position = 'AP',
        contract_group = 'ACQUIRED_PROSPECT',
        notes = excluded.notes,
        updated_at = now()
    where upper(coalesce(public.player_seasons.position, '')) in ('AP', 'PROSPECT');
  end loop;
end $$;
