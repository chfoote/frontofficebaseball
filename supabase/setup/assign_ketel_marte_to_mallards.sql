-- One-time FOBL setup: copy Ketel Marte onto the St Thomas Mallards for 2026.
-- His existing 2027 season row is preserved.
-- Contract: $5,500,000 through the 2027 season.

insert into public.player_seasons (
  player_id,
  season_year,
  fantasy_team_id,
  position,
  salary,
  term_end_year,
  contract_group,
  notes
)
select
  player.id,
  target_season.season_year,
  team.id,
  '2B',
  5500000,
  2027,
  null,
  null
from public.players player
cross join public.fantasy_teams team
cross join (values (2026), (2027)) as target_season(season_year)
where player.player_api_id = '606466'
  and team.id = 2
  and lower(team.team_name) = 'st thomas mallards'
on conflict (player_id, season_year) do update
set fantasy_team_id = excluded.fantasy_team_id,
    position = excluded.position,
    salary = excluded.salary,
    term_end_year = excluded.term_end_year;
