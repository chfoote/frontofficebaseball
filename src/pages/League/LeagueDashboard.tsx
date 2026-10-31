import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { applyTeamBranding, fetchFantasyTeams, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { CURRENT_LEAGUE_SEASON, dashboardSeasons } from "../../lib/leagueSeasons";
import { fetchStandingsTeamOrder } from "../../lib/leagueStandings";

const salaryCap = 47_000_000;
const rosterLimit = 27;
const requirements = [
  ["C", 1], ["1B", 1], ["2B", 1], ["SS", 1], ["3B", 1],
  ["OF", 3], ["SP", 5], ["RP", 1], ["W", 1], ["IR", 1],
] as const;
// DH counts toward both roster and cap. Waiver and IR players count toward the
// cap and their dashboard position totals, but not the 27-player roster limit.
const capPositions = new Set<string>([
  ...requirements.map(([code]) => code),
  "DH",
]);
const nonRosterPositions = new Set(["W", "IR"]);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function position(row: PlayerSeasonWithRelations) {
  return (row.position || "").toUpperCase();
}

type DashboardRow = {
  team: FantasyTeam;
  rosterSize: number;
  salarySpent: number;
  counts: Record<string, number>;
};

export default function LeagueDashboard() {
  const [season, setSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [playerSeasons, setPlayerSeasons] = useState<PlayerSeasonWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([fetchFantasyTeams(), fetchTeamBrandingHistory(), fetchPlayerSeasonsBySeason(season), fetchStandingsTeamOrder(season)])
      .then(([teamRows, branding, seasonRows, standingsOrder]) => {
        if (!active) return;
        const order = new Map(standingsOrder.map((teamId, index) => [teamId, index]));
        setTeams(teamRows
          .map((team) => applyTeamBranding(team, branding, season))
          .sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)));
        setPlayerSeasons(seasonRows);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load dashboard.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [season]);

  const rows = useMemo<DashboardRow[]>(() => teams.map((team) => {
    const capRoster = playerSeasons.filter((row) => row.fantasy_team_id === team.id && capPositions.has(position(row)));
    return {
      team,
      rosterSize: capRoster.filter((row) => !nonRosterPositions.has(position(row))).length,
      salarySpent: capRoster.reduce((sum, row) => sum + (row.salary || 0), 0),
      counts: Object.fromEntries(requirements.map(([code]) => [code, capRoster.filter((row) => position(row) === code).length])),
    };
  }), [teams, playerSeasons]);

  return <div>
    <PageMeta title="League Dashboard | Front Office Baseball League" description="FOBL roster and salary dashboard" />
    <PageBreadcrumb pageTitle="League Dashboard" />
    <section className="rounded-2xl border border-gray-200 bg-white px-4 py-5 dark:border-gray-800 dark:bg-white/[0.03] xl:px-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Team Overview</h1><p className="mt-1 text-sm text-gray-500">Roster, payroll, and mandatory position minimums.</p></div>
        <label className="w-full text-sm font-medium text-gray-700 dark:text-gray-300 sm:w-44">Season
          <select value={season} onChange={(event) => setSeason(Number(event.target.value))} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-700 dark:bg-gray-900">
            {dashboardSeasons.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>
      {loading && <p className="py-12 text-center text-sm text-gray-500">Loading dashboard…</p>}
      {error && <p className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</p>}
      {!loading && !error && <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-white/[0.03]"><tr>
            <th className="px-3 py-3 text-left">Team</th><th className="px-3 py-3 text-center">Roster</th><th className="px-3 py-3 text-center">Salary Spent</th><th className="px-3 py-3 text-center">Cap Space</th>
            {requirements.map(([code, minimum]) => <th key={code} className="px-3 py-3 text-center">{code} / {minimum}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows.map((row) => <tr key={row.team.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
            <td className="px-3 py-3"><Link to={`/teams/${row.team.abbreviation}`} className="flex min-w-56 items-center gap-3 font-semibold text-gray-900 hover:text-brand-500 dark:text-white">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-xs font-black dark:border-gray-700 dark:bg-gray-900">{row.team.logo ? <img src={row.team.logo} alt="" className="h-full w-full object-contain" /> : row.team.abbreviation}</span>
              <span>{row.team.team_name}</span>
            </Link></td>
            <td className="px-3 py-3 text-center font-bold text-gray-700 dark:text-gray-200">{row.rosterSize} / {rosterLimit}</td>
            <td className="whitespace-nowrap px-3 py-3 text-center text-gray-700 dark:text-gray-200">
              <span className="block font-bold">{money.format(row.salarySpent)}</span>
              <span className="mt-0.5 block text-xs font-medium text-gray-400">of {money.format(salaryCap)}</span>
            </td>
            <td className={`whitespace-nowrap px-3 py-3 text-center font-bold ${row.salarySpent > salaryCap ? "text-error-600" : "text-gray-700 dark:text-gray-200"}`}>
              {row.salarySpent > salaryCap
                ? <><span className="block">{money.format(row.salarySpent - salaryCap)}</span><span className="block text-[10px] font-medium uppercase tracking-wide">Over cap</span></>
                : <><span className="block">{money.format(salaryCap - row.salarySpent)}</span><span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">Remaining</span></>}
            </td>
            {requirements.map(([code, minimum]) => { const count = row.counts[code] || 0; return <td key={code} className={`px-3 py-3 text-center font-bold ${count >= minimum ? "text-success-600" : "text-warning-600"}`}>{count} / {minimum}</td>; })}
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
