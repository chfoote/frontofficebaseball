-- Move Manny Machado to designated hitter for the 2027 season.
-- Idempotent: safe to apply more than once.

do $$
begin
  update public.player_seasons season
  set position = 'DH'
  from public.players player
  where season.player_id = player.id
    and season.season_year = 2027
    and player.player_api_id = '592518';

  if not found then
    raise exception 'Manny Machado (MLB ID 592518) was not found on a 2027 roster.';
  end if;
end;
$$;
