-- Attach the generated baseball logos and matching team colours.
with branding(abbreviation, filename, primary_color, secondary_color) as (
  values
    ('OCB', 'oklahoma-city-bombers.png', '#071f3d', '#d7192d'),
    ('BBS', 'boston-blood-sox.png', '#c8102e', '#111111'),
    ('MCW', 'maccon-whoopee.png', '#4b147c', '#f2b51d'),
    ('DBG', 'daytona-beach-g-stringers.png', '#079ba5', '#ff7058'),
    ('TEX', 'texas-leaguers.png', '#bf4b12', '#08254a'),
    ('LBO', 'late-boomers.png', '#f36c0a', '#202733'),
    ('SSV', 'shelbyville-shelby-villians.png', '#3f116d', '#89db16'),
    ('WAR', 'warren-warriors.png', '#174fbd', '#c7cdd5')
)
update public.fantasy_teams team
set logo = 'https://ehhkowptyxmjkzeusxhj.supabase.co/storage/v1/object/public/team-logos/generated/' || branding.filename,
    primary_color = branding.primary_color,
    secondary_color = branding.secondary_color
from branding
where team.abbreviation = branding.abbreviation;

update public.fantasy_team_branding_history history
set logo = team.logo,
    primary_color = team.primary_color,
    secondary_color = team.secondary_color
from public.fantasy_teams team
where history.fantasy_team_id = team.id
  and team.abbreviation in ('OCB', 'BBS', 'MCW', 'DBG', 'TEX', 'LBO', 'SSV', 'WAR');
