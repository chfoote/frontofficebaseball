-- Give each team 2027 RFA rights to its players whose 2026 contracts expire.
-- The placeholder has no salary or contract term and does not occupy an
-- active, waiver, or injured-reserve roster position.
--
-- A genuine 2027 extension/new contract (term_end_year >= 2027) is preserved.

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
  season.player_id,
  2027,
  season.fantasy_team_id,
  'RFA',
  null,
  null,
  'RFA_RIGHTS',
  '2027 RFA rights from an expiring 2026 contract'
from public.player_seasons season
where season.season_year = 2026
  and season.term_end_year = 2026
  and season.fantasy_team_id is not null
  and upper(coalesce(season.position, '')) not in ('RFA', 'PROSPECT', 'AP', 'RETENTION')
on conflict (player_id, season_year) do update
set fantasy_team_id = excluded.fantasy_team_id,
    position = excluded.position,
    salary = excluded.salary,
    term_end_year = excluded.term_end_year,
    contract_group = excluded.contract_group,
    notes = excluded.notes
where public.player_seasons.position = 'RFA'
   or public.player_seasons.term_end_year is null
   or public.player_seasons.term_end_year <= 2026;
