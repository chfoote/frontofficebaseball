insert into public.record_history (
  record_key, scope, fantasy_team_id, season_year, holder_type, holder_name,
  record_value, previous_value, period_start, period_end,
  verification_status, metadata, achieved_at
)
values (
  'lowest-scoring-team', 'league', 1, 2026, 'team', 'Toronto Ice Bears',
  3412.1, null, date '2025-10-06', date '2026-04-17',
  'verified', jsonb_build_object('label', 'Lowest-Scoring Team', 'unit', 'FPTS', 'historical_branding', true),
  timestamptz '2026-04-18 06:00:00-04'
)
on conflict do nothing;

