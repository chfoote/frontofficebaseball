do $$
declare
  right_row record;
  matched_player_id bigint;
  existing_season public.player_seasons;
begin
  for right_row in
    select rights.*, team.abbreviation
    from public.mlb_acquired_prospect_rights rights
    join public.fantasy_teams team on team.id = rights.fantasy_team_id
    where rights.season_year = 2027
  loop
    matched_player_id := null;
    existing_season := null;

    select player.id into matched_player_id
    from public.players player
    where lower(regexp_replace(coalesce(player.full_name, ''), '[^a-z0-9]', '', 'g')) =
          lower(regexp_replace(right_row.player_name, '[^a-z0-9]', '', 'g'))
    limit 1;

    if matched_player_id is null then
      insert into public.players (player_api_id, full_name, on_trade_block, notes)
      values (
        'ap-2027-' || substr(md5(lower(right_row.player_name)), 1, 16),
        right_row.player_name,
        false,
        'Created from the 2027 acquired-prospect workbook import.'
      )
      on conflict (player_api_id) do update set full_name = excluded.full_name
      returning id into matched_player_id;
    end if;

    select * into existing_season
    from public.player_seasons
    where player_id = matched_player_id and season_year = 2027;

    if existing_season.id is null then
      insert into public.player_seasons (
        player_id, season_year, fantasy_team_id, salary, position,
        term_end_year, contract_group, notes
      ) values (
        matched_player_id, 2027, right_row.fantasy_team_id, null, 'AP',
        null, 'ACQUIRED_PROSPECT', coalesce(right_row.acquisition_note, 'Workbook acquired prospect rights.')
      );
    elsif upper(coalesce(existing_season.position, '')) in ('AP', 'PROSPECT') then
      update public.player_seasons
      set fantasy_team_id = right_row.fantasy_team_id,
          position = 'AP',
          contract_group = 'ACQUIRED_PROSPECT',
          notes = coalesce(right_row.acquisition_note, existing_season.notes),
          updated_at = now()
      where id = existing_season.id;
    end if;
  end loop;
end $$;
