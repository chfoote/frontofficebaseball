-- Every original franchise manager served in both league seasons. Team 1 is the
-- exception: Steven managed the Toronto Ice Bears in 2026 before Daniel took
-- over the renamed Niagara Bengals in 2027.
update public.fantasy_team_manager_tenures tenure
set start_season = 2026
where tenure.fantasy_team_id <> 1
  and tenure.start_season = 2027
  and not exists (
    select 1
    from public.fantasy_team_manager_tenures existing
    where existing.fantasy_team_id = tenure.fantasy_team_id
      and existing.start_season = 2026
  );
