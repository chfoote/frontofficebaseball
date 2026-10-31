create or replace function public.carry_claimed_contract_forward(p_player_season_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  source_season public.player_seasons;
  updated_count integer;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;

  select * into source_season from public.player_seasons where id = p_player_season_id for update;
  if not found then raise exception 'Player season not found.'; end if;
  if source_season.fantasy_team_id is null then raise exception 'A claimed player must have a destination team.'; end if;
  if source_season.term_end_year is null or source_season.term_end_year <= source_season.season_year then return 0; end if;

  update public.player_seasons
  set fantasy_team_id = source_season.fantasy_team_id
  where player_id = source_season.player_id
    and season_year > source_season.season_year
    and season_year <= source_season.term_end_year
    and fantasy_team_id is distinct from source_season.fantasy_team_id;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.carry_claimed_contract_forward(bigint) to authenticated;

-- Repair Nazem Kadri's existing 2028 contract season after his 2027 waiver claim.
update public.player_seasons season
set fantasy_team_id = horndogs.id
from public.players player
cross join lateral (
  select id from public.fantasy_teams
  where team_name = 'Hawksville Horndogs' or abbreviation = 'HAW'
  order by case when team_name = 'Hawksville Horndogs' then 0 else 1 end
  limit 1
) horndogs
where season.player_id = player.id
  and player.player_api_id = '8475172'
  and season.season_year = 2028;
