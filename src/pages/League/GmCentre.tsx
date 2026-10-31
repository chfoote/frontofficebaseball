import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { buildGmStats, type GmStats } from "../../lib/gmStats";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { fetchAllTeamUserAssignments, type TeamUserAssignmentWithTeam } from "../../lib/teamUserAssignments";
import { fetchLeagueTransactions, type LeagueTransaction } from "../../lib/transactions";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function formatSeasons(seasons: number[], teamId?: number) {
  if (teamId !== undefined && teamId >= 2 && teamId <= 10) return "2026–2027";
  const ordered = [...seasons].sort((a, b) => a - b);
  if (ordered.length === 2 && ordered[1] === ordered[0] + 1) return `${ordered[0]}–${ordered[1]}`;
  return ordered.join(", ");
}

function StatLeader({ label, manager, value }: { label: string; manager?: GmStats; value: (gm: GmStats) => string }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    {manager ? <><Link to={`/gms/${manager.userId}`} className="mt-2 block truncate text-lg font-black text-gray-900 hover:text-brand-500 dark:text-white">{manager.displayName}</Link><p className="mt-1 text-sm font-bold text-brand-600 dark:text-brand-300">{value(manager)}</p></> : <p className="mt-3 text-sm text-gray-400">No activity yet</p>}
  </div>;
}

function MobileManagerCard({ manager, allTime }: { manager: GmStats; allTime: boolean }) {
  const team = manager.teams[0];
  const stats = [
    ["Moves", manager.totalMoves],
    ["Trades", manager.trades],
    ["Acquired", manager.playersAcquired],
    ["Call-ups", manager.actions.called_up],
    ["Claims", manager.actions.claimed],
    ["Contracts", manager.contractsSigned],
  ];

  return <article className="p-4">
    <Link to={`/gms/${manager.userId}`} className="flex items-center gap-3">
      <span className="w-6 shrink-0 text-center text-xs font-black text-gray-400">#{team?.teamId}</span>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {team?.logo ? <img src={team.logo} alt="" className="h-full w-full object-contain p-1" /> : <span className="text-xs font-black text-gray-500">{team?.abbreviation}</span>}
      </span>
      <span className="min-w-0 flex-1"><span className="block truncate font-black text-gray-900 dark:text-white">{manager.displayName}</span><span className="mt-0.5 block truncate text-xs text-gray-500">{team?.teamName}{allTime ? ` · ${formatSeasons(manager.seasons, team?.teamId)}` : ""}</span></span>
      <span aria-hidden="true" className="text-xl text-gray-300">›</span>
    </Link>
    <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-700">
      {stats.map(([label, value]) => <div key={label} className="bg-gray-50 px-2 py-3 text-center dark:bg-gray-900"><dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</dt><dd className="mt-1 font-black text-gray-800 dark:text-gray-100">{value}</dd></div>)}
    </dl>
    <dl className="mt-3 grid grid-cols-2 gap-3">
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">AAV committed</dt><dd className="mt-1 text-sm font-bold text-gray-700 dark:text-gray-300">{money.format(manager.totalAavCommitted)}</dd></div>
      <div className="text-right"><dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Total value</dt><dd className="mt-1 text-sm font-black text-brand-600 dark:text-brand-300">{money.format(manager.totalContractValue)}</dd></div>
    </dl>
  </article>;
}

