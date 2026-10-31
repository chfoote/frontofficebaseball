insert into public.record_history (
  record_key, scope, fantasy_team_id, season_year, holder_type, holder_name,
  record_value, previous_value, period_start, period_end,
  verification_status, metadata, achieved_at
)
select
  'highest-scoring-team', 'league', team.id, 2026, 'team', 'St Thomas Mallards',
  4806.0, null, date '2025-10-06', date '2026-04-17',
  'verified', jsonb_build_object('label', 'Highest-Scoring Team', 'unit', 'FPTS'),
  timestamptz '2026-04-18 06:00:00-04'
from public.fantasy_teams team
where lower(team.team_name) = 'st thomas mallards'
on conflict do nothing;

insert into public.record_history (
  record_key, scope, fantasy_team_id, season_year, holder_type, holder_name,
  record_value, previous_value, period_start, period_end,
  verification_status, metadata, achieved_at
)
select
  'lowest-scoring-team', 'league', team.id, 2026, 'team', 'Toronto Ice Bears',
  3412.1, null, date '2025-10-06', date '2026-04-17',
  'verified', jsonb_build_object('label', 'Lowest-Scoring Team', 'unit', 'FPTS'),
  timestamptz '2026-04-18 06:00:00-04'
from public.fantasy_teams team
where lower(team.team_name) = 'toronto ice bears'
on conflict do nothing;

