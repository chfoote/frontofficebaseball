import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { fetchFantasyTeamByAbbreviation, type FantasyTeam } from "../../lib/fantasyTeams";
import { fetchRecordBookData, syncDailyRecordSnapshot, type ContractRecord, type FranchiseStatLine, type RecordBookEntry, type RecordHistoryEvent, type ScoringLeader } from "../../lib/recordBook";
import { fetchNhlPlayerLanding, getNhlStatsDate } from "../../lib/nhl";
import PositionBadge from "../../components/hockey/PositionBadge";

const seasons = [2027, 2026];
const categories = ["Leaders – Position", "Leaders – Positional by Franchise", "Franchise Records", "Seasonal – Positional Records", "Contracts"] as const;
type Category = typeof categories[number];

const playerPositionSections = [
  { code: "c", title: "Centers", labels: ["Top-Scoring C", "Lowest-Scoring C", "Top-Scoring Rookie C"] },
  { code: "lw", title: "Left Wings", labels: ["Top-Scoring LW", "Lowest-Scoring LW", "Top-Scoring Rookie LW"] },
  { code: "rw", title: "Right Wings", labels: ["Top-Scoring RW", "Lowest-Scoring RW", "Top-Scoring Rookie RW"] },
  { code: "d", title: "Defence", labels: ["Top-Scoring D", "Lowest-Scoring D", "Top-Scoring Rookie D"] },
  { code: "g", title: "Goalies", labels: ["Top-Scoring G", "Lowest-Scoring G", "Top-Scoring Rookie G"] },
] as const;

const contractPositionSections = [
  { code: "C", title: "Centers" },
  { code: "LW", title: "Left Wings" },
  { code: "RW", title: "Right Wings" },
  { code: "D", title: "Defence" },
  { code: "G", title: "Goalies" },
] as const;

const contractMoney = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const skaterRecordMetrics = [
  ["GP", "gamesPlayed"], ["G", "goals"], ["A", "assists"], ["P", "points"], ["+/-", "plusMinus"], ["PIM", "penaltyMinutes"], ["S", "shots"],
  ["PPG", "ppGoals"], ["PPA", "ppAssists"], ["SHG", "shGoals"], ["SHA", "shAssists"], ["GWG", "gameWinningGoals"],
  ["B", "blockedShots"], ["H", "hits"], ["FOW", "faceoffWins"], ["SCORE", "fantasyPoints"], ["FPPG", "pointsPerGame"],
] as const;
const goalieRecordMetrics = [
  ["GP", "gamesPlayed"], ["GS", "gamesStarted"], ["W", "wins"], ["L", "losses"], ["OTL", "otLosses"], ["GA", "goalsAgainst"],
  ["SV", "saves"], ["SO", "shutouts"], ["PIM", "penaltyMinutes"], ["G", "goals"], ["A", "assists"], ["SV%", "savePct"],
  ["GAA", "goalsAgainstAverage"], ["SCORE", "fantasyPoints"], ["FPPG", "pointsPerGame"],
] as const;

