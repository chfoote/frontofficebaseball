-- Materialize the complete Late Bloomers and Warren Warriors acquired lists.
-- Active 2027 fantasy-roster players are not duplicated as prospects.
do $$
declare
  prospect record;
  destination_team_id bigint;
  matched_player_id bigint;
  synthetic_player_id bigint;
  normalized_name text;
  has_active_roster boolean;
begin
  for prospect in
    select * from (values
      ('LBO', 'Nick Neidert'),
      ('LBO', 'Marcus Smith'),
      ('LBO', 'Tommy Troy'),
      ('LBO', 'Quinn Mathews'),
      ('WAR', 'DL Hall'),
      ('WAR', 'Kevin Maitan'),
      ('WAR', 'Coby Mayo'),
      ('WAR', 'Ian Anderson'),
      ('WAR', 'Chase DeLauter'),
      ('WAR', 'Jordan Walker'),
      ('WAR', 'Gabriel Arias'),
      ('WAR', 'Ralphy Velazquez'),
      ('WAR', 'Travis Bazzana'),
      ('WAR', 'Myles Naylor'),
      ('WAR', 'Dylan Beavers'),
      ('WAR', 'George Lombard Jr.'),
      ('WAR', 'Malcolm Moore'),
      ('WAR', 'Alejandro Rosario'),
      ('WAR', 'Luisangel Acuna')
    ) supplied(team_abbreviation, player_name)
  loop
    normalized_name := regexp_replace(translate(lower(prospect.player_name), 'áéíóúñ', 'aeioun'), '[^a-z0-9]', '', 'g');

    select id into destination_team_id
    from public.fantasy_teams
    where abbreviation = prospect.team_abbreviation;

    if destination_team_id is null then
      raise exception 'Unable to find fantasy team %', prospect.team_abbreviation;
    end if;

    select player.id into matched_player_id
    from public.players player
    where regexp_replace(translate(lower(coalesce(player.full_name, '')), 'áéíóúñ', 'aeioun'), '[^a-z0-9]', '', 'g') = normalized_name
      and coalesce(player.player_api_id, '') not like 'ap-%'
    order by player.id
    limit 1;

    select exists (
      select 1
      from public.player_seasons season
      where season.player_id = matched_player_id
        and season.season_year = 2027
        and season.fantasy_team_id is not null
        and upper(coalesce(season.position, '')) not in ('AP', 'PROSPECT')
    ) into has_active_roster;

    if has_active_roster then
      delete from public.mlb_acquired_prospect_rights rights
      where rights.season_year = 2027
        and regexp_replace(translate(lower(rights.player_name), 'áéíóúñ', 'aeioun'), '[^a-z0-9]', '', 'g') = normalized_name;

      delete from public.player_seasons season
      using public.players player
      where season.player_id = player.id
        and season.season_year = 2027
        and upper(coalesce(season.position, '')) in ('AP', 'PROSPECT')
        and regexp_replace(translate(lower(coalesce(player.full_name, '')), 'áéíóúñ', 'aeioun'), '[^a-z0-9]', '', 'g') = normalized_name;
      continue;
    end if;

    delete from public.mlb_acquired_prospect_rights rights
    where rights.season_year = 2027
      and regexp_replace(translate(lower(rights.player_name), 'áéíóúñ', 'aeioun'), '[^a-z0-9]', '', 'g') = normalized_name
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
      where regexp_replace(translate(lower(coalesce(player.full_name, '')), 'áéíóúñ', 'aeioun'), '[^a-z0-9]', '', 'g') = normalized_name
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
