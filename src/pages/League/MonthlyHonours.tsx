import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { applyTeamBranding, fetchFantasyTeams, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import { fetchNhlGoalieStatsForPeriod, fetchNhlPlayerLanding, fetchNhlSkaterStatsForPeriod, formatFantasyPoints, getGoalieScore, getSkaterScore } from "../../lib/nhl";
import { fetchLeagueTransactions, type LeagueTransaction } from "../../lib/transactions";
import { syncMonthlyHonours } from "../../lib/awards";
import { useAuth } from "../../context/AuthContext";
import PositionBadge from "../../components/hockey/PositionBadge";
import { CURRENT_LEAGUE_SEASON, playedAndCurrentSeasons } from "../../lib/leagueSeasons";

type HonourCategory = "Forward" | "Defenceman" | "Goalie";
type MonthlyWinner = { month: string; monthIndex: number; category: HonourCategory; season: PlayerSeasonWithRelations; team: FantasyTeam; gamesPlayed: number; points: number };
type CachedHeadshot = { url: string; savedAt: number };

const seasons = playedAndCurrentSeasons;
const months = ["October", "November", "December", "January", "February", "March", "April"];
const headshotCacheKey = "award-headshots-v1";
const headshotCacheAge = 24 * 60 * 60 * 1000;
const categoryStyle: Record<HonourCategory, { icon: string; gradient: string }> = {
  Forward: { icon: "🏒", gradient: "from-amber-400 to-orange-500" },
  Defenceman: { icon: "🛡️", gradient: "from-blue-400 to-indigo-600" },
  Goalie: { icon: "🥅", gradient: "from-cyan-400 to-sky-600" },
};

function nhlSeasonId(year: number) { return (year - 1) * 10000 + year; }
function formatDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function monthRange(season: number, index: number) {
  const calendarMonth = index < 3 ? index + 10 : index - 2;
  const year = index < 3 ? season - 1 : season;
  return {
    start: season === 2027 && index === 0 ? `${year}-09-29` : formatDate(new Date(year, calendarMonth - 1, 1)),
    end: formatDate(new Date(year, calendarMonth, 0)),
  };
}
function monthLabel(season: number, month: string) {
  return season === 2027 && month === "October" ? "September / October" : month;
}
function playerName(row: PlayerSeasonWithRelations) { return row.player?.full_name || [row.player?.first_name, row.player?.last_name].filter(Boolean).join(" ") || "Unknown player"; }
function readHeadshotCache(): Record<string, CachedHeadshot> {
  try { return JSON.parse(localStorage.getItem(headshotCacheKey) || "{}") as Record<string, CachedHeadshot>; }
  catch { return {}; }
}
function historicalTeamId(row: PlayerSeasonWithRelations, transactions: LeagueTransaction[], asOfDate: string) {
  let teamId = row.fantasy_team_id;
  transactions.filter((transaction) => transaction.season_year === row.season_year && transaction.transaction_type === "trade" && transaction.transaction_date > asOfDate)
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
    .forEach((transaction) => {
      const move = transaction.trade_offer?.trade_offer_players.find((candidate) => candidate.player_season?.player_id === row.player_id);
      if (move) teamId = move.from_team_id;
    });
  return teamId;
}

export default function MonthlyHonours() {
  const { isAdmin } = useAuth();
  const [season, setSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [winners, setWinners] = useState<MonthlyWinner[]>([]);
  const [headshots, setHeadshots] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const ranges = months.map((month, index) => ({ month, ...monthRange(season, index) }));
    Promise.all([
      fetchFantasyTeams(), fetchTeamBrandingHistory(), fetchPlayerSeasonsBySeason(season), fetchLeagueTransactions(),
      ...ranges.map(async (range) => ({ range, skaters: await fetchNhlSkaterStatsForPeriod(nhlSeasonId(season), range.start, range.end), goalies: await fetchNhlGoalieStatsForPeriod(nhlSeasonId(season), range.start, range.end) })),
    ]).then(([teamRows, branding, seasonRows, transactionRows, ...statResults]) => {
      if (!active) return;
      const teams = (teamRows as FantasyTeam[]).map((team) => applyTeamBranding(team, branding as Awaited<ReturnType<typeof fetchTeamBrandingHistory>>, season));
      const teamMap = new Map(teams.map((team) => [team.id, team]));
      const roster = seasonRows as PlayerSeasonWithRelations[];
      const transactions = transactionRows as LeagueTransaction[];
      const results: MonthlyWinner[] = [];
      statResults.forEach(({ range, skaters, goalies }, monthIndex) => {
        if (range.end >= formatDate(new Date())) return;
        const rosterAtEnd = roster.map((row) => ({ ...row, fantasy_team_id: historicalTeamId(row, transactions, range.end) }));
        const seasonByApiId = new Map(rosterAtEnd.map((row) => [row.player?.player_api_id || "", row]));
        const skaterCandidates = skaters.map((record) => ({ record, season: seasonByApiId.get(String(record.playerId)), points: getSkaterScore(record) }))
          .filter((item): item is typeof item & { season: PlayerSeasonWithRelations } => Boolean(item.season?.fantasy_team_id && item.record.gamesPlayed));
        const goalieCandidates = goalies.map((record) => ({ record, season: seasonByApiId.get(String(record.playerId)), points: getGoalieScore(record) }))
          .filter((item): item is typeof item & { season: PlayerSeasonWithRelations } => Boolean(item.season?.fantasy_team_id && item.record.gamesPlayed));
        const addWinner = (category: HonourCategory, candidates: typeof skaterCandidates | typeof goalieCandidates) => {
          const winner = [...candidates].sort((a, b) => b.points - a.points || b.record.gamesPlayed - a.record.gamesPlayed)[0];
          const team = winner ? teamMap.get(winner.season.fantasy_team_id!) : null;
          if (winner && team) results.push({ month: range.month, monthIndex, category, season: winner.season, team, gamesPlayed: winner.record.gamesPlayed, points: winner.points });
        };
        addWinner("Forward", skaterCandidates.filter((item) => ["C", "LW", "RW"].includes((item.season.position || "").toUpperCase())));
        addWinner("Defenceman", skaterCandidates.filter((item) => (item.season.position || "").toUpperCase() === "D"));
        addWinner("Goalie", goalieCandidates);
      });
      setWinners(results);
      if (isAdmin) void syncMonthlyHonours(results.map((winner) => ({
        season_year: season,
        month_index: winner.monthIndex,
        category: winner.category.toLowerCase() as "forward" | "defenceman" | "goalie",
        player_id: winner.season.player_id,
        fantasy_team_id: winner.team.id,
        games_played: winner.gamesPlayed,
        fantasy_points: winner.points,
      }))).catch(() => {});
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load monthly honours."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAdmin, season]);

  const winnerIds = useMemo(() => [...new Set(winners.map((winner) => winner.season.player?.player_api_id).filter((id): id is string => Boolean(id)))], [winners]);
  useEffect(() => {
    let active = true;
    const cache = readHeadshotCache();
    const cached = winnerIds.filter((id) => cache[id]?.url && Date.now() - cache[id].savedAt < headshotCacheAge).map((id) => [id, cache[id].url] as const);
    if (cached.length) setHeadshots((current) => new Map([...current, ...cached]));
    winnerIds.forEach((id) => {
      if (cache[id]?.url && Date.now() - cache[id].savedAt < headshotCacheAge) return;
      void fetchNhlPlayerLanding(Number(id)).then((landing) => {
        if (!active || !landing.headshot) return;
        setHeadshots((current) => new Map(current).set(id, landing.headshot!));
        try { const latest = readHeadshotCache(); latest[id] = { url: landing.headshot, savedAt: Date.now() }; localStorage.setItem(headshotCacheKey, JSON.stringify(latest)); } catch { /* Render without persistent cache. */ }
      }).catch(() => {});
    });
    return () => { active = false; };
  }, [winnerIds]);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"><div><h2 className="text-xl font-black text-gray-900 dark:text-white">Monthly Honours</h2><p className="mt-1 text-sm text-gray-500">Automatically awarded from official fantasy points for each award month.</p></div><label className="text-xs font-bold uppercase text-gray-500">Season<select value={season} onChange={(event) => setSeason(Number(event.target.value))} className="mt-1 block h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white">{seasons.map((year) => <option key={year}>{year}</option>)}</select></label></div>
    {loading && <div className="grid animate-pulse gap-5 md:grid-cols-3"><div className="h-56 rounded-2xl bg-gray-100 dark:bg-gray-800" /><div className="h-56 rounded-2xl bg-gray-100 dark:bg-gray-800" /><div className="h-56 rounded-2xl bg-gray-100 dark:bg-gray-800" /></div>}
    {error && <p role="alert" className="rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p>}
    {!loading && !error && [...months].reverse().map((month) => {
      const monthWinners = winners.filter((winner) => winner.month === month);
      if (!monthWinners.length) return null;
      return <section key={month} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">{season} Monthly Honours</p><h3 className="text-xl font-black text-gray-900 dark:text-white">{monthLabel(season, month)}</h3></div><div className="grid divide-y divide-gray-200 md:grid-cols-3 md:divide-x md:divide-y-0 dark:divide-gray-800">{monthWinners.map((winner) => {
        const apiId = winner.season.player?.player_api_id || "";
        const style = categoryStyle[winner.category];
        const countAtThisWin = winners.filter((candidate) => candidate.season.player?.player_api_id === apiId && candidate.monthIndex <= winner.monthIndex).length;
        return <article key={`${month}:${winner.category}`} className="relative overflow-hidden p-5"><div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.gradient}`} /><div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-wide text-gray-500">{style.icon} {winner.category} of the Month</span>{countAtThisWin > 1 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{countAtThisWin}× winner</span>}</div><div className="mt-4 flex items-center gap-4"><Link to={`/player-profile?playerId=${apiId}`} className="flex h-20 w-20 shrink-0 items-end justify-center overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">{headshots.get(apiId) ? <img src={headshots.get(apiId)} alt={`${playerName(winner.season)} headshot`} className="h-full w-full object-contain object-bottom" /> : <span className="mb-5 text-xl font-black text-gray-400">{playerName(winner.season).split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}</Link><div className="min-w-0"><div className="flex items-center gap-2"><Link to={`/player-profile?playerId=${apiId}`} className="block truncate font-black text-gray-900 hover:text-brand-500 dark:text-white">{playerName(winner.season)}</Link><PositionBadge position={winner.season.position} /></div><Link to={`/teams/${winner.team.id}`} className="mt-1 flex items-center gap-2 text-xs text-gray-500 hover:text-brand-500">{winner.team.logo && <img src={winner.team.logo} alt={`${winner.team.team_name} logo`} className="h-6 w-6 object-contain" />}{winner.team.abbreviation} · {winner.gamesPlayed} GP</Link><p className="mt-2 text-lg font-black text-brand-600 dark:text-brand-300">{formatFantasyPoints(winner.points)} FPTS</p></div></div></article>;
      })}</div></section>;
    })}
    {!loading && !error && !winners.length && <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">No completed monthly performances are available for this season yet.</p>}
  </div>;
}
