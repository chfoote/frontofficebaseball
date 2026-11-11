# League awareness rollout

## Milestone 1: Poolsters identity and core ownership

Implemented in `20261109090000_establish_poolsters_league.sql`:

- Stable league UUID: `00000000-0000-4000-8000-000000000001`; slug: `poolsters`.
- A league registry and private memberships, separate from season/team assignments.
- Existing profile IDs become Poolsters members; existing platform admins are initially recorded as commissioners. These memberships do **not** yet replace the legacy authorization system.
- Existing and future legacy signups keep their existing Poolsters access. The automatic Poolsters enrollment trigger must be removed when invitations and platform-wide signup are introduced.
- Existing teams, player seasons/contracts, team assignments, and manager targets receive the Poolsters UUID. IDs, salaries, player identities, historical seasons, and foreign references are preserved.
- Composite contract/team and assignment/team foreign keys prohibit cross-league associations. Their original constraint names and single PostgREST relationships are preserved.
- The four tables remain restricted to Poolsters by database CHECK constraints. Other leagues cannot be enabled, even by a service-role write. The application also rejects unsupported league identities.
- Core data helpers explicitly filter Poolsters. Targets are scoped by league and user. Lab saves use league/user keys, and legacy Poolsters saves migrate once without overwriting an existing scoped save.
- League context loads the enabled registry record and the signed-in user's membership before loading the app layout. Existing links and sign-in URLs stay valid. The header identifies Poolsters and its season.

This milestone does **not** make the whole application multi-league safe. No league creation or switching UI is enabled.

## Deployment order

1. Run `npm run test:leagues`, `npm run build`, and lint the changed modules.
2. Inspect production constraints and migration history. The original FK names must match the migration. Dry-run only this migration; do not apply unrelated pending roster changes.
3. Apply the migration before publishing the frontend. It is transactional and backward compatible with the old application's inserts and upserts.
4. Verify row counts, core record IDs and values, league backfill, memberships, and the two team relationships. Check PostgREST embedded roster/assignment requests before publishing.
5. Deploy the app. Verify registered league identity, manager targets and existing saved Lab scenarios. A missing migration produces a retryable league loading error rather than silently reading data without a league.

Do not remove columns or revert the migration while the new frontend is live. If frontend rollback is required, the old frontend remains compatible with these additive columns and defaults.

## Remaining work before another league can be activated

1. Scope the remaining team-dependent metadata: branding, manager tenures, finishes, MLB affiliates, leadership, shared-player fantasy notes and trade-block flags.
2. Scope and authorize trades, trade items/interests/listings/dismissals, transactions, change logs, auctions and bids, initial signings, prospect rights, draft picks, buyouts and retention adjustments. Update all RPCs and triggers, including elevated database functions.
3. Scope league chat, awards, records, monthly honours, performance tables, notifications, email deliveries, Discord destinations, storage object paths, and background jobs. Separate real-world MLB records from fantasy achievements. Membership must not expose a user's other league memberships or private targets.
4. Replace platform-wide commissioner checks with league membership/role checks. Keep platform administrators separate. Enforce same-league relationships and database authorization on every write. Explicit app filters are necessary for users who belong to both leagues, in addition to RLS authorization.
5. Replace fixed Poolsters defaults and season/rule constants with explicit league arguments and validated per-league settings. Audit the current 23/27 roster-limit discrepancy rather than copying both into settings.
6. Replace global uniqueness rules with league-specific keys: team abbreviations, player/season contracts, user/season assignments, awards and targets. Update **all** existing ON CONFLICT statements, RPCs and clients before dropping legacy keys.
7. Introduce league URLs, a switcher, atomic state/cache resets, and manager invitations. Scope every local/session cache and restore deep links within the chosen league. Avoid mutable process-global active-league state.
8. Test a user in Poolsters only, another league only, both leagues, neither league, and a commissioner of only one. Exercise read/write/delete, direct API calls, RPCs, guessed foreign IDs, public routes, storage and outbound integrations.
9. Once all preceding checks pass, replace the temporary CHECK guards and signup enrollment with complete membership/visibility policies; introduce an atomic league creation/invitation workflow. Only then enable a Deli Shop test league.

## Data boundaries

Shared: authentication accounts, MLB player identity, official MLB statistics and genuine MLB achievements.

League-owned: fantasy teams, ownership, contracts, rights, league rules, fantasy records/awards, transactions and communications.

User **and** league-owned: targets and planning scenarios. A user can plan different contracts for the same MLB player in separate leagues.

The league's founding year must be separate from its first recorded season. Poolsters currently has a configured recorded-data range of 2026–2027; no missing historical seasons are fabricated.

## Current handoff status

The migration is implemented and passed an isolated PostgreSQL run using the
original core-table migrations. All 28 repository tests pass; the production
build and lint for changed modules pass. Production preflight confirmed the
expected team foreign keys and recorded fingerprints for 9 teams, 865 player
season records, 2 team assignments, and 31 private targets. These are validation
baselines, not hard-coded expectations in the migration.

With explicit user approval, the selective production run applied **only**
`20261109090000_establish_poolsters_league.sql`. The foundation run excluded the older Liberatore roster migration; the later
user-approved run of all pending migrations applied it together with site
administration. See `platform-administration.md`. The migration is recorded; all four record counts
and fingerprints (excluding the new league column) match their preflight
values. Three memberships were created. Public PostgREST league reads and
embedded roster/team and assignment/team/profile relationships return HTTP 200.

The frontend changes remain local. A clean Chrome session renders the public
teams page and sign-in page without JavaScript errors; the signed-out homepage
redirects correctly to sign-in. The app also has a root render-error fallback
with a reload button so component failures do not leave a blank screen.

An isolated browser session with mocked authentication/API fixtures also renders
the manager homepage, Roster Lab and batter stats without JavaScript errors. A
controlled component failure confirms the reload fallback is visible. These
fixture checks do not replace a real signed-in manager acceptance check.
