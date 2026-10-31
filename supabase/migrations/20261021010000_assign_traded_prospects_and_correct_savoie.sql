create temporary table prospect_rights_moves (
  player_api_id text not null,
  player_names text[] not null,
  destination_team text not null
) on commit drop;

insert into prospect_rights_moves (player_api_id, player_names, destination_team)
values
  ('8485624', array['Jordan Charron', 'Jordon Carron'], 'Hawksville Horndogs'),
  ('8484987', array['Anton Silayev', 'Anton Silaev'], 'Halifax Shithawks'),
  ('8483447', array['Conor Geekie'], 'San Diego Seadawgs'),
  ('8484859', array['Stian Solberg'], 'Lake Erie River Otters'),
  -- The October 8 migration accidentally used Matt Savoie's 8483512 here.
  ('8484196', array['Tanner Molendyk'], 'Georgian Bay Bears');

do $$
declare
  move record;
  matched_player public.players;
  current_season public.player_seasons;
  destination_team_id bigint;
begin
  for move in select * from prospect_rights_moves loop
    matched_player := null;
    current_season := null;
    destination_team_id := null;

    select * into matched_player
    from public.players player
    where player.player_api_id = move.player_api_id
       or lower(coalesce(player.full_name, nullif(trim(concat(player.first_name, ' ', player.last_name)), ''))) = any (
         select lower(candidate_name) from unnest(move.player_names) candidate_name
       )
    order by case when player.player_api_id = move.player_api_id then 0 else 1 end
    limit 1;

    if matched_player.id is null then
      insert into public.players (player_api_id, full_name, on_trade_block, notes)
      values (move.player_api_id, move.player_names[1], false, 'Created when 2027 acquired-prospect rights were assigned.')
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
        null, 'ACQUIRED_PROSPECT', 'Acquired prospect rights assigned following a trade for the 2027 season.'
      );
    else
      if upper(coalesce(current_season.position, '')) not in ('AP', 'PROSPECT') then
        raise exception '% is not recorded as a 2027 prospect (position: %)', matched_player.full_name, current_season.position;
      end if;

      update public.player_seasons
      set fantasy_team_id = destination_team_id,
          position = 'AP',
          contract_group = coalesce(contract_group, 'ACQUIRED_PROSPECT'),
          notes = coalesce(notes, 'Acquired prospect rights assigned following a trade for the 2027 season.'),
          updated_at = now()
      where id = current_season.id;
    end if;
  end loop;
end;
$$;

-- Matt Savoie was not traded to Georgian Bay. Restore his 2027 prospect
-- rights to Sparta without creating a trade or changing his prospect type.
do $$
declare
  savoie_id bigint;
  spartans_id bigint;
  bears_id bigint;
  current_team_id bigint;
  corrected_count integer;
begin
  select id into savoie_id
  from public.players
  where player_api_id = '8483512' or lower(full_name) in ('matt savoie', 'matthew savoie')
  order by case when player_api_id = '8483512' then 0 else 1 end
  limit 1;

  select id into spartans_id from public.fantasy_teams where lower(team_name) = 'sparta spartans' limit 1;
  select id into bears_id from public.fantasy_teams where lower(team_name) = 'georgian bay bears' limit 1;

  if savoie_id is null or spartans_id is null or bears_id is null then
    raise exception 'Unable to resolve Matt Savoie, Sparta Spartans, or Georgian Bay Bears';
  end if;

  select fantasy_team_id into current_team_id
  from public.player_seasons
  where player_id = savoie_id
    and season_year = 2027
    and upper(coalesce(position, '')) in ('AP', 'PROSPECT');

  if current_team_id = bears_id then
    update public.player_seasons
    set fantasy_team_id = spartans_id,
        updated_at = now()
    where player_id = savoie_id and season_year = 2027;
    get diagnostics corrected_count = row_count;
    if corrected_count <> 1 then
      raise exception 'Expected to correct exactly one Matt Savoie 2027 row, corrected %', corrected_count;
    end if;
  elsif current_team_id is distinct from spartans_id then
    raise exception 'Matt Savoie is assigned to unexpected 2027 team id %', current_team_id;
  end if;
end;
$$;

do $$
declare
  unmatched_count integer;
begin
  select count(*) into unmatched_count
  from prospect_rights_moves move
  where not exists (
    select 1
    from public.players player
    join public.player_seasons season on season.player_id = player.id and season.season_year = 2027
    join public.fantasy_teams team on team.id = season.fantasy_team_id
    where player.player_api_id = move.player_api_id
      and upper(season.position) = 'AP'
      and lower(team.team_name) = lower(move.destination_team)
  );

  if unmatched_count <> 0 then
    raise exception '% acquired-prospect assignments failed verification', unmatched_count;
  end if;
end;
$$;