export default function GmCentre() {
  const [assignments, setAssignments] = useState<TeamUserAssignmentWithTeam[]>([]);
  const [transactions, setTransactions] = useState<LeagueTransaction[]>([]);
  const [season, setSeason] = useState<number | "all">("all");
  const [hideInactive, setHideInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchAllTeamUserAssignments(), fetchLeagueTransactions()])
      .then(([assignmentRows, transactionRows]) => { setAssignments(assignmentRows); setTransactions(transactionRows); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load GM records."))
      .finally(() => setLoading(false));
  }, []);

  const availableSeasons = useMemo(() => [...new Set(assignments.map((row) => row.season_year))].sort((a, b) => b - a), [assignments]);
  const managers = useMemo(() => buildGmStats(assignments, transactions, season === "all" ? null : season), [assignments, transactions, season]);
  const visibleManagers = useMemo(() => season === "all" && hideInactive
    ? managers.filter((manager) => manager.seasons.includes(CURRENT_LEAGUE_SEASON))
    : managers, [hideInactive, managers, season]);
  const managersByTeam = useMemo(() => [...visibleManagers].sort((a, b) =>
    (a.teams[0]?.teamId ?? Number.MAX_SAFE_INTEGER) - (b.teams[0]?.teamId ?? Number.MAX_SAFE_INTEGER)
    || Math.min(...a.seasons) - Math.min(...b.seasons)
    || a.displayName.localeCompare(b.displayName),
  ), [visibleManagers]);
  const leader = (score: (gm: GmStats) => number) => [...visibleManagers].sort((a, b) => score(b) - score(a))[0];

  return <div>
    <PageMeta title="GM Records | Great Lakes Dynasty" description="GLDHL general manager records and activity" />
    <PageBreadcrumb pageTitle="GM Records" />
    <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 via-slate-900 to-brand-950 p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-brand-300">Front Office Records</p><h1 className="mt-2 text-3xl font-black">GM Records</h1><p className="mt-2 max-w-2xl text-sm text-gray-300">Every completed trade, signing and roster decision attributed to the manager who controlled the franchise that season.</p></div><label className="text-xs font-bold uppercase tracking-wide text-gray-300">Record period<select value={season} onChange={(event) => setSeason(event.target.value === "all" ? "all" : Number(event.target.value))} className="mt-1 block h-11 min-w-40 rounded-xl border border-white/20 bg-gray-900 px-3 text-sm font-semibold text-white"><option value="all">All-time</option>{availableSeasons.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div>
    </section>

    {loading && <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800" />)}</div>}
    {error && <p className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</p>}
    {!loading && !error && <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {season === "all" ? <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-theme-xs dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300"><input type="checkbox" checked={hideInactive} onChange={(event) => setHideInactive(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />Hide inactive teams</label> : <span />}
        <Link to="/gm-trade-network" className="inline-flex rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-theme-xs hover:bg-brand-600">Explore the Trade Network →</Link>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatLeader label="Most active" manager={leader((gm) => gm.totalMoves)} value={(gm) => `${gm.totalMoves} official moves`} />
        <StatLeader label="The dealmaker" manager={leader((gm) => gm.trades)} value={(gm) => `${gm.trades} completed trades`} />
        <StatLeader label="Contracts awarded" manager={leader((gm) => gm.contractsSigned)} value={(gm) => `${gm.contractsSigned} contracts`} />
        <StatLeader label="Total value committed" manager={leader((gm) => gm.totalContractValue)} value={(gm) => money.format(gm.totalContractValue)} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><h2 className="text-xl font-black text-gray-900 dark:text-white">Manager records</h2><p className="mt-1 text-sm text-gray-500">Activity totals are calculated from official league records.</p></div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">{managersByTeam.map((gm) => <MobileManagerCard key={gm.userId} manager={gm} allTime={season === "all"} />)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-white/[0.03]"><tr>{["GM", "Moves", "Trades", "Acquired", "Call-ups", "Claims", "Buyouts", "Contracts", "AAV committed", "Total value"].map((label) => <th key={label} className={`whitespace-nowrap px-4 py-3 font-bold ${label === "GM" ? "text-left" : "text-center"}`}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{managersByTeam.map((gm) => { const currentTeam = gm.teams[0]; return <tr key={gm.userId} className="transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"><td className="px-4 py-4"><Link to={`/gms/${gm.userId}`} className="flex min-w-56 items-center gap-3"><span className="w-6 shrink-0 text-center text-xs font-black text-gray-400">#{currentTeam?.teamId}</span><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">{currentTeam?.logo ? <img src={currentTeam.logo} alt="" className="h-full w-full object-contain p-1" /> : <span className="text-xs font-black text-gray-500">{currentTeam?.abbreviation}</span>}</div><div><p className="font-bold text-gray-900 hover:text-brand-500 dark:text-white">{gm.displayName}</p><p className="text-xs text-gray-400">{season === "all" ? `${currentTeam?.teamName} · ${formatSeasons(gm.seasons, currentTeam?.teamId)}` : currentTeam?.teamName}</p></div></Link></td>
            {[gm.totalMoves, gm.trades, gm.playersAcquired, gm.actions.called_up, gm.actions.claimed, gm.actions.bought_out, gm.contractsSigned].map((value, index) => <td key={index} className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-300">{value}</td>)}<td className="whitespace-nowrap px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-300">{money.format(gm.totalAavCommitted)}</td><td className="whitespace-nowrap px-4 py-4 text-center font-bold text-brand-600 dark:text-brand-300">{money.format(gm.totalContractValue)}</td></tr>; })}</tbody>
        </table></div>
        {!visibleManagers.length && <p className="p-8 text-center text-sm text-gray-500">No manager assignments were found for this period.</p>}
      </section>
      <p className="mt-4 text-xs text-gray-400">Contracts include official signings and matched RFA offers. Total value is AAV multiplied by the recorded contract term. Administrative entries are attributed to the manager assigned to that team and season.</p>
    </>}
  </div>;
}
