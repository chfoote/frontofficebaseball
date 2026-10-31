-- These RFA rights expired after the 2027 auction closed without a bid.
-- Restore each player's regular roster position and make them unowned UFAs.
update public.player_seasons season
set fantasy_team_id = null,
    salary = null,
    position = released.position,
    term_end_year = null,
    contract_group = 'UFA',
    notes = 'Released to unrestricted free agency after receiving no RFA bid in 2027.',
    updated_at = now()
from (
  values
    ('8482142'::text, 'D'::text),
    ('8475784'::text, 'LW'::text),
    ('8475690'::text, 'D'::text),
    ('8481711'::text, 'RW'::text)
) as released(player_api_id, position)
join public.players player on player.player_api_id = released.player_api_id
where season.player_id = player.id
  and season.season_year = 2027
  and season.position = 'RFA'
  and season.contract_group = 'RFA'
  and season.fantasy_team_id is not null;
