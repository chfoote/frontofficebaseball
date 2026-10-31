-- Use the simplified transparent Carjackers mark with baseball cart wheels.
update public.fantasy_team_branding_history history
set logo = '/team-logos/dollar-tree-carjackers-v3.png'
from public.fantasy_teams team
where history.fantasy_team_id = team.id
  and team.abbreviation = 'SSV'
  and history.start_season = 2027;

update public.fantasy_teams
set logo = '/team-logos/dollar-tree-carjackers-v3.png'
where abbreviation = 'SSV';
