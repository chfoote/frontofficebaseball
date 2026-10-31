insert into public.rookie_eligibility (season_year, player_id, notes)
select season.season_year, season.player_id, '$500,000 three-year rookie contract through 2028'
from public.player_seasons season
where season.season_year = 2026
  and season.salary = 500000
  and season.term_end_year = 2028
on conflict (season_year, player_id) do update
set notes = excluded.notes,
    updated_at = now();

