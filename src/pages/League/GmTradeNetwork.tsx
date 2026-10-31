import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { buildGmStats, buildGmTradeRelationships, type GmStats } from "../../lib/gmStats";
import { fetchAllTeamUserAssignments, type TeamUserAssignmentWithTeam } from "../../lib/teamUserAssignments";
import { fetchLeagueTransactions, type LeagueTransaction } from "../../lib/transactions";
import { TradeTransactionDetails } from "./Transactions";

type NodePosition = { manager: GmStats; x: number; y: number };
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

export default function GmTradeNetwork() {
  const [assignments, setAssignments] = useState<TeamUserAssignmentWithTeam[]>([]);
  const [transactions, setTransactions] = useState<LeagueTransaction[]>([]);
  const [season, setSeason] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedManagerId = searchParams.get("manager");
  const selectedPartnerId = searchParams.get("partner");

  useEffect(() => {
    Promise.all([fetchAllTeamUserAssignments(), fetchLeagueTransactions()])
      .then(([a, t]) => { setAssignments(a); setTransactions(t); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load the trade network."))
      .finally(() => setLoading(false));
  }, []);

  const seasons = useMemo(() => [...new Set(assignments.map((row) => row.season_year))].sort((a, b) => b - a), [assignments]);
  const managers = useMemo(() => buildGmStats(assignments, transactions, season === "all" ? null : season).filter((gm) => gm.trades > 0), [assignments, season, transactions]);
  const relationships = useMemo(() => buildGmTradeRelationships(managers, assignments, transactions, season === "all" ? null : season), [assignments, managers, season, transactions]);
  const positions = useMemo<NodePosition[]>(() => managers.map((manager, index) => {
    const angle = Math.PI * 2 * index / Math.max(managers.length, 1) - Math.PI / 2;
    return { manager, x: 450 + Math.cos(angle) * 330, y: 280 + Math.sin(angle) * 205 };
  }), [managers]);
  const positionById = new Map(positions.map((position) => [position.manager.userId, position]));
  const selectedManager = managers.find((manager) => manager.userId === selectedManagerId) || null;
  const selectedRelationship = relationships.find((relationship) => selectedManagerId && selectedPartnerId
    && [relationship.managerA.userId, relationship.managerB.userId].includes(selectedManagerId)
    && [relationship.managerA.userId, relationship.managerB.userId].includes(selectedPartnerId)) || null;
  const visibleRelationships = selectedManager ? relationships.filter((relationship) => [relationship.managerA.userId, relationship.managerB.userId].includes(selectedManager.userId)) : relationships;
  const visibleManagerIds = new Set(visibleRelationships.flatMap((relationship) => [relationship.managerA.userId, relationship.managerB.userId]));
  const maxTrades = Math.max(...relationships.map((relationship) => relationship.trades.length), 1);

  const selectPair = (a: string, b: string) => setSearchParams({ manager: a, partner: b });

  return <div>
    <PageMeta title="GM Trade Network | Great Lakes Dynasty" description="Trading relationships between GLDHL general managers" />
    <PageBreadcrumb pageTitle="GM Trade Network" />
    <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 via-slate-900 to-brand-950 p-6 text-white shadow-xl sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-brand-300">Front Office Connections</p><h1 className="mt-2 text-3xl font-black">Trade Network</h1><p className="mt-2 max-w-2xl text-sm text-gray-300">Explore every GM pairing. Thicker connections represent more completed trades.</p></div><label className="text-xs font-bold uppercase text-gray-300">Period<select value={season} onChange={(event) => { setSeason(event.target.value === "all" ? "all" : Number(event.target.value)); setSearchParams({}); }} className="mt-1 block h-11 min-w-36 rounded-xl border border-white/20 bg-gray-900 px-3 text-sm text-white"><option value="all">All-time</option>{seasons.map((year) => <option key={year}>{year}</option>)}</select></label></div></section>
    {loading && <div className="h-[560px] animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />}
    {error && <p className="rounded-xl bg-error-50 p-4 text-error-700">{error}</p>}
    {!loading && !error && relationships.length > 0 && <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div><h2 className="text-xl font-black text-gray-900 dark:text-white">League map</h2><p className="mt-1 text-xs text-gray-500">Select a GM or connection to explore it.</p></div>{selectedManager && <button type="button" onClick={() => setSearchParams({})} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300">Show entire league</button>}</div>
        <div className="overflow-x-auto bg-[radial-gradient(circle_at_center,_rgba(70,95,255,0.08),_transparent_65%)]"><svg viewBox="0 0 900 560" className="min-w-[700px]" role="img" aria-label="Interactive network of completed trades between general managers">
          {relationships.map((relationship) => { const from = positionById.get(relationship.managerA.userId); const to = positionById.get(relationship.managerB.userId); if (!from || !to) return null; const active = !selectedManager || visibleRelationships.includes(relationship); const chosen = selectedRelationship?.key === relationship.key; return <g key={relationship.key} onClick={() => selectPair(relationship.managerA.userId, relationship.managerB.userId)} className="cursor-pointer"><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={chosen ? "#465fff" : active ? "#98a2b3" : "#e4e7ec"} strokeWidth={chosen ? 8 : 1.5 + relationship.trades.length / maxTrades * 6} strokeOpacity={active ? 0.8 : 0.2} /><title>{relationship.managerA.displayName} and {relationship.managerB.displayName}: {relationship.trades.length} trades</title></g>; })}
          {positions.map(({ manager, x, y }) => { const active = !selectedManager || visibleManagerIds.has(manager.userId); const selected = manager.userId === selectedManagerId; return <g key={manager.userId} transform={`translate(${x} ${y})`} onClick={() => setSearchParams({ manager: manager.userId })} className="cursor-pointer" opacity={active ? 1 : 0.3}><circle r={selected ? 39 : 34} fill={selected ? "#465fff" : manager.teams[0]?.primaryColor || "#344054"} stroke="white" strokeWidth="5" /><text textAnchor="middle" dy="4" fill="white" fontSize="12" fontWeight="800">{manager.teams[0]?.abbreviation || manager.displayName.slice(0, 3).toUpperCase()}</text><text textAnchor="middle" y="54" className="fill-gray-700 dark:fill-gray-200" fontSize="12" fontWeight="700">{manager.displayName.length > 18 ? `${manager.displayName.slice(0, 16)}…` : manager.displayName}</text><title>{manager.displayName}: {manager.trades} completed trades</title></g>; })}
        </svg></div>
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-500">{selectedManager?.displayName || "League-wide"}</p><h2 className="mt-1 text-xl font-black text-gray-900 dark:text-white">Trading relationships</h2></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{visibleRelationships.length}</span></div>
        <div className="mt-4 max-h-[480px] space-y-2 overflow-y-auto">{visibleRelationships.map((relationship, index) => { const other = selectedManager ? (relationship.managerA.userId === selectedManager.userId ? relationship.managerB : relationship.managerA) : null; return <button key={relationship.key} type="button" onClick={() => selectPair(relationship.managerA.userId, relationship.managerB.userId)} className={`w-full rounded-xl border p-3 text-left transition ${selectedRelationship?.key === relationship.key ? "border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10" : "border-gray-200 hover:border-brand-200 dark:border-gray-800"}`}><div className="flex items-center justify-between gap-3"><p className="font-bold text-gray-900 dark:text-white"><span className="mr-2 text-xs text-gray-400">#{index + 1}</span>{other?.displayName || `${relationship.managerA.displayName} × ${relationship.managerB.displayName}`}</p><span className="text-sm font-black text-brand-600 dark:text-brand-300">{relationship.trades.length}</span></div><p className="mt-1 text-xs text-gray-500">{relationship.twoTeamTrades} two-team · {relationship.threeTeamTrades} three-team · {relationship.playersExchanged} player moves</p></button>; })}</div>
      </section>
    </div>}
    {!loading && !error && selectedRelationship && <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-500">Head-to-head history</p><h2 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{selectedRelationship.managerA.displayName} × {selectedRelationship.managerB.displayName}</h2><p className="mt-1 text-sm text-gray-500">{selectedRelationship.trades.length} trades · {selectedRelationship.playersExchanged} player moves · Last deal {dateLabel(selectedRelationship.lastTradeDate)}</p></div><div className="flex gap-2"><Link to={`/gms/${selectedRelationship.managerA.userId}`} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300">View {selectedRelationship.managerA.displayName}</Link><Link to={`/gms/${selectedRelationship.managerB.userId}`} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300">View {selectedRelationship.managerB.displayName}</Link></div></div>
      <div className="mt-5 space-y-4">{selectedRelationship.trades.map((transaction, index) => <article key={transaction.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wide text-gray-400">Trade #{selectedRelationship.trades.length - index}</span><Link to={`/transactions#trade-${transaction.trade_offer_id}`} className="text-xs font-semibold text-brand-500 hover:underline">{dateLabel(transaction.transaction_date)} →</Link></div><TradeTransactionDetails transaction={transaction} /></article>)}</div>
    </section>}
    {!loading && !error && !relationships.length && <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">No completed manager-to-manager trades were found for this period.</p>}
  </div>;
}