function FranchiseRecordsTable({ title, lines, previousLines, kind, limit }: { title: string; lines: FranchiseStatLine[]; previousLines: FranchiseStatLine[] | null; kind: "skater" | "goalie"; limit: 5 | 10 }) {
  const metrics = kind === "skater" ? skaterRecordMetrics : goalieRecordMetrics;
  const records = metrics.map(([label, field]) => {
    const eligible = lines.filter((line) => line[kind] && (field !== "goalsAgainstAverage" || Number(line[kind]?.gamesPlayed) > 0));
    const sortLines = (rows: FranchiseStatLine[]) => [...rows].sort((a, b) => {
      const left = Number(a[kind]?.[field as keyof NonNullable<FranchiseStatLine[typeof kind]>] || 0);
      const right = Number(b[kind]?.[field as keyof NonNullable<FranchiseStatLine[typeof kind]>] || 0);
      const difference = field === "goalsAgainstAverage" ? left - right : right - left;
      return difference || Number(b[kind]?.gamesPlayed || 0) - Number(a[kind]?.gamesPlayed || 0) || a.playerName.localeCompare(b.playerName);
    });
    const sorted = sortLines(eligible);
    const previousSorted = previousLines ? sortLines(previousLines.filter((line) => line[kind] && (field !== "goalsAgainstAverage" || Number(line[kind]?.gamesPlayed) > 0))) : null;
    return { label, field, leaders: sorted.slice(0, limit), previousSorted };
  });
  const formatValue = (field: string, value: number) => field === "savePct" ? value.toFixed(3).replace(/^0/, "") : field === "goalsAgainstAverage" ? value.toFixed(2) : value.toLocaleString("en-CA", { maximumFractionDigits: field === "fantasyPoints" || field === "pointsPerGame" ? 2 : 0 });
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]">
    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500">Top {limit} Record Holders</p><h2 className="text-xl font-black text-gray-900 dark:text-white">{title}</h2></div>
    <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">{records.map(({ label, field, leaders, previousSorted }) => <article key={label} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50"><div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]"><h3 className="text-lg font-black text-gray-900 dark:text-white">{label}</h3><span className="text-[10px] font-black uppercase tracking-wider text-brand-500">Top {limit}</span></div><ol className="divide-y divide-gray-200 dark:divide-gray-800">{Array.from({ length: kind === "goalie" ? leaders.length : limit }, (_, index) => { const leader = leaders[index]; const stat = leader?.[kind]; const first = leader?.seasons[0]; const last = leader?.seasons[leader.seasons.length - 1]; const moved = leader?.team && leader.currentTeam && leader.team.id !== leader.currentTeam.id; const previousIndex = leader && previousSorted ? previousSorted.findIndex((row) => row.key === leader.key) : -1; const rankChange = previousSorted && leader ? (previousIndex < 0 ? { direction: "up" as const, spots: null } : previousIndex !== index ? { direction: previousIndex > index ? "up" as const : "down" as const, spots: Math.abs(previousIndex - index) } : null) : null; const movementTitle = rankChange?.direction === "up" ? rankChange.spots ? `Moved up ${rankChange.spots} ${rankChange.spots === 1 ? "spot" : "spots"} in the last 24 hours` : "Entered the rankings in the last 24 hours" : rankChange ? `Moved down ${rankChange.spots} ${rankChange.spots === 1 ? "spot" : "spots"} in the last 24 hours` : ""; return <li key={leader?.key || `${label}-${index}`} className="grid min-h-16 grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5"><span className={`flex flex-col items-center text-center text-sm font-black ${index === 0 ? "text-brand-600 dark:text-brand-300" : "text-gray-400"}`}><span>#{index + 1}</span>{rankChange && <span title={movementTitle} aria-label={movementTitle} className={`mt-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] leading-none ${rankChange.direction === "up" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"}`}><span aria-hidden="true">{rankChange.direction === "up" ? "↑" : "↓"}</span>{rankChange.spots ?? "NEW"}</span>}</span>{leader ? <div className="min-w-0"><Link to={`/player-profile?playerId=${leader.playerId}`} className="block truncate text-sm font-bold text-gray-900 hover:text-brand-500 dark:text-white">{leader.playerName}</Link><div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-gray-500">{leader.team?.logo && <img src={leader.team.logo} alt={`${leader.team.team_name} logo`} className="h-4 w-4 object-contain" />}<span>{leader.team?.abbreviation || "—"}</span>{moved && <><span aria-label="now with" className="font-black text-brand-500">→</span>{leader.currentTeam?.logo && <img src={leader.currentTeam.logo} alt={`${leader.currentTeam.team_name} logo`} className="h-4 w-4 object-contain" />}<span>{leader.currentTeam?.abbreviation}</span></>}<span>·</span><span>{first === last ? first : `${first}–${last}`}</span></div></div> : <span className="text-sm font-semibold text-gray-400">Record spot available</span>}{rankChange && <span title={movementTitle} className={`inline-flex min-w-14 flex-col items-center justify-center rounded-lg border px-2 py-1 text-center font-black shadow-sm ${rankChange.direction === "up" ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300" : "border-red-300 bg-red-100 text-red-700 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-300"}`}><span className="text-lg leading-none" aria-hidden="true">{rankChange.direction === "up" ? "↑" : "↓"}</span><span className="mt-0.5 text-[9px] uppercase leading-none">{rankChange.direction === "up" ? rankChange.spots ? `Up ${rankChange.spots}` : "New" : `Down ${rankChange.spots}`}</span></span>}<span className="text-right text-base font-black text-brand-600 dark:text-brand-300">{stat ? formatValue(field, Number(stat[field as keyof typeof stat])) : "—"}</span></li>; })}</ol></article>)}</div>
  </section>;
}

