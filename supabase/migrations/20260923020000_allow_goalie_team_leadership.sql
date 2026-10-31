create or replace function public.validate_team_leadership_player()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.player_seasons ps
    where ps.id = new.player_season_id
      and ps.fantasy_team_id = new.fantasy_team_id
      and ps.season_year = new.season_year
      and upper(coalesce(ps.position, '')) in ('C', 'LW', 'RW', 'D', 'G')
  ) then
    raise exception 'Leadership assignments must use an active player on this team and season.';
  end if;
  return new;
end;
$$;

