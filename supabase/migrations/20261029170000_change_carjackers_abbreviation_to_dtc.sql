-- DTC is the current franchise abbreviation beginning with the 2027 rebrand.
-- The historical 2026 Shelbyville branding retains SSV.
do $$
declare
  target_team_id bigint;
begin
  select id into target_team_id
  from public.fantasy_teams
  where abbreviation in ('SSV', 'DTC')
    and team_name in ('Shelbyville Shelby-Villians', 'Dollar Tree Carjackers')
  order by case when abbreviation = 'DTC' then 0 else 1 end
  limit 1;

  if target_team_id is null then
    raise exception 'DTC abbreviation update stopped: Carjackers franchise not found.';
  end if;

  update public.fantasy_team_branding_history
  set abbreviation = 'DTC'
  where fantasy_team_id = target_team_id
    and start_season >= 2027;

  update public.fantasy_teams
  set abbreviation = 'DTC'
  where id = target_team_id;
end;
$$;
