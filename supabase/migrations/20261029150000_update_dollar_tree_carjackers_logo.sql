-- Replace the initial letter-heavy Carjackers crest with the simplified
-- shopping-cart, dollar-tree and baseball mark beginning in 2027.
update public.fantasy_team_branding_history history
set logo = '/team-logos/dollar-tree-carjackers-v2.png'
from public.fantasy_teams team
where history.fantasy_team_id = team.id
  and team.abbreviation = 'SSV'
  and history.start_season = 2027;

update public.fantasy_teams
set logo = '/team-logos/dollar-tree-carjackers-v2.png'
where abbreviation = 'SSV';
