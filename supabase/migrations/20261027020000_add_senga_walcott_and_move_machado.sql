-- Update the St Thomas Mallards' 2026 roster.
-- Idempotent: safe to apply more than once.

do $$
declare
  mallards_team_id bigint;
  senga_player_id bigint;
  walcott_player_id bigint;
begin
  select id into mallards_team_id
  from public.fantasy_teams
  where lower(team_name) = 'st thomas mallards'
  limit 1;

  if mallards_team_id is null then
    raise exception 'The St Thomas Mallards are not present in public.fantasy_teams.';
  end if;

  insert into public.players (
    player_api_id, first_name, last_name, full_name, on_trade_block, notes
  ) values (
    '673540', 'Kodai', 'Senga', 'Kodai Senga', false, null
  )
  on conflict (player_api_id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      full_name = excluded.full_name
  returning id into senga_player_id;

  insert into public.players (
    player_api_id, first_name, last_name, full_name, on_trade_block, notes
  ) values (
    '806964', 'Sebastian', 'Walcott', 'Sebastian Walcott', false,
    'Texas Rangers prospect; manually added before an MLB regular-season appearance.'
  )
  on conflict (player_api_id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      full_name = excluded.full_name,
      notes = excluded.notes
  returning id into walcott_player_id;

  insert into public.player_seasons (
    player_id, season_year, fantasy_team_id, position, salary,
    term_end_year, contract_group, notes
  ) values
    (senga_player_id, 2026, mallards_team_id, 'W', 500000, 2026, null, null),
    (walcott_player_id, 2026, mallards_team_id, 'SS', 250000, 2027, null,
     'Texas Rangers prospect')
  on conflict (player_id, season_year) do update
  set fantasy_team_id = excluded.fantasy_team_id,
      position = excluded.position,
      salary = excluded.salary,
      term_end_year = excluded.term_end_year,
      contract_group = excluded.contract_group,
      notes = excluded.notes;

  update public.player_seasons season
  set position = 'DH'
  from public.players player
  where season.player_id = player.id
    and season.season_year = 2026
    and season.fantasy_team_id = mallards_team_id
    and player.player_api_id = '592518';

  if not found then
    raise exception 'Manny Machado (MLB ID 592518) was not found on the Mallards 2026 roster.';
  end if;
end;
$$;
