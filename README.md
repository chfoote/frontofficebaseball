# Front Office Baseball League

Standalone fantasy-baseball front office application for rosters, contracts,
trades, auctions, league administration, and MLB statistics.

## Project isolation

- This repository must use its own Supabase project.
- Local Supabase link metadata is intentionally not stored in the repository.
- Do not copy database passwords, service-role keys, function secrets, cron jobs,
  webhooks, or deployment environment variables from the hockey application.

Copy `.env.example` to `.env` only after creating the standalone Front Office
Baseball Supabase project.

## MLB data

The frontend already integrates with the public MLB Stats API in `src/lib/mlb.ts`
for games, box scores, batter statistics, pitcher statistics, and player profiles.
The off-speed implementation can still be compared before this client is treated
as final.
