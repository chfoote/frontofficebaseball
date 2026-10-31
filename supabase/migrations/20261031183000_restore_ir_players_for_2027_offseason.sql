-- Off-season reset: players cannot remain in an IR roster slot between
-- seasons. Restore each affected player to their baseball position for the
-- 2027 contract year and any future contract rows copied from that IR entry.
--
-- Waiver rows (position = 'W') are deliberately not changed.
with restored_positions(player_api_id, active_position) as (
  values
    ('669203', 'SP'), -- Corbin Burnes
    ('671213', '1B'), -- Triston Casas
    ('670102', 'SP')  -- Bowden Francis
)
update public.player_seasons season
set position = restored.active_position,
    updated_at = now()
from public.players player,
     restored_positions restored
where season.player_id = player.id
  and player.player_api_id = restored.player_api_id
  and season.season_year >= 2027
  and upper(coalesce(season.position, '')) in ('IR', 'LTIR');
