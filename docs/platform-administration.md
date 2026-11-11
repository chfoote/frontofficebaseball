# Account dashboard and administration

This milestone adds the website account dashboard, site administration, and a
separate User Admin section. It requires the tested migration
`20261109120000_platform_league_admin.sql` before the new administration tools
can be used. Existing users and core roster data are retained.

## Roles and data boundaries

- Site administrators are recorded in `platform_admins`, independently of league
  memberships. The initial entry is the existing administrator whose canonical
  authentication email is `chfoote@icloud.com` and whose existing profile has the
  legacy administrator flag. No other account is promoted automatically.
- Site administrators see every league, register leagues in setup, appoint or
  demote commissioners, manage membership and team access, and edit global
  account names. There is no frontend API to grant platform administrator status.
- Commissioners manage members, league display names, and team assignments only
  in leagues where they have the commissioner membership. They cannot grant
  themselves site authority or appoint commissioners.
- Account owners and site administrators can edit global account names.
  Commissioners edit names in `league_memberships.display_name`, leaving global
  names and other leagues untouched. Profile reads require a shared league, the
  account itself, or platform authority.
- Legacy `is_admin()` now means site administrator or Poolsters commissioner.
  Draft-league commissioners do not gain legacy Poolsters privileges. The
  frontend reads these permissions from RPCs rather than trusting a profile flag.
- Removing membership also removes that user's team-access assignments in that
  league. It does not delete the user's account, rosters, targets, other league
  memberships, or manager-tenure history. At least one commissioner must remain.
- New registrations no longer automatically join Poolsters. Existing memberships
  remain. Adding a member requires an already-registered account's canonical
  email; no invitation emails are sent.

## Account dashboard

`/` lists the signed-in user's league memberships; platform administrators see
all leagues. Cards include MLB branding, the league logo/name, current season,
established year when recorded, the current-season assigned team, and an entry
button. Administrators without a team enter the league overview rather than a
manager's empty personal dashboard. The sidebar includes My Leagues.

Poolsters' founding year is not invented. Site administrators can enter it in
league details. The MLB mark is served from a local copy of MLB's official logo
asset (`https://www.mlbstatic.com/team-logos/league-on-dark/1.svg`).

## Administration screens

- `/admin/leagues`: league overview, setup registration with an existing
  commissioner, editable league name/logo/established year/team limit, registered
  account names, and links into each league's User Admin.
- `/admin/users?league=<uuid>`: member table, league-local names, season-specific
  team assignments, adding existing accounts, removing memberships, and
  commissioner appointment controls for site administrators only.
- Auction Admin retains auction operations. Account editing and team assignment
  controls have moved to User Admin; Auction Admin links to the new screen.

League creation is atomic and creates a **setup** league plus its commissioner.
It does not invent teams or copy Poolsters rosters. Setup leagues cannot enter
Poolsters by accident. The activation and core-write guards from the previous
milestone remain: other leagues cannot open for gameplay until all remaining
workflows, rules, and uniqueness constraints have been isolated. Team limit is
planned capacity, not a count of created teams.

No billing, subscription, fee collection, or payment provider is implemented.
The proposed per-league seasonal fee is intentionally deferred.

## Validation and rollout

Run `npm run test:leagues`, the full `tests/*.test.mjs` suite, build, and lint the
changed modules. SQL tests replay the original core schemas and legacy admin
policies, followed by both league migrations. They cover multi-league visibility,
role escalation, direct API writes, profile privacy, removal, last-commissioner
protection, atomic cross-league assignment rejection, and new signup behavior.

Isolated Chrome sessions with mocked API data exercise the manager dashboard,
site administrator dashboard, league creation form, member editing/addition,
and commissioner/site route separation. These are fixture tests, not live
changes or real memberships created for demonstration.

The homepage has a fallback to the already-deployed Poolsters API while the new
migration is pending. New admin pages show a setup message when their RPCs are
absent. Apply only the new administration migration, reload the authenticated
session, then verify the iCloud site administrator and Gmail manager views. The
Liberatore roster migration was subsequently included with explicit user approval
to apply all pending migrations. No second league
should be activated by this release.

## Current handoff status

Implementation is complete locally. All 34 repository tests pass, the production
build passes, and changed-file lint passes. Isolated browser checks pass for site
administrator, commissioner, and regular manager dashboards and admin forms.
The selective production dry run includes only
`20261109120000_platform_league_admin.sql`.

The user subsequently explicitly approved applying **all pending migrations**.
The production run applied both the Liberatore roster migration and this
administration migration. A follow-up full dry run reports no pending migrations.
Production verification confirms 9 teams, 865 roster/contract records, 31 targets,
3 memberships, and one platform administrator. Liberatore's LBO SP contract is
verified at $250,000 annually for 2027–2029. New signups no longer automatically
join Poolsters.

SELECT-only checks of the production dashboard functions confirm the iCloud
account has platform and Poolsters administration access and can list all three
registered accounts. The Gmail account is a regular manager and resolves to the
St Thomas Mallards. No demonstration league, member removal, or account rename
was performed in production. The frontend remains local; refresh the authenticated
session to load the new permissions. No payment integration or public frontend
deployment was performed.
