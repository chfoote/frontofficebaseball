create temporary table prospect_rights_moves (
  player_api_id text,
  player_names text[] not null,
  expected_from_team text,
  destination_team text not null
) on commit drop;

insert into prospect_rights_moves (player_api_id, player_names, expected_from_team, destination_team)
values
  ('8486312', array['Anton Emil Wilde Larsen', 'Anton Emil Wilde-Larsen'], null, 'Hawksville Horndogs'),
  ('8483490', array['Pavel Mintyukov'], 'San Diego Seadawgs', 'Lake Erie River Otters'),
  ('8484800', array['Berkly Catton', 'Berkley Catton'], 'Georgian Bay Bears', 'San Diego Seadawgs'),
  ('8486087', array['Chase Reid'], 'Georgian Bay Bears', 'San Diego Seadawgs'),
  ('8483471', array['Brad Lambert'], 'Lake Erie River Otters', 'Georgian Bay Bears'),
  ('8483487', array['Rutger McGroarty'], 'Lake Erie River Otters', 'Sparta Spartans');

do $$
declare
  move record;
  matched_player public.players;
  current_season public.player_seasons;
  expected_team_id bigint;
  destination_team_id bigint;
  season_was_created boolean;
begin
  for move in select * from prospect_rights_moves loop
    matched_player := null;
    current_season := null;
    season_was_created := false;
    select * into matched_player
    from public.players player
    where (move.player_api_id is not null and player.player_api_id = move.player_api_id)
       or lower(player.full_name) = any(
         select lower(candidate_name) from unnest(move.player_names) candidate_name
       )
    order by case when player.player_api_id = move.player_api_id then 0 else 1 end
    limit 1;

    if matched_player.id is null then
      insert into public.players (
        player_api_id, full_name, on_trade_block, notes
      ) values (
        move.player_api_id, move.player_names[1], false,
        'Created when 2027 acquired-prospect rights were assigned.'
      )
      returning * into matched_player;
    end if;

    select id into destination_team_id
    from public.fantasy_teams
    where lower(team_name) = lower(move.destination_team)
    limit 1;

    if destination_team_id is null then
      raise exception 'Unable to find destination team %', move.destination_team;
    end if;

    select * into current_season
    from public.player_seasons
    where player_id = matched_player.id and season_year = 2027;

    if current_season.id is null then
      insert into public.player_seasons (
        player_id, season_year, fantasy_team_id, salary, position,
        term_end_year, contract_group, notes
      ) values (
        matched_player.id, 2027, destination_team_id, null, 'AP',
        null, 'ACQUIRED_PROSPECT', 'Acquired prospect rights reassigned for the 2027 season.'
      )
      returning * into current_season;
      season_was_created := true;
    end if;

    if upper(coalesce(current_season.position, '')) not in ('AP', 'PROSPECT') then
      raise exception '% is not recorded as a 2027 acquired prospect (position: %)', matched_player.full_name, current_season.position;
    end if;

    if move.expected_from_team is not null and not season_was_created then
      select id into expected_team_id
      from public.fantasy_teams
      where lower(team_name) = lower(move.expected_from_team)
      limit 1;

      if expected_team_id is null then
        raise exception 'Unable to find source team %', move.expected_from_team;
      end if;

      if current_season.fantasy_team_id <> expected_team_id then
        raise exception '% is not currently assigned to %', matched_player.full_name, move.expected_from_team;
      end if;
    end if;

    update public.player_seasons
    set fantasy_team_id = destination_team_id,
        updated_at = now()
    where id = current_season.id;
  end loop;
end;
$$;