function ContractRecordCard({ contract, rank, position, headshot }: { contract?: ContractRecord; rank: number; position: string; headshot?: string }) {
  if (!contract) return <article className="flex min-h-72 w-[82vw] max-w-[320px] shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center dark:border-gray-700 dark:bg-white/[0.02] sm:w-auto sm:max-w-none"><span className="text-3xl font-black text-gray-300 dark:text-gray-700">#{rank}</span><p className="mt-3 text-sm font-bold text-gray-400">Record spot available</p></article>;
  const moved = contract.signingTeam && contract.currentTeam && (contract.signingTeam.id !== contract.currentTeam.id || contract.signingTeam.team_name !== contract.currentTeam.team_name);
  return <article className="relative w-[82vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] sm:w-auto sm:max-w-none">
    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-brand-500" />
    <div className="p-5">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">#{rank} Contract</p><PositionBadge position={position} /></div><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-600 dark:bg-gray-800 dark:text-gray-300">Signed {contract.startSeason}</span></div>
      <Link to={`/player-profile?playerId=${contract.playerId}`} className="mx-auto mt-4 flex h-24 w-24 items-end justify-center overflow-hidden rounded-full bg-gradient-to-b from-gray-100 to-emerald-100 ring-1 ring-gray-200 dark:from-gray-800 dark:to-emerald-500/20 dark:ring-gray-700">{headshot ? <img src={headshot} alt={`${contract.playerName} headshot`} className="h-full w-full object-contain object-bottom" /> : <span className="mb-7 text-2xl font-black text-gray-400">{contract.playerName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}</Link>
      <Link to={`/player-profile?playerId=${contract.playerId}`} className="mt-3 block truncate text-center text-lg font-black text-gray-900 hover:text-brand-500 dark:text-white">{contract.playerName}</Link>
      <p className="mt-3 text-center text-[9px] font-black uppercase tracking-wider text-gray-400">{moved ? "Signed by · now with" : "Signed by"}</p>
      <div className="mt-1 flex min-h-9 items-center justify-center gap-2 text-xs font-bold text-gray-500">
        {contract.signingTeam?.logo && <img src={contract.signingTeam.logo} alt="" className="h-8 w-8 object-contain" />}
        <span>{contract.signingTeam?.abbreviation || "Unknown"}</span>
        {moved && <><span aria-label="traded to" className="text-base text-brand-500">→</span>{contract.currentTeam?.logo && <img src={contract.currentTeam.logo} alt="" className="h-8 w-8 object-contain" />}<span>{contract.currentTeam?.abbreviation}</span></>}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-900/70"><div><dt className="text-[9px] font-black uppercase tracking-wider text-gray-400">AAV</dt><dd className="mt-1 text-sm font-black text-gray-900 dark:text-white">{contractMoney.format(contract.aav)}</dd></div><div><dt className="text-[9px] font-black uppercase tracking-wider text-gray-400">Term</dt><dd className="mt-1 text-sm font-black text-gray-900 dark:text-white">{contract.years} {contract.years === 1 ? "year" : "years"}</dd></div><div className="col-span-2 border-t border-gray-200 pt-2 dark:border-gray-700"><dt className="text-[9px] font-black uppercase tracking-wider text-gray-400">Total value · {contract.startSeason}–{contract.endSeason}</dt><dd className="mt-1 text-xl font-black text-emerald-600 dark:text-emerald-300">{contractMoney.format(contract.totalValue)}</dd></div></dl>
    </div>
  </article>;
}

function LeaderCard({ leader, rank, position, headshot, franchiseView }: { leader?: ScoringLeader; rank: number; position: string; headshot?: string; franchiseView?: boolean }) {
  if (!leader) return <article className="flex min-h-72 w-[82vw] max-w-[320px] shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center dark:border-gray-700 dark:bg-white/[0.02] sm:w-auto sm:max-w-none"><span className="text-3xl font-black text-gray-300 dark:text-gray-700">#{rank}</span><p className="mt-3 text-sm font-bold text-gray-400">Leader spot available</p></article>;
  const firstSeason = leader.seasons[0];
  const lastSeason = leader.seasons[leader.seasons.length - 1];
  const seasonLabel = firstSeason === lastSeason ? String(firstSeason) : `${firstSeason}–${lastSeason}`;
  const movedFranchises = franchiseView && leader.team && leader.currentTeam && (leader.team.id !== leader.currentTeam.id || leader.team.team_name !== leader.currentTeam.team_name);
  return <article className="relative w-[82vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] sm:w-auto sm:max-w-none">
    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-brand-500 to-cyan-400" />
    <div className="p-5">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-500">#{rank} Leader</p><PositionBadge position={position} /></div><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-600 dark:bg-gray-800 dark:text-gray-300">{seasonLabel}</span></div>
      <Link to={`/player-profile?playerId=${leader.playerId}`} className="mx-auto mt-4 flex h-24 w-24 items-end justify-center overflow-hidden rounded-full bg-gradient-to-b from-gray-100 to-brand-100 ring-1 ring-gray-200 dark:from-gray-800 dark:to-brand-500/20 dark:ring-gray-700">{headshot ? <img src={headshot} alt={`${leader.playerName} headshot`} className="h-full w-full object-contain object-bottom" /> : <span className="mb-7 text-2xl font-black text-gray-400">{leader.playerName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}</Link>
      <Link to={`/player-profile?playerId=${leader.playerId}`} className="mt-3 block truncate text-center text-lg font-black text-gray-900 hover:text-brand-500 dark:text-white">{leader.playerName}</Link>
      {franchiseView && <p className="mt-3 text-center text-[9px] font-black uppercase tracking-wider text-gray-400">{movedFranchises ? "Franchise points · now with" : "Franchise points"}</p>}
      <div className={`${franchiseView ? "mt-1" : "mt-3"} flex min-h-9 items-center justify-center gap-2 text-xs font-bold text-gray-500`}>{leader.team?.logo && <img src={leader.team.logo} alt="" className="h-8 w-8 object-contain" />}<span>{leader.team?.abbreviation || "—"}</span>{movedFranchises && <><span aria-label="now with" className="text-base text-brand-500">→</span>{leader.currentTeam?.logo && <img src={leader.currentTeam.logo} alt="" className="h-8 w-8 object-contain" />}<span>{leader.currentTeam?.abbreviation}</span></>}</div>
      <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-900/70"><div><dt className="text-[9px] font-black uppercase tracking-wider text-gray-400">Games Played</dt><dd className="mt-1 text-sm font-black text-gray-900 dark:text-white">{leader.gamesPlayed.toLocaleString("en-CA")}</dd></div><div><dt className="text-[9px] font-black uppercase tracking-wider text-gray-400">Seasons</dt><dd className="mt-1 text-sm font-black text-gray-900 dark:text-white">{leader.seasons.length}</dd></div><div className="col-span-2 border-t border-gray-200 pt-2 dark:border-gray-700"><dt className="text-[9px] font-black uppercase tracking-wider text-gray-400">Fantasy Points</dt><dd className="mt-1 text-xl font-black text-brand-600 dark:text-brand-300">{leader.fantasyPoints.toLocaleString("en-CA", { maximumFractionDigits: 2 })}</dd></div></dl>
    </div>
  </article>;
}

function PlayerRecordCard({ entry, label, position, headshot }: { entry?: RecordBookEntry; label: string; position: string; headshot?: string }) {
  if (!entry) return <article className="relative flex min-h-64 w-[82vw] max-w-[320px] shrink-0 snap-start flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-white/[0.02] sm:w-auto sm:max-w-none"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Player Performance</p><h3 className="mt-1 font-bold text-gray-600 dark:text-gray-300">{label}</h3><div className="mt-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 text-3xl text-gray-400 dark:bg-gray-800">?</div><p className="mt-4 text-sm font-semibold text-gray-400">No eligible record yet</p></article>;
  const gp = entry.dateLabel?.match(/([\d,]+) GP/)?.[1];
  const season = entry.dateLabel?.match(/Season (\d+)/)?.[1];
  return <article className="relative w-[82vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] sm:w-auto sm:max-w-none"><div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-brand-500 to-cyan-400" /><div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-500">Player Performance</p><h3 className="mt-1 font-bold text-gray-900 dark:text-white">{entry.label}</h3></div>{season && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black text-gray-600 dark:bg-gray-800 dark:text-gray-300">{season}</span>}</div><div className="mt-5 flex items-center gap-4"><Link to={entry.playerId ? `/player-profile?playerId=${entry.playerId}` : "#"} className="flex h-24 w-24 shrink-0 items-end justify-center overflow-hidden rounded-full bg-gradient-to-b from-gray-100 to-brand-100 ring-1 ring-gray-200 dark:from-gray-800 dark:to-brand-500/20 dark:ring-gray-700">{headshot ? <img src={headshot} alt={`${entry.holder} headshot`} className="h-full w-full object-contain object-bottom" /> : <span className="mb-7 text-2xl font-black text-gray-400">{entry.holder.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}</Link><div className="min-w-0"><Link to={entry.playerId ? `/player-profile?playerId=${entry.playerId}` : "#"} className="block truncate text-lg font-black text-gray-900 hover:text-brand-500 dark:text-white">{entry.holder}</Link><div className="mt-2 flex items-center gap-2 text-xs font-semibold text-gray-500">{entry.team?.logo && <Link to={`/teams/${entry.team.id}`}><img src={entry.team.logo} alt={`${entry.team.team_name} logo`} className="h-7 w-7 object-contain" /></Link>}<span>{entry.team?.abbreviation || "—"}</span><PositionBadge position={position} /><span>· {gp || 0} GP</span></div><p className="mt-4 text-2xl font-black text-brand-600 dark:text-brand-300">{entry.formattedValue}</p></div></div></div></article>;
}

export default function RecordBook() {
  const { abbreviation } = useParams();
  const { isAdmin } = useAuth();
  const [team, setTeam] = useState<FantasyTeam | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [category, setCategory] = useState<Category>("Leaders – Position");
  const [entries, setEntries] = useState<RecordBookEntry[]>([]);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [positionLeaders, setPositionLeaders] = useState<ScoringLeader[]>([]);
  const [franchisePositionLeaders, setFranchisePositionLeaders] = useState<ScoringLeader[]>([]);
  const [franchiseStatLines, setFranchiseStatLines] = useState<FranchiseStatLine[]>([]);
  const [previousFranchiseStatLines, setPreviousFranchiseStatLines] = useState<FranchiseStatLine[] | null>(null);
  const [recordScope, setRecordScope] = useState<"league" | "franchise">("league");
  const [franchises, setFranchises] = useState<FantasyTeam[]>([]);
  const [selectedFranchiseId, setSelectedFranchiseId] = useState<number | null>(null);
  const [history, setHistory] = useState<RecordHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncDate, setSyncDate] = useState(getNhlStatsDate(-1));
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [headshots, setHeadshots] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let active = true;
    if (!abbreviation) { setTeam(null); return; }
    fetchFantasyTeamByAbbreviation(abbreviation).then((row) => { if (active) setTeam(row); }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [abbreviation]);

  const load = async () => {
    setLoading(true); setError("");
    try { const result = await fetchRecordBookData(team?.id || null, season); setEntries(result.entries); setContracts(result.contracts); setPositionLeaders(result.positionLeaders); setFranchisePositionLeaders(result.franchisePositionLeaders); setFranchiseStatLines(result.franchiseStatLines); setFranchises(result.teams); setHistory(result.history); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the Record Book."); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (abbreviation && !team) return; void load(); }, [season, team, abbreviation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (category !== "Franchise Records" || (abbreviation && !team)) return;
    let active = true;
    setPreviousFranchiseStatLines(null);
    // Compare the live standings with the end of the hockey day before last
    // night's games. Using -1 here includes those games on both sides once the
    // 6 a.m. rollover has passed, which makes genuine movement disappear.
    void fetchRecordBookData(team?.id || null, season, getNhlStatsDate(-2))
      .then((result) => { if (active) setPreviousFranchiseStatLines(result.franchiseStatLines); })
      .catch(() => { if (active) setPreviousFranchiseStatLines(null); });
    return () => { active = false; };
  }, [category, season, team, abbreviation]);

  const playerEntries = useMemo(() => entries.filter((entry) => entry.category === "Player Performance"), [entries]);
  const playerIds = useMemo(() => [...new Set([...playerEntries.map((entry) => entry.playerId), ...contracts.map((contract) => contract.playerId), ...positionLeaders.map((leader) => leader.playerId), ...franchisePositionLeaders.map((leader) => leader.playerId)].filter((id): id is string => Boolean(id)))], [playerEntries, contracts, positionLeaders, franchisePositionLeaders]);
  const title = team ? `${team.team_name} Record Book` : "League Record Book";

  useEffect(() => {
    if (team) { setSelectedFranchiseId(team.id); setRecordScope("franchise"); }
    else if (!selectedFranchiseId && franchises.length) setSelectedFranchiseId(franchises[0].id);
  }, [team, franchises, selectedFranchiseId]);

  useEffect(() => {
    let active = true;
    playerIds.forEach((id) => {
      if (headshots.has(id)) return;
      void fetchNhlPlayerLanding(Number(id)).then((landing) => { if (active && landing.headshot) setHeadshots((current) => new Map(current).set(id, landing.headshot!)); }).catch(() => {});
    });
    return () => { active = false; };
  }, [playerIds, headshots]);

  async function syncDateSnapshot() {
    setSyncing(true); setSyncMessage(""); setError("");
    try { const result = await syncDailyRecordSnapshot(syncDate); setSyncMessage(`Captured ${result.players} player performances across ${result.teams} teams for ${syncDate}.`); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to capture that hockey date."); }
    finally { setSyncing(false); }
  }

  return <div>
    <PageMeta title={`${title} | GLDHL`} description="Great Lakes Dynasty Hockey League records and milestones" />
    <PageBreadcrumb pageTitle={title} />
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-amber-950 p-6 text-white shadow-lg sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">GLDHL History</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Verified performances, franchise milestones, landmark contracts, and the names that set the standard.</p>
        <div className="mt-5 flex flex-wrap gap-3">{team ? <Link to="/record-book" className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20">View League Records</Link> : <span className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-slate-950">Permanent League History</span>}</div>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03] sm:p-4 lg:flex-row lg:items-end lg:justify-between"><div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${category === item ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>{item}</button>)}</div><label className="text-xs font-bold uppercase text-gray-500">Season<select value={season ?? "all"} onChange={(event) => setSeason(event.target.value === "all" ? null : Number(event.target.value))} className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-auto sm:min-w-32"><option value="all">All Time</option>{seasons.map((year) => <option key={year}>{year}</option>)}</select></label></div>

      {category === "Leaders – Positional by Franchise" && <section className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10"><label className="block text-xs font-black uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">Select Franchise<select value={selectedFranchiseId ?? ""} disabled={Boolean(team)} onChange={(event) => setSelectedFranchiseId(Number(event.target.value))} className="mt-2 block h-11 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm font-bold text-gray-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-brand-500/30 dark:bg-gray-900 dark:text-white sm:max-w-sm">{franchises.map((franchise) => <option key={franchise.id} value={franchise.id}>{franchise.team_name}</option>)}</select></label><p className="mt-2 text-xs text-brand-700 dark:text-brand-300">Only points earned for the selected franchise are included. Historical points stay with the team that owned the player at season’s end.</p></section>}

      {category === "Franchise Records" && <section className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10"><div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(team)} onClick={() => setRecordScope("league")} className={`rounded-lg px-4 py-2 text-sm font-black ${recordScope === "league" ? "bg-brand-600 text-white" : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-300"}`}>League All-Time</button><button type="button" onClick={() => setRecordScope("franchise")} className={`rounded-lg px-4 py-2 text-sm font-black ${recordScope === "franchise" ? "bg-brand-600 text-white" : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-300"}`}>By Franchise</button></div>{recordScope === "franchise" && <label className="mt-4 block text-xs font-black uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">Select Franchise<select value={selectedFranchiseId ?? ""} disabled={Boolean(team)} onChange={(event) => setSelectedFranchiseId(Number(event.target.value))} className="mt-2 block h-11 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm font-bold text-gray-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-brand-500/30 dark:bg-gray-900 dark:text-white sm:max-w-sm">{franchises.map((franchise) => <option key={franchise.id} value={franchise.id}>{franchise.team_name}</option>)}</select></label>}<p className="mt-3 text-xs text-brand-700 dark:text-brand-300">Stats are credited to the franchise that owned the player when they were earned, including players traded during a season.</p></section>}

      {isAdmin && !team && <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-bold text-blue-950 dark:text-blue-200">Daily Record Snapshot</h2><p className="mt-1 text-xs text-blue-700 dark:text-blue-300">Capture or safely re-run a completed hockey date. Dates roll over at 6:00 AM Eastern.</p></div><div className="flex gap-2"><input type="date" max={getNhlStatsDate(-1)} value={syncDate} onChange={(event) => setSyncDate(event.target.value)} className="h-10 rounded-lg border border-blue-200 bg-white px-3 text-sm dark:border-blue-500/30 dark:bg-gray-900" /><button type="button" disabled={syncing || !syncDate} onClick={() => void syncDateSnapshot()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{syncing ? "Capturing…" : "Capture Date"}</button></div></div>{syncMessage && <p className="mt-3 text-sm font-semibold text-success-700 dark:text-success-300">{syncMessage}</p>}</section>}

      {error && <p role="alert" className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</p>}
      {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />)}</div>
        : category === "Seasonal – Positional Records" ? <div className="space-y-5 sm:space-y-6">{playerPositionSections.map((section) => <section key={section.code} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]"><div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5 sm:py-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500">{season ? `${season} Seasonal Records` : "Seasonal Positional Records"}</p><h2 className="text-xl font-black text-gray-900 dark:text-white">{section.title}</h2><p className="mt-1 text-[10px] font-semibold uppercase text-gray-400 sm:hidden">Swipe to view records →</p></div><div className="flex snap-x snap-mandatory gap-4 overflow-x-auto p-4 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">{section.labels.map((label) => { const entry = playerEntries.find((candidate) => candidate.label === label); return <PlayerRecordCard key={label} entry={entry} label={label} position={section.code} headshot={entry?.playerId ? headshots.get(entry.playerId) : undefined} />; })}</div></section>)}</div>
        : category === "Contracts" ? <div className="space-y-5 sm:space-y-6">{contractPositionSections.map((section) => { const positionContracts = contracts.filter((contract) => contract.position === section.code); return <section key={section.code} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]"><div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5 sm:py-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">{season ? `${season} Contract Book` : "All-Time Contract Book"}</p><h2 className="text-xl font-black text-gray-900 dark:text-white">Top 5 {section.title}</h2><p className="mt-1 text-[10px] font-semibold uppercase text-gray-400 sm:hidden">Swipe to view contracts →</p></div><div className="flex snap-x snap-mandatory gap-4 overflow-x-auto p-4 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => { const contract = positionContracts[index]; return <ContractRecordCard key={contract?.key || `${section.code}-${index}`} contract={contract} rank={index + 1} position={section.code} headshot={contract ? headshots.get(contract.playerId) : undefined} />; })}</div></section>; })}</div>
        : category === "Franchise Records" ? (() => { const scoped = recordScope === "franchise" ? franchiseStatLines.filter((line) => line.team?.id === selectedFranchiseId) : franchiseStatLines; const previousScoped = previousFranchiseStatLines ? (recordScope === "franchise" ? previousFranchiseStatLines.filter((line) => line.team?.id === selectedFranchiseId) : previousFranchiseStatLines) : null; const scopeName = recordScope === "franchise" ? franchises.find((franchise) => franchise.id === selectedFranchiseId)?.team_name || "Franchise" : "League All-Time"; const limit = recordScope === "franchise" ? 10 as const : 5 as const; return <div className="space-y-5 sm:space-y-6"><FranchiseRecordsTable title={`${scopeName} · Skaters`} lines={scoped.filter((line) => line.skater)} previousLines={previousScoped?.filter((line) => line.skater) ?? null} kind="skater" limit={limit} /><FranchiseRecordsTable title={`${scopeName} · Goalies`} lines={scoped.filter((line) => line.goalie)} previousLines={previousScoped?.filter((line) => line.goalie) ?? null} kind="goalie" limit={limit} /></div>; })()
        : <div className="space-y-5 sm:space-y-6">{contractPositionSections.map((section) => { const franchiseView = category === "Leaders – Positional by Franchise"; const source = franchiseView ? franchisePositionLeaders.filter((leader) => leader.team?.id === selectedFranchiseId) : positionLeaders; const positionRows = source.filter((leader) => leader.position === section.code).slice(0, 5); return <section key={section.code} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]"><div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5 sm:py-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500">{season ? `${season} Leaders` : "All-Time Leaders"}</p><h2 className="text-xl font-black text-gray-900 dark:text-white">Top 5 {section.title}{franchiseView ? ` · ${franchises.find((franchise) => franchise.id === selectedFranchiseId)?.team_name || "Franchise"}` : ""}</h2><p className="mt-1 text-[10px] font-semibold uppercase text-gray-400 sm:hidden">Swipe to view leaders →</p></div><div className="flex snap-x snap-mandatory gap-4 overflow-x-auto p-4 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => { const leader = positionRows[index]; return <LeaderCard key={leader?.key || `${section.code}-${index}`} leader={leader} rank={index + 1} position={section.code} headshot={leader ? headshots.get(leader.playerId) : undefined} franchiseView={franchiseView} />; })}</div></section>; })}</div>}
      {!loading && history.length > 0 && <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-500">Record Progression</p><h2 className="text-xl font-black text-gray-900 dark:text-white">When history changed</h2></div><div className="divide-y divide-gray-100 dark:divide-gray-800">{history.map((event) => <article key={event.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-gray-900 dark:text-white">{event.holder_name}</p><p className="text-xs text-gray-500">{event.record_key.replace(/-/g, " ")} · {event.period_start || new Date(event.achieved_at).toLocaleDateString("en-CA")}</p></div><div className="text-left sm:text-right"><p className="font-black text-brand-600 dark:text-brand-300">{event.record_value.toLocaleString("en-CA", { maximumFractionDigits: 2 })}</p><p className="text-[10px] uppercase text-gray-400">{event.previous_value == null ? "First recorded mark" : `Previous: ${event.previous_value.toLocaleString("en-CA", { maximumFractionDigits: 2 })}`}</p></div></article>)}</div></section>}
    </div>
  </div>;
}
