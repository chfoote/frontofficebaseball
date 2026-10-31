do $$
begin
  if not exists (
    select 1
    from public.player_seasons season
    join public.players player on player.id = season.player_id
    join public.fantasy_teams team on team.id = season.fantasy_team_id
    where player.player_api_id = '8475172'
      and season.season_year = 2028
      and (team.team_name = 'Hawksville Horndogs' or team.abbreviation = 'HAW')
  ) then
    raise exception 'Kadri 2028 ownership repair did not resolve to the Hawksville Horndogs.';
  end if;
end;
$$;
