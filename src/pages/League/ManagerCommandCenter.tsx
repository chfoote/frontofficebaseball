import { useEffect, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { fetchAuctions, type Auction } from "../../lib/auctions";
import { fetchBuyoutPenalties, type BuyoutPenalty } from "../../lib/buyouts";
import { fetchRetentionAdjustments, type RetentionAdjustment } from "../../lib/retentions";
import { fetchPlayerSeasonsBySeason, fetchPlayerSeasonsByTeamAndSeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { applyTeamBranding, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { fetchUserTeamAssignment, fetchLatestUserTeamAssignment, type TeamUserAssignmentWithTeam } from "../../lib/teamUserAssignments";
import { fetchPlayerTradeInterests, type PlayerTradeInterest } from "../../lib/tradeMarket";
import { fetchTradeOffers, type TradeOffer } from "../../lib/tradeOffers";
import { fetchMlbStats, type MlbStatRecord } from "../../lib/mlb";

const activePositions = new Set(["C", "1B", "2B", "SS", "3B", "OF", "DH", "SP", "RP"]);
const capPositions = new Set([...activePositions, "W", "IR", "RETENTION", "BUYOUT"]);
const positionMinimums = [
  { code: "C", label: "Catcher", minimum: 1 },
  { code: "1B", label: "First Base", minimum: 1 },
  { code: "2B", label: "Second Base", minimum: 1 },
  { code: "SS", label: "Shortstop", minimum: 1 },
  { code: "3B", label: "Third Base", minimum: 1 },
  { code: "OF", label: "Outfield", minimum: 3 },
  { code: "DH", label: "Designated Hitter", minimum: 1 },
  { code: "SP", label: "Starting Pitcher", minimum: 5 },
  { code: "RP", label: "Relief Pitcher", minimum: 1 },
] as const;
const rosterLimit = 27;
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 });

type Production = { points: number; gamesPlayed: number; position: string };
type RfaPlan = { retain: boolean; salary: number; term: number };

function salaryCap(_year: number) {
  return 47_000_000;
}

function position(row: PlayerSeasonWithRelations) {
  return (row.position || "").toUpperCase();
}

function playerName(row: PlayerSeasonWithRelations) {
  return row.player?.full_name || [row.player?.first_name, row.player?.last_name].filter(Boolean).join(" ") || "Unknown player";
}

function normalizedName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function batterScore(record: MlbStatRecord) { return Number(record.stats.runs ?? 0) + Number(record.stats.hits ?? 0) + Number(record.stats.doubles ?? 0) + Number(record.stats.triples ?? 0) * 2 + Number(record.stats.homeRuns ?? 0) * 3 + Number(record.stats.rbi ?? 0) + Number(record.stats.stolenBases ?? 0) * 2; }
function pitcherScore(record: MlbStatRecord) { return Number(record.stats.wins ?? 0) * 8 + Number(record.stats.strikeOuts ?? 0) + Number(record.stats.saves ?? 0) * 6 + Number(record.stats.completeGames ?? 0) * 5 + Number(record.stats.shutouts ?? 0) * 5; }

function SummaryCard({ label, value, detail, tone = "brand" }: { label: string; value: string; detail: string; tone?: "brand" | "success" | "warning" | "error" }) {
  const tones = {
    brand: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300",
    success: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300",
    warning: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300",
    error: "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300",
  };
  return <div className={`rounded-2xl border p-4 ${tones[tone]}`}><p className="text-[11px] font-bold uppercase tracking-wider opacity-75">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="mt-1 text-xs font-medium opacity-75">{detail}</p></div>;
}

function ActionItem({ title, detail, link, linkLabel, tone = "brand" }: { title: string; detail: string; link: string; linkLabel: string; tone?: "brand" | "warning" | "error" }) {
  const dot = tone === "error" ? "bg-error-500" : tone === "warning" ? "bg-warning-500" : "bg-brand-500";
  return <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} /><div><p className="font-semibold text-gray-900 dark:text-white">{title}</p><p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{detail}</p></div></div><Link to={link} className="shrink-0 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">{linkLabel} →</Link></div>;
}

