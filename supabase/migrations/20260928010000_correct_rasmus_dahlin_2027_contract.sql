-- Rasmus Dahlin signed a five-year, $4.1M AAV contract beginning in 2026.
-- His 2027 season row was the lone year entered at $4.25M, which caused the
-- Record Book to interpret it as a separate contract beginning in 2027.
update public.player_seasons season
set salary = 4100000,
    updated_at = now()
from public.players player
where season.player_id = player.id
  and player.player_api_id = '8480839'
  and season.season_year = 2027
  and season.salary = 4250000
  and season.term_end_year = 2030;
