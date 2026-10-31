-- Matthew Tkachuk was assigned NHL player ID 8480000, which belongs to
-- Kasper Kotkansalo. Correcting the shared player record fixes every season
-- of Tkachuk's 2026-2030 Halifax contract.
update public.players
set player_api_id = '8479314',
    first_name = 'Matthew',
    last_name = 'Tkachuk',
    full_name = 'Matthew Tkachuk',
    updated_at = now()
where player_api_id = '8480000'
  and full_name = 'Matthew Tkachuk';
