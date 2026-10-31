-- Attach the generated St Thomas Mallards logo and matching colours.
update public.fantasy_teams
set logo = 'https://ehhkowptyxmjkzeusxhj.supabase.co/storage/v1/object/public/team-logos/generated/st-thomas-mallards.png',
    primary_color = '#0b5a35',
    secondary_color = '#d8a62a'
where abbreviation = 'STM';

update public.fantasy_team_branding_history history
set logo = team.logo,
    primary_color = team.primary_color,
    secondary_color = team.secondary_color
from public.fantasy_teams team
where history.fantasy_team_id = team.id
  and team.abbreviation = 'STM';
