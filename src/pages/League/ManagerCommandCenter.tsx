import { useEffect, useMemo, useState } from "react";
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
import { fetchLeagueTransactions, type LeagueTransaction } from "../../lib/transactions";

const activePositions = new Set(["C", "LW", "RW", "D", "G"]);
const capPositions = new Set([...activePositions, "W", "IR", "RETENTION", "BUYOUT"]);
const positionMinimums = { C: 3, LW: 3, RW: 3, D: 6, G: 2 } as const;
const rosterLimit = 23;
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function salaryCap(_year: number) {
  return 47_000_000;
}

function position(row: PlayerSeasonWithRelations) {
  return (row.position || "").toUpperCase();
}

function playerName(row: PlayerSeasonWithRelations) {
  return row.player?.full_name || [row.player?.first_name, row.player?.last_name].filter(Boolean).join(" ") || "Unknown player";
}

function relativeDate(value: string) {
  const time = new Date(value).getTime();
  const hours = Math.floor((Date.now() - time) / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function transactionLabel(transaction: LeagueTransaction) {
  if (transaction.trade_offer_id) return "Trade completed";
  const name = transaction.player?.full_name || "Player";
  const labels: Record<string, string> = {
    signed: `${name} signed`, called_up: `${name} called up`, waived: `${name} waived`,
    claimed: `${name} claimed`, bought_out: `${name} bought out`, retained: `${name} retained`,
    injured_reserve: `${name} placed on IR`, long_term_injured_reserve: `${name} placed on LTIR`,
    released_to_rfa_offer: `${name} released to RFA offer`, matched_rfa_offer: `${name} RFA offer matched`, competitive_balance_drafted: `${name} selected in Competitive Balance Draft`,
    traded: `${name} acquired`,
  };
  return labels[transaction.action] || `${name} updated`;
}

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
  const [transactions, setTransactions] = useState<LeagueTransaction[]>([]);
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
        const [rosterRows, previousSeasonRows, penaltyRows, adjustmentRows, auctionRows, offerRows, interestRows, transactionRows, branding] = await Promise.all([
          fetchPlayerSeasonsByTeamAndSeason(assigned.fantasy_team_id, season),
          fetchPlayerSeasonsBySeason(season - 1).catch(() => []),
          fetchBuyoutPenalties(season, assigned.fantasy_team_id).catch(() => []),
          fetchRetentionAdjustments(season, assigned.fantasy_team_id).catch(() => []),
          fetchAuctions(season).catch(() => []),
          fetchTradeOffers(season).catch(() => []),
          fetchPlayerTradeInterests(season).catch(() => []),
          fetchLeagueTransactions().catch(() => []),
          fetchTeamBrandingHistory().catch(() => []),
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
        setTransactions(transactionRows);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load your manager dashboard.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [season, user]);

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
  const missingPositions = (Object.keys(positionMinimums) as Array<keyof typeof positionMinimums>).map((code) => ({
    code,
    missing: Math.max(positionMinimums[code] - activeRoster.filter((row) => position(row) === code).length, 0),
  })).filter((item) => item.missing > 0);
  const activeAuctions = auctions.filter((auction) => !["completed", "cancelled"].includes(auction.status));
  const pendingOffers = offers.filter((offer) => offer.status === "pending" && [offer.from_team_id, offer.to_team_id, offer.third_team_id].includes(teamId || -1));
  const offersToReview = pendingOffers.filter((offer) => offer.to_team_id === teamId);
  const receivedInterest = interests.filter((interest) => interest.owner_team_id === teamId);
  const teamTransactions = useMemo(() => transactions.filter((transaction) => {
    if (!teamId) return false;
    if (transaction.fantasy_team_id === teamId) return true;
    const trade = transaction.trade_offer;
    return Boolean(trade && [trade.from_team?.id, trade.to_team?.id, trade.third_team?.id].includes(teamId));
  }).slice(0, 5), [teamId, transactions]);
  const managerName = assignment?.profile?.display_name || user?.email?.split("@")[0] || "Manager";

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
      <SummaryCard label="Active Roster" value={`${activeRoster.length} / ${rosterLimit}`} detail={missingPositions.length ? `${missingPositions.map((item) => `${item.code} ${item.missing}`).join(" · ")} still needed` : "Position minimums satisfied"} tone={activeRoster.length > rosterLimit ? "error" : missingPositions.length ? "warning" : "success"} />
      <SummaryCard label="Pending Trades" value={String(pendingOffers.length)} detail={offersToReview.length ? `${offersToReview.length} waiting for your response` : "No response required right now"} tone={offersToReview.length ? "warning" : "brand"} />
      <SummaryCard label="Active Auctions" value={String(activeAuctions.length)} detail={activeAuctions.length ? "Bidding is currently active" : "No players currently nominated"} tone={activeAuctions.length ? "warning" : "brand"} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-500">Your inbox</p><h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Needs attention</h2></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{offersToReview.length + receivedInterest.length + (missingPositions.length ? 1 : 0) + (restrictedFreeAgents.length ? 1 : 0) + (finalContractYear.length ? 1 : 0)}</span></div>
        <div className="space-y-3">
          {offersToReview.length > 0 && <ActionItem title={`${offersToReview.length} trade ${offersToReview.length === 1 ? "offer needs" : "offers need"} your response`} detail="Review the players, salary impact, and roster compliance before deciding." link="/trade-manager" linkLabel="Review trades" tone="warning" />}
          {receivedInterest.length > 0 && <ActionItem title={`${receivedInterest.length} expression${receivedInterest.length === 1 ? "" : "s"} of trade interest`} detail="Other managers have shown interest in players on your roster." link="/trade-market" linkLabel="View interest" />}
          {missingPositions.length > 0 && <ActionItem title="Your roster has open positions" detail={`Still needed: ${missingPositions.map((item) => `${item.missing} ${item.code}`).join(", ")}.`} link="/trade-market" linkLabel="Find players" tone="error" />}
          {restrictedFreeAgents.length > 0 && <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-violet-900 dark:text-violet-200">{restrictedFreeAgents.length} RFA decision{restrictedFreeAgents.length === 1 ? "" : "s"} due now</p><p className="mt-0.5 text-sm text-violet-700/80 dark:text-violet-300/80">These contracts have already expired. A qualifying offer keeps the player’s rights for one year.</p></div><Link to="/auction-house" className="shrink-0 text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300">Review RFA rights →</Link></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{restrictedFreeAgents.map(({ row, previousSalary, qualifyingOffer }) => <div key={row.id} className="rounded-lg border border-violet-200 bg-white px-3 py-2.5 dark:border-violet-500/30 dark:bg-gray-900"><p className="text-sm font-bold text-gray-900 dark:text-white">{playerName(row)}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{season - 1} salary: <strong className="text-gray-700 dark:text-gray-200">{previousSalary === null ? "Unavailable" : money.format(previousSalary)}</strong></p><p className="mt-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">Qualifying offer: {money.format(qualifyingOffer)} · 1 year</p></div>)}</div>
            <p className="mt-2 text-[11px] text-violet-600/75 dark:text-violet-300/70">Calculated at 50% of the previous salary, with a minimum qualifying salary of {money.format(500_000)}.</p>
          </div>}
          {finalContractYear.length > 0 && <ActionItem title={`${finalContractYear.length} player${finalContractYear.length === 1 ? " is" : "s are"} entering the final contract year`} detail={`${finalContractYear.slice(0, 3).map(playerName).join(", ")}${finalContractYear.length > 3 ? ` and ${finalContractYear.length - 3} more` : ""}. Under team control through the ${season} season; contracts expire afterward.`} link={`/teams/${teamId}`} linkLabel="View contract outlook" />}
          {offersToReview.length === 0 && receivedInterest.length === 0 && missingPositions.length === 0 && restrictedFreeAgents.length === 0 && finalContractYear.length === 0 && <div className="rounded-xl border border-dashed border-success-300 bg-success-50 p-7 text-center dark:border-success-500/30 dark:bg-success-500/10"><p className="font-bold text-success-700 dark:text-success-300">You’re all caught up.</p><p className="mt-1 text-sm text-success-600/80 dark:text-success-300/80">No urgent roster, contract, or trade decisions right now.</p></div>}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-gray-400">Around your team</p><h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Recent activity</h2></div><Link to="/transactions" className="text-xs font-semibold text-brand-500 hover:underline">View all</Link></div>
        {teamTransactions.length ? <div className="space-y-1">{teamTransactions.map((transaction) => <Link key={transaction.id} to={`/transactions#${transaction.trade_offer_id ? `trade-${transaction.trade_offer_id}` : `transaction-${transaction.id}`}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.04]"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{transactionLabel(transaction)}</p><p className="mt-0.5 text-xs text-gray-400">{transaction.notes || transaction.fantasy_team?.team_name || "League transaction"}</p></div><span className="shrink-0 text-[11px] font-medium text-gray-400">{relativeDate(transaction.created_at)}</span></Link>)}</div> : <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-700">No recent team transactions.</p>}
      </section>
    </div>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[{ label: "League Chat", detail: "Talk with other managers", to: "/league-chat" }, { label: "Standings", detail: "See the league race", to: "/standings" }, { label: "Auction House", detail: activeAuctions.length ? `${activeAuctions.length} active now` : "Check nominations", to: "/auction-house" }, { label: "League Overview", detail: "Compare cap and rosters", to: "/league-dashboard" }].map((item) => <Link key={item.to} to={item.to} className="group rounded-2xl border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/50"><p className="font-bold text-gray-900 group-hover:text-brand-500 dark:text-white">{item.label} →</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.detail}</p></Link>)}
    </section>
  </div>;
}
