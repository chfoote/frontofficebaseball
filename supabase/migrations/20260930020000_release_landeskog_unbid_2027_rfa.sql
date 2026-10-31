-- Gabriel Landeskog received no bid in the 2027 RFA auction.
update public.player_seasons season
set fantasy_team_id = null,
    salary = null,
    position = 'LW',
    term_end_year = null,
    contract_group = 'UFA',
    notes = 'Released to unrestricted free agency after receiving no RFA bid in 2027.',
    updated_at = now()
from public.players player
where season.player_id = player.id
  and player.player_api_id = '8476455'
  and season.season_year = 2027
  and season.position = 'RFA'
  and season.contract_group = 'RFA'
  and season.fantasy_team_id is not null;