export default function ManagerCommandCenter() {
  const { user } = useAuth();
  const season = CURRENT_LEAGUE_SEASON;
  const [assignment, setAssignment] = useState<TeamUserAssignmentWithTeam | null>(null);
  const [team, setTeam] = useState<FantasyTeam | null>(null);
  const [roster, setRoster] = useState<PlayerSeasonWithRelations[]>([]);
  const [previousSeasonPlayers, setPreviousSeasonPlayers] = useState<PlayerSeasonWithRelations[]>([]);
  const [penalties, setPenalties] = useState<BuyoutPenalty[]>([]);
  const [retentionAdjustments, setRetentionAdjustments] = useState<RetentionAdjustment[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [interests, setInterests] = useState<PlayerTradeInterest[]>([]);
  const [production, setProduction] = useState<Map<string, Production>>(new Map());
  const [productionByName, setProductionByName] = useState<Map<string, Production>>(new Map());
  const [rfaPlans, setRfaPlans] = useState<Record<number, RfaPlan>>({});
  const [rfaPlansReady, setRfaPlansReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        const assigned = await fetchUserTeamAssignment(user.id, season) || await fetchLatestUserTeamAssignment(user.id);
        if (!active) return;
        setAssignment(assigned);
        if (!assigned?.fantasy_team_id) return;
        const [rosterRows, previousSeasonRows, penaltyRows, adjustmentRows, auctionRows, offerRows, interestRows, branding, mlbStats] = await Promise.all([
          fetchPlayerSeasonsByTeamAndSeason(assigned.fantasy_team_id, season),
          fetchPlayerSeasonsBySeason(season - 1).catch(() => []),
          fetchBuyoutPenalties(season, assigned.fantasy_team_id).catch(() => []),
          fetchRetentionAdjustments(season, assigned.fantasy_team_id).catch(() => []),
          fetchAuctions(season).catch(() => []),
          fetchTradeOffers(season).catch(() => []),
          fetchPlayerTradeInterests(season).catch(() => []),
          fetchTeamBrandingHistory().catch(() => []),
          Promise.all([fetchMlbStats("hitting", season - 1), fetchMlbStats("pitching", season - 1)]).catch(() => [[], []] as [MlbStatRecord[], MlbStatRecord[]]),
        ]);
        if (!active) return;
        setTeam(assigned.fantasy_team ? applyTeamBranding(assigned.fantasy_team, branding, season) : null);
        setRoster(rosterRows);
        setPreviousSeasonPlayers(previousSeasonRows);
        setPenalties(penaltyRows);
        setRetentionAdjustments(adjustmentRows);
        setAuctions(auctionRows);
        setOffers(offerRows);
        setInterests(interestRows);
        const byId = new Map<string, Production>();
        const byName = new Map<string, Production>();
        const [hitters, pitchers] = mlbStats;
        hitters.forEach((record) => { const item = { points: batterScore(record), gamesPlayed: Number(record.stats.gamesPlayed ?? 0), position: (record.position || "").toUpperCase() }; if (record.playerId) byId.set(String(record.playerId), item); byName.set(normalizedName(record.playerName), item); });
        pitchers.forEach((record) => { const item = { points: pitcherScore(record), gamesPlayed: Number(record.stats.gamesPlayed ?? 0), position: (record.position || "P").toUpperCase() }; if (record.playerId) byId.set(String(record.playerId), item); byName.set(normalizedName(record.playerName), item); });
        setProduction(byId);
        setProductionByName(byName);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load your manager dashboard.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [season, user]);

  useEffect(() => {
    if (!assignment?.fantasy_team_id) return;
    setRfaPlansReady(false);
    const key = `front-office-rfa-plan:${assignment.fantasy_team_id}:${season}`;
    try { setRfaPlans(JSON.parse(window.localStorage.getItem(key) || "{}")); } catch { setRfaPlans({}); }
    setRfaPlansReady(true);
  }, [assignment?.fantasy_team_id, season]);

  useEffect(() => {
    if (!assignment?.fantasy_team_id || !rfaPlansReady) return;
    window.localStorage.setItem(`front-office-rfa-plan:${assignment.fantasy_team_id}:${season}`, JSON.stringify(rfaPlans));
  }, [assignment?.fantasy_team_id, rfaPlans, rfaPlansReady, season]);

  const teamId = assignment?.fantasy_team_id;
  const activeRoster = roster.filter((row) => activePositions.has(position(row)));
  const payroll = roster.filter((row) => capPositions.has(position(row))).reduce((sum, row) => sum + (row.salary || 0), 0)
    + penalties.reduce((sum, row) => sum + row.amount, 0)
    + retentionAdjustments.reduce((sum, row) => sum + row.amount, 0);
  const capSpace = salaryCap(season) - payroll;
  const finalContractYear = roster.filter((row) => row.term_end_year === season && !["RFA", "PROSPECT", "AP"].includes(position(row)));
  const restrictedFreeAgents = roster.filter((row) => position(row) === "RFA").map((row) => {
    const previousSeason = previousSeasonPlayers.find((previous) => previous.player_id === row.player_id);
    const previousSalary = previousSeason?.salary ?? null;
    return {
      row,
      previousSalary,
      qualifyingOffer: Math.max(Math.round((previousSalary || 0) * 0.5), 500_000),
    };
  });
  const playerProduction = (row: PlayerSeasonWithRelations) => production.get(row.player?.player_api_id || "") || productionByName.get(normalizedName(playerName(row))) || { points: 0, gamesPlayed: 0, position: "" };
  const positionStatus = positionMinimums.map(({ code, label, minimum }) => {
    const players = activeRoster.filter((row) => position(row) === code).sort((a, b) => playerProduction(b).points - playerProduction(a).points);
    const current = players.length;
    return { code, label, minimum, current, players, missing: Math.max(minimum - current, 0) };
  });
  const missingPositions = positionStatus.filter((item) => item.missing > 0);
  const activeAuctions = auctions.filter((auction) => !["completed", "cancelled"].includes(auction.status));
  const pendingOffers = offers.filter((offer) => offer.status === "pending" && [offer.from_team_id, offer.to_team_id, offer.third_team_id].includes(teamId || -1));
  const offersToReview = pendingOffers.filter((offer) => offer.to_team_id === teamId);
  const receivedInterest = interests.filter((interest) => interest.owner_team_id === teamId);
  const managerName = assignment?.profile?.display_name || user?.email?.split("@")[0] || "Manager";
  const updateRfaPlan = (rowId: number, fallbackSalary: number, patch: Partial<RfaPlan>) => setRfaPlans((current) => ({ ...current, [rowId]: { ...(current[rowId] || { retain: false, salary: fallbackSalary, term: 1 }), ...patch } }));

  if (loading) return <div><PageMeta title="My Front Office | Great Lakes Dynasty" description="Your GLDHL manager dashboard" /><div className="grid animate-pulse gap-4"><div className="h-48 rounded-3xl bg-gray-200 dark:bg-gray-800" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800" />)}</div></div></div>;

  if (error) return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-error-700">{error}</div>;

  if (!teamId) return <div><PageMeta title="Manager Command Centre | Great Lakes Dynasty" description="Your GLDHL manager dashboard" /><div className="rounded-3xl border border-warning-200 bg-warning-50 p-8 text-center dark:border-warning-500/30 dark:bg-warning-500/10"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome to the Command Centre</h1><p className="mx-auto mt-2 max-w-xl text-sm text-gray-600 dark:text-gray-300">Your account is not assigned to a team for Season {season}. Once an administrator assigns your team, your roster, cap, trades, and auctions will appear here.</p><Link to="/league-chat" className="mt-5 inline-flex rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Open League Chat</Link></div></div>;

  return <div className="space-y-6">
    <PageMeta title="My Front Office | Great Lakes Dynasty" description="Your GLDHL manager dashboard" />
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 via-slate-900 to-brand-950 p-6 text-white shadow-xl sm:p-8">
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/95 p-1.5 shadow-lg">{team?.logo ? <img src={team.logo} alt={`${team.team_name} logo`} className="h-full w-full object-contain" /> : <span className="font-black text-gray-700">{team?.abbreviation}</span>}</div>
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-300">Season {season} · My Front Office</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Welcome back, {managerName}</h1><p className="mt-1 text-sm text-gray-300">{team?.team_name || "Your team"} · Here’s what needs your attention.</p></div>
        </div>
        <div className="flex flex-wrap gap-2"><Link to={`/teams/${teamId}`} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-100">View My Team</Link><Link to="/trade-manager" className="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15">Make a Trade</Link></div>
      </div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Cap Space" value={money.format(capSpace)} detail={`${money.format(payroll)} of ${money.format(salaryCap(season))} used`} tone={capSpace < 0 ? "error" : "success"} />
      <SummaryCard label="Active Roster" value={`${activeRoster.length} / ${rosterLimit}`} detail={missingPositions.length ? `${missingPositions.map((item) => `${item.missing} ${item.code}`).join(" · ")} still needed` : "Scoring-position minimums satisfied"} tone={activeRoster.length > rosterLimit ? "error" : missingPositions.length ? "warning" : "success"} />
      <SummaryCard label="Pending Trades" value={String(pendingOffers.length)} detail={offersToReview.length ? `${offersToReview.length} waiting for your response` : "No response required right now"} tone={offersToReview.length ? "warning" : "brand"} />
      <SummaryCard label="Active Auctions" value={String(activeAuctions.length)} detail={activeAuctions.length ? "Bidding is currently active" : "No players currently nominated"} tone={activeAuctions.length ? "warning" : "brand"} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-500">Your inbox</p><h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Needs attention</h2></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{offersToReview.length + receivedInterest.length + (finalContractYear.length ? 1 : 0)}</span></div>
        <div className="space-y-3">
          {offersToReview.length > 0 && <ActionItem title={`${offersToReview.length} trade ${offersToReview.length === 1 ? "offer needs" : "offers need"} your response`} detail="Review the players, salary impact, and roster compliance before deciding." link="/trade-manager" linkLabel="Review trades" tone="warning" />}
          {receivedInterest.length > 0 && <ActionItem title={`${receivedInterest.length} expression${receivedInterest.length === 1 ? "" : "s"} of trade interest`} detail="Other managers have shown interest in players on your roster." link="/trade-market" linkLabel="View interest" />}
          {finalContractYear.length > 0 && <ActionItem title={`${finalContractYear.length} player${finalContractYear.length === 1 ? " is" : "s are"} entering the final contract year`} detail={`${finalContractYear.slice(0, 3).map(playerName).join(", ")}${finalContractYear.length > 3 ? ` and ${finalContractYear.length - 3} more` : ""}. Under team control through the ${season} season; contracts expire afterward.`} link={`/teams/${teamId}`} linkLabel="View contract outlook" />}
          {offersToReview.length === 0 && receivedInterest.length === 0 && finalContractYear.length === 0 && <div className="rounded-xl border border-dashed border-success-300 bg-success-50 p-7 text-center dark:border-success-500/30 dark:bg-success-500/10"><p className="font-bold text-success-700 dark:text-success-300">Your inbox is clear.</p><p className="mt-1 text-sm text-success-600/80 dark:text-success-300/80">No new trade messages or expiring-contract reminders.</p></div>}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="mb-4"><p className="text-xs font-bold uppercase tracking-wider text-brand-500">Season {season}</p><h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Roster Planner</h2></div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]"><p className="text-[9px] font-black uppercase tracking-wide text-gray-400">Salary Cap</p><p className="mt-1 text-sm font-black text-gray-900 dark:text-white">{money.format(salaryCap(season))}</p></div>
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]"><p className="text-[9px] font-black uppercase tracking-wide text-gray-400">Committed</p><p className="mt-1 text-sm font-black text-gray-900 dark:text-white">{money.format(payroll)}</p></div>
          <div className={`rounded-xl p-3 ${capSpace < 0 ? "bg-error-50 dark:bg-error-500/10" : "bg-success-50 dark:bg-success-500/10"}`}><p className="text-[9px] font-black uppercase tracking-wide text-gray-400">{capSpace < 0 ? "Over Cap" : "Cap Space"}</p><p className={`mt-1 text-sm font-black ${capSpace < 0 ? "text-error-600" : "text-success-600"}`}>{money.format(Math.abs(capSpace))}</p></div>
        </div>
        <div className="mt-5"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-wider text-gray-500">Scoring Positions</h3><span className="text-[10px] font-bold text-gray-400">Select a position</span></div><div className="space-y-1.5">{positionStatus.map((item) => <details key={item.code} className={`group overflow-hidden rounded-lg ${item.missing ? "bg-warning-50 dark:bg-warning-500/10" : "bg-gray-50 dark:bg-white/[0.035]"}`}><summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 marker:hidden"><span className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-200"><span className="text-[10px] text-gray-400 transition group-open:rotate-90">▶</span>{item.label}</span><span className="flex items-center gap-2"><span className="text-xs font-black tabular-nums text-gray-700 dark:text-gray-200">{item.current} / {item.minimum}</span>{item.missing ? <span className="rounded-full bg-warning-100 px-2 py-0.5 text-[9px] font-black text-warning-700 dark:bg-warning-500/20 dark:text-warning-300">Need {item.missing}</span> : <span className="text-xs font-black text-success-500">✓</span>}</span></summary><div className="border-t border-gray-200/70 px-3 py-2 dark:border-gray-700/60">{item.players.length ? <div className="space-y-2">{item.players.map((row) => { const stats = playerProduction(row); const ppg = stats.gamesPlayed ? stats.points / stats.gamesPlayed : 0; const remainingTerm = row.term_end_year ? Math.max(row.term_end_year - season + 1, 1) : null; return <div key={row.id} className="rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-gray-900"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-gray-900 dark:text-white">{playerName(row)}</p><p className="shrink-0 text-[10px] font-black text-brand-600 dark:text-brand-300">{number.format(stats.points)} PTS · {number.format(ppg)} PPG</p></div><p className="mt-0.5 text-[10px] text-gray-500">{money.format(row.salary || 0)} · {remainingTerm ? `${remainingTerm} year${remainingTerm === 1 ? "" : "s"} remaining` : "Term unavailable"}</p></div>; })}</div> : <p className="py-2 text-center text-xs text-gray-500">No {item.label.toLowerCase()} currently assigned.</p>}</div></details>)}</div></div>
        <div className={`mt-5 rounded-xl border p-4 ${restrictedFreeAgents.length ? "border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10" : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]"}`}>
          <div className="flex items-center justify-between"><h3 className={`text-xs font-black uppercase tracking-wider ${restrictedFreeAgents.length ? "text-violet-700 dark:text-violet-300" : "text-gray-500"}`}>RFA Decisions</h3>{restrictedFreeAgents.length > 0 && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-black text-white">⚠ {restrictedFreeAgents.length} due</span>}</div>
          {restrictedFreeAgents.length ? <div className="mt-3 space-y-2">{restrictedFreeAgents.map(({ row, previousSalary, qualifyingOffer }) => { const plan = rfaPlans[row.id] || { retain: false, salary: qualifyingOffer, term: 1 }; return <details key={row.id} className="overflow-hidden rounded-lg border border-violet-200 bg-white dark:border-violet-500/30 dark:bg-gray-900"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 marker:hidden"><div><p className="text-sm font-bold text-gray-900 dark:text-white">{playerName(row)}</p><p className="mt-0.5 text-[10px] text-gray-500">Previous: {previousSalary === null ? "Unavailable" : money.format(previousSalary)} · QO: <strong className="text-violet-700 dark:text-violet-300">{money.format(qualifyingOffer)}</strong></p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${plan.retain ? "bg-success-100 text-success-700" : "bg-gray-100 text-gray-500"}`}>{plan.retain ? "RETAIN" : "UNDECIDED"}</span></summary><div className="border-t border-violet-100 p-3 dark:border-violet-500/20"><label className="flex cursor-pointer items-center gap-2 text-xs font-black text-violet-800 dark:text-violet-200"><input type="checkbox" checked={plan.retain} onChange={(event) => updateRfaPlan(row.id, qualifyingOffer, { retain: event.target.checked })} className="h-4 w-4 accent-violet-600" />Retain this player</label>{plan.retain && <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[10px] font-black uppercase text-gray-500">Annual salary<input type="number" min={qualifyingOffer} step="50000" value={plan.salary} onChange={(event) => updateRfaPlan(row.id, qualifyingOffer, { salary: Math.max(Number(event.target.value), qualifyingOffer) })} className="mt-1 h-9 w-full rounded-lg border border-gray-300 px-2 text-xs dark:border-gray-700 dark:bg-gray-950" /></label><label className="text-[10px] font-black uppercase text-gray-500">Term<select value={plan.term} onChange={(event) => updateRfaPlan(row.id, qualifyingOffer, { term: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-gray-300 px-2 text-xs dark:border-gray-700 dark:bg-gray-950">{[1,2,3,4,5].map((year) => <option key={year} value={year}>{year} year{year === 1 ? "" : "s"}</option>)}</select></label><button type="button" onClick={() => updateRfaPlan(row.id, qualifyingOffer, { retain: true, salary: qualifyingOffer, term: 1 })} className="col-span-2 rounded-lg bg-violet-100 px-3 py-2 text-[10px] font-black text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">Use 1-year qualifying offer · {money.format(qualifyingOffer)}</button></div>}</div></details>; })}</div> : <p className="mt-2 text-xs text-gray-500">No RFA decisions are currently due.</p>}
        </div>
      </section>
    </div>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[{ label: "League Chat", detail: "Talk with other managers", to: "/league-chat" }, { label: "Standings", detail: "See the league race", to: "/standings" }, { label: "Auction House", detail: activeAuctions.length ? `${activeAuctions.length} active now` : "Check nominations", to: "/auction-house" }, { label: "League Overview", detail: "Compare cap and rosters", to: "/league-dashboard" }].map((item) => <Link key={item.to} to={item.to} className="group rounded-2xl border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/50"><p className="font-bold text-gray-900 group-hover:text-brand-500 dark:text-white">{item.label} →</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.detail}</p></Link>)}
    </section>
  </div>;
}
