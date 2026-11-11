# League navigation and ownership: phases 1 and 2

## Implemented boundaries

League entry URLs use `/leagues/<slug>/front-office`, `/teams`, team detail
paths, and `/contracts` under the same prefix. The router basename preserves that
prefix for existing in-league links and navigation. Account/administration links
leave the league explicitly. Entering another league uses a full navigation,
clearing the previous React tree and captured requests. No mutable global active
league is used by data helpers. Unknown/inaccessible slugs show an error and do
not fall back to Poolsters.

The account dashboard, account profile, header search and sidebar distinguish
platform pages from an entered league. Platform pages do not preload Poolsters
team ownership as the user's implicitly selected league. Existing root-level
Poolsters bookmarks remain compatible aliases.

For setup leagues, only the core Front Office, teams and contracts workspace is
mounted. Other pages do not mount legacy loaders or mutate legacy workflows.
Setup access is distinct from `is_enabled`: the Poolsters-only full-gameplay
activation guard remains. The `core_setup_ready` capability appears atomically
with the migration; published clients can hide core setup until it is ready.

## Database migration

`20261110100000_scope_league_ownership.sql`:

- Replaces global keys with league-specific player/season contracts,
  user/season assignments, team/season assignments, private targets, and
  case-insensitive team abbreviations.
- Keeps shared MLB player identity. The same player can have different owners,
  salaries, terms and availability in separate leagues in the same season.
- Keeps composite team/contract and team/assignment foreign keys. Adds a
  membership/assignment foreign key and freezes league IDs on existing records.
  An update cannot move an existing team, contract, assignment or target into a
  different league.
- Replaces old permissive core policies with explicit per-league read/manage
  rules. Private setup records require membership or site authority. Poolsters'
  existing public roster viewing remains public. Targets remain user-private.
- Serializes core contract saves and team creation by league, enforces team
  capacity, rejects overlapping ownership, and writes multi-season contracts
  atomically. Releasing a commitment affects only the selected league and the
  owning team's remaining seasons; earlier seasons and other leagues remain.
- Retains scoped legacy Poolsters defaults only for backward-compatible callers.
  New core RPCs require an explicit league ID and check authority in the database.
- Creates private, append-only core audit records for team, contract and team
  access mutations. Private target estimates are not put in commissioner audits.

Contract projection now keys by **league and player**, never just player ID.
Core reads pass an explicit league ID; the all-season helper paginates rather
than silently truncating long contract histories at the API's row limit.

## Legacy RPC protection

Current production function definitions are retained in the private
`league_core_legacy_functions` table before modification. Existing legacy
reads/updates/deletes are redirected through the updatable, Poolsters-filtered
`poolsters_legacy` views. The views use invoker security and check options.
Legacy INSERT targets keep their real tables/defaults; conflict targets are
updated to the new composite keys. Existing function owners and grants remain.

The platform dashboard/directory/member administration functions keep their
explicit per-league queries, and member assignment upserts use the new key.
Legacy player-change and trade-market side effects skip other leagues, whose
core mutations receive separate audit records instead.

Guards on legacy tables with core foreign keys reject other leagues' teams or
contracts, including writes from elevated legacy RPCs. A disabled screen alone
is not treated as an authorization boundary.

## Validation

PostgreSQL tests exercise the same MLB player and same user in both leagues in
one season; independent salaries, ownership, targets and projections; duplicate
ownership rejection; atomic multi-year conflicts; guessed IDs; immutable league
IDs; commissioner rights in either direction; private data and audits; team
limits; and existing Poolsters RPCs, ON CONFLICT paths and trigger side effects.

Isolated Chrome sessions with fixture authentication/API data verify URL
preservation, different ownership for the same player, scoped contract payloads,
read-only manager controls, unknown-league failures, and that unsupported legacy
screens do not start their loaders. No demonstration league or contract was
created in production for testing.

## Release order and limits

1. Verify tests/build/lint and take a database backup plus core record counts.
2. Publish this frontend **before** the ownership migration. It supports the
   existing core schema; setup capability stays unavailable until the migration
   commits. Existing targets already have the composite index from the foundation
   migration, so the new client can use its scoped conflict target immediately.
3. Apply the ownership migration transactionally; check original row counts,
   existing Poolsters helper functions, private policies, and embedded PostgREST
   relationships. The migration preserves existing core records and IDs.
4. Ask signed-in managers to reload after cutover. Older open clients using the
   removed global ON CONFLICT keys must not be relied on after the migration.
5. Use a setup league to configure teams and contracts. Do not activate full
   gameplay until the remaining league rules, scoring and workflow isolation is
   implemented and tested.

The new core workspace currently uses the existing $250,000 minimum and five-year
contract maximum for roster setup. Per-league scoring/caps/eligibility rules,
auctions, trades, rights, buyouts, records, messaging and external integrations
remain later phases. It does not offer manager self-service signings or charging.

## Current handoff

Implementation and fixture verification are complete locally. The production
host returns the SPA shell for a league-specific deep link. A production dry
run lists only `20261110100000_scope_league_ownership.sql`; the migration is
**not applied**, and no production league, roster, membership or target was
changed by this milestone.

A safe cutover still requires publishing the matching frontend first, then
applying the migration and verifying production counts/roles/joins. Old global
conflict keys cannot remain valid while allowing independent ownership in
multiple leagues. Managers should reload after that coordinated release.
Setup readiness remains off in older schemas, keeping the new controls closed
until their migration is committed. The existing public frontend and production
ownership rules have been left unchanged.

Final local verification: all 45 repository tests pass; the production build,
changed-module lint, and whitespace checks pass. Browser fixture checks pass for
site administrators, commissioners, regular members, two independent league
ownership views, and unknown/blocked league routes.
