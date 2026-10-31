import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import PositionBadge from "../../components/hockey/PositionBadge";
import { CURRENT_LEAGUE_SEASON, playedAndCurrentSeasons } from "../../lib/leagueSeasons";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { applyTeamBranding, fetchFantasyTeams, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import { fetchLeagueTransactions, type LeagueTransaction } from "../../lib/transactions";
import {
  fetchNhlGoalieStats,
  fetchNhlGoalieStatsForPeriod,
  fetchNhlPlayerLanding,
  fetchNhlSkaterStats,
  fetchNhlSkaterStatsForPeriod,
  formatFantasyPoints,
  getGoalieScore,
  getSkaterScore,
  type NhlGoalieRecord,
  type NhlSkaterRecord,
} from "../../lib/nhl";

type Position = "C" | "LW" | "RW" | "D" | "G";
type PeriodMode = "period" | "month" | "season";
type PlayerRanking = { season: PlayerSeasonWithRelations; team: FantasyTeam; position: Position; nhlTeam: string; birthDate?: string; gamesPlayed: number; goals: number; assists: number; nhlPoints: number; wins: number; saves: number; savePct: number | null; goalsAgainstAverage: number | null; points: number; rank: number; movement: number | null };
type TeamRanking = { team: FantasyTeam; gamesPlayed: number; points: number; rank: number; movement: number | null; units: Record<Position, { gamesPlayed: number; points: number }> };
type GoalieTandem = { team: FantasyTeam; goalies: PlayerRanking[]; gamesPlayed: number; wins: number; saves: number; goalsAgainst: number; points: number };

const positions: Position[] = ["C", "LW", "RW", "D", "G"];
const positionNames: Record<Position, string> = { C: "Centres", LW: "Left Wings", RW: "Right Wings", D: "Defence", G: "Goalies" };
const scoringLimits: Record<Position, number> = { C: 3, LW: 3, RW: 3, D: 6, G: 2 };
const seasonOptions = playedAndCurrentSeasons;
const periodStartBySeason: Record<number, string> = { 2026: "2025-10-06", 2027: "2026-09-29" };
const periodsPerSeason = 14;
const monthNames = ["October", "November", "December", "January", "February", "March", "April"];
const currencyFormatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const headshotCacheKey = "award-headshots-v1";
const headshotCacheAge = 24 * 60 * 60 * 1000;
type CachedHeadshot = { url: string; savedAt: number };

function readHeadshotCache(): Record<string, CachedHeadshot> {
  try {
    return JSON.parse(localStorage.getItem(headshotCacheKey) || "{}") as Record<string, CachedHeadshot>;
  } catch {
    return {};
  }
}

function nhlSeasonId(year: number) { return (year - 1) * 10000 + year; }
function normalizePosition(value?: string | null): Position | null {
  const code = (value || "").toUpperCase();
  if (code === "L") return "LW";
  if (code === "R") return "RW";
  return positions.includes(code as Position) ? code as Position : null;
}
function playerName(row: PlayerSeasonWithRelations) { return row.player?.full_name || [row.player?.first_name, row.player?.last_name].filter(Boolean).join(" ") || "Unknown player"; }
function ageFromBirthDate(birthDate?: string) {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age;
}
function playerMeta(row: PlayerRanking) {
  const age = ageFromBirthDate(row.birthDate);
  return [
    row.nhlTeam || null,
    age === null ? null : `AGE ${age}`,
    row.season.salary == null ? "No salary" : currencyFormatter.format(row.season.salary),
    row.season.term_end_year,
  ].filter(Boolean).join(" | ");
}
function formatDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function parseDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function shiftDate(value: string, days: number) { const date = parseDate(value); date.setDate(date.getDate() + days); return formatDate(date); }
function periodEnd(value: string) { return shiftDate(value, 13); }
function periodLabel(start: string) {
  const end = parseDate(periodEnd(start));
  const startDate = parseDate(start);
  const formatter = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });
  return `${formatter.format(startDate)} – ${formatter.format(end)}, ${end.getFullYear()}`;
}
function periodStart(season: number, period: number) {
  return shiftDate(periodStartBySeason[season], (period - 1) * 14);
}
function latestPeriod(season: number) {
  let latest = 1;
  for (let period = 1; period <= periodsPerSeason; period += 1) {
    const end = parseDate(periodEnd(periodStart(season, period)));
    end.setHours(23, 59, 59, 999);
    if (Date.now() > end.getTime()) latest = period;
  }
  return latest;
}
function monthRange(season: number, monthIndex: number) {
  const calendarMonth = monthIndex < 3 ? monthIndex + 10 : monthIndex - 2;
  const year = monthIndex < 3 ? season - 1 : season;
  const start = season === 2027 && monthIndex === 0 ? `${year}-09-29` : formatDate(new Date(year, calendarMonth - 1, 1));
  const end = formatDate(new Date(year, calendarMonth, 0));
  return { start, end };
}
function monthLabel(season: number, monthIndex: number) {
  return season === 2027 && monthIndex === 0 ? "September / October" : monthNames[monthIndex];
}
function rangeLabel(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" });
  return `${formatter.format(parseDate(start))} – ${formatter.format(parseDate(end))}`;
}
function historicalTeamId(row: PlayerSeasonWithRelations, transactions: LeagueTransaction[], asOfDate: string) {
  let teamId = row.fantasy_team_id;
  transactions
    .filter((transaction) => transaction.season_year === row.season_year && transaction.transaction_type === "trade" && transaction.transaction_date > asOfDate)
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
    .forEach((transaction) => {
      const move = transaction.trade_offer?.trade_offer_players.find((candidate) => candidate.player_season?.player_id === row.player_id);
      if (move) teamId = move.from_team_id;
    });
  return teamId;
}
function scoreForPlayer(row: PlayerSeasonWithRelations, skaters: Map<string, NhlSkaterRecord>, goalies: Map<string, NhlGoalieRecord>) {
  const id = row.player?.player_api_id || "";
  const goalie = goalies.get(id);
  const skater = skaters.get(id);
  return goalie
    ? { teamAbbrevs: goalie.teamAbbrevs, birthDate: goalie.birthDate, gamesPlayed: goalie.gamesPlayed, goals: goalie.goals, assists: goalie.assists, nhlPoints: goalie.goals + goalie.assists, wins: goalie.wins, saves: goalie.saves, savePct: goalie.savePct, goalsAgainstAverage: goalie.goalsAgainstAverage, points: getGoalieScore(goalie) }
    : skater
      ? { teamAbbrevs: skater.teamAbbrevs, birthDate: skater.birthDate, gamesPlayed: skater.gamesPlayed, goals: skater.goals, assists: skater.assists, nhlPoints: skater.goals + skater.assists, wins: 0, saves: 0, savePct: null, goalsAgainstAverage: null, points: getSkaterScore(skater) }
      : { teamAbbrevs: "", birthDate: undefined, gamesPlayed: 0, goals: 0, assists: 0, nhlPoints: 0, wins: 0, saves: 0, savePct: null, goalsAgainstAverage: null, points: 0 };
}
function movementLabel(value: number | null) {
  if (value === null) return <span className="text-gray-300">New</span>;
  if (value > 0) return <span className="font-bold text-success-600">↑ {value}</span>;
  if (value < 0) return <span className="font-bold text-error-500">↓ {Math.abs(value)}</span>;
  return <span className="text-gray-400">—</span>;
}

function categoryWinners(rows: PlayerRanking[]) {
  const best = (eligible: PlayerRanking[]) => [...eligible].sort((a, b) => b.points - a.points || b.gamesPlayed - a.gamesPlayed)[0];
  return [
    { label: "Top Forward", icon: "🏒", row: best(rows.filter((row) => row.gamesPlayed > 0 && ["C", "LW", "RW"].includes(row.position))) },
    { label: "Top Defenceman", icon: "🛡️", row: best(rows.filter((row) => row.gamesPlayed > 0 && row.position === "D")) },
    { label: "Top Goalie", icon: "🥅", row: best(rows.filter((row) => row.gamesPlayed > 0 && row.position === "G")) },
  ].filter((winner): winner is { label: string; icon: string; row: PlayerRanking } => Boolean(winner.row));
}

function TeamMark({ team, size = "small" }: { team: FantasyTeam; size?: "small" | "large" }) {
  const dimensions = size === "large" ? "h-11 w-11" : "h-7 w-7";
  return <span className={`flex ${dimensions} shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white p-0.5 text-[9px] font-black text-gray-500 dark:border-gray-700 dark:bg-gray-900`}>{team.logo ? <img src={team.logo} alt="" className="h-full w-full object-contain" /> : team.abbreviation}</span>;
}

function PlayerTable({ rows, empty, position }: { rows: PlayerRanking[]; empty: string; position: Position }) {
  if (!rows.length) return <p className="px-4 py-8 text-center text-sm text-gray-500">{empty}</p>;
  const goalie = position === "G";
  return <table className="min-w-full text-sm"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 dark:bg-white/[0.03]"><tr><th className="px-3 py-2 text-left">Player</th><th className="px-2 py-2">GP</th>{goalie ? <><th className="px-2 py-2">W</th><th className="px-2 py-2">SV</th><th className="px-2 py-2">G</th><th className="px-2 py-2">A</th><th className="px-2 py-2">SV%</th><th className="px-2 py-2">GAA</th></> : <><th className="px-2 py-2">G</th><th className="px-2 py-2">A</th><th className="px-2 py-2">PTS</th></>}<th className="px-2 py-2">FPTS</th><th className="px-2 py-2">FPPG</th><th className="px-2 py-2">Move</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows.map((row) => <tr key={row.season.id}><td className="px-3 py-2.5"><div className="flex min-w-64 items-center gap-2"><Link to={`/teams/${row.team.id}`} title={row.team.team_name}><TeamMark team={row.team} /></Link><div className="min-w-0"><Link to={`/player-profile?playerId=${row.season.player?.player_api_id}`} className="block truncate font-semibold text-brand-600 hover:underline dark:text-brand-300">{playerName(row.season)}</Link><p className="mt-0.5 truncate text-[10px] font-medium text-gray-400">{playerMeta(row)}</p></div></div></td><td className="px-2 py-2.5 text-center tabular-nums">{row.gamesPlayed}</td>{goalie ? <><td className="px-2 py-2.5 text-center tabular-nums">{row.wins}</td><td className="px-2 py-2.5 text-center tabular-nums">{row.saves}</td><td className="px-2 py-2.5 text-center tabular-nums">{row.goals}</td><td className="px-2 py-2.5 text-center tabular-nums">{row.assists}</td><td className="px-2 py-2.5 text-center tabular-nums">{row.savePct === null ? "—" : row.savePct.toFixed(3)}</td><td className="px-2 py-2.5 text-center tabular-nums">{row.goalsAgainstAverage === null ? "—" : row.goalsAgainstAverage.toFixed(2)}</td></> : <><td className="px-2 py-2.5 text-center tabular-nums">{row.goals}</td><td className="px-2 py-2.5 text-center tabular-nums">{row.assists}</td><td className="px-2 py-2.5 text-center font-semibold tabular-nums">{row.nhlPoints}</td></>}<td className="px-2 py-2.5 text-center font-bold tabular-nums">{formatFantasyPoints(row.points)}</td><td className="px-2 py-2.5 text-center tabular-nums">{row.gamesPlayed ? formatFantasyPoints(row.points / row.gamesPlayed) : "—"}</td><td className="px-2 py-2.5 text-center text-xs">{movementLabel(row.movement)}</td></tr>)}</tbody></table>;
}

function PlayerPositionCard({ position, rows }: { position: Position; rows: PlayerRanking[] }) {
  const played = rows.filter((row) => row.gamesPlayed > 0);
  const top = [...played].sort((a, b) => b.points - a.points || b.gamesPlayed - a.gamesPlayed).slice(0, 5);
  const bottom = [...played].sort((a, b) => a.points - b.points || b.gamesPlayed - a.gamesPlayed).slice(0, 5);
  const didNotPlay = rows.length - played.length;
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-500">{position}</p><h2 className="text-lg font-black text-gray-900 dark:text-white">{positionNames[position]}</h2></div>{didNotPlay > 0 && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-500 dark:bg-gray-800">{didNotPlay} DNP excluded</span>}</div><div className="grid divide-y divide-gray-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0 dark:divide-gray-800"><div><h3 className="border-b border-success-100 bg-success-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">Top 5</h3><div className="overflow-x-auto"><PlayerTable rows={top} position={position} empty={`No ${position} games in this period.`} /></div></div><div><h3 className="border-b border-error-100 bg-error-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300">Bottom 5</h3><div className="overflow-x-auto"><PlayerTable rows={bottom} position={position} empty={`No ${position} games in this period.`} /></div></div></div></section>;
}

function SpotlightPlayer({ row, badge }: { row: PlayerRanking; badge?: string }) {
  return <div className="flex min-w-0 items-center gap-3"><Link to={`/teams/${row.team.id}`}><TeamMark team={row.team} size="large" /></Link><div className="min-w-0"><div className="flex items-center gap-2">{badge && <span className="text-lg">{badge}</span>}<Link to={`/player-profile?playerId=${row.season.player?.player_api_id}`} className="truncate font-black text-gray-900 hover:text-brand-500 dark:text-white">{playerName(row.season)}</Link><PositionBadge position={row.position} /></div><p className="truncate text-[11px] text-gray-500">{row.team.abbreviation} · {row.gamesPlayed} GP · {formatFantasyPoints(row.points)} FPTS</p></div></div>;
}

function PlayerHighlights({ rows, mode, tandem, headshots }: { rows: PlayerRanking[]; mode: PeriodMode; tandem?: GoalieTandem; headshots: Map<string, string> }) {
  const played = rows.filter((row) => row.gamesPlayed > 0);
  const winners = categoryWinners(rows);
  const biggestRiser = [...played].filter((row) => (row.movement || 0) > 0).sort((a, b) => (b.movement || 0) - (a.movement || 0) || b.points - a.points)[0];
  const cold = positions.map((position) => [...played].filter((row) => row.position === position).sort((a, b) => a.points - b.points || b.gamesPlayed - a.gamesPlayed)[0]).filter(Boolean) as PlayerRanking[];
  if (!played.length) return null;
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 text-white shadow-lg"><div className="border-b border-white/10 px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">{mode === "month" ? "Monthly honours" : mode === "period" ? "Scoring-period honours" : "Season honours"}</p><h2 className="mt-1 text-xl font-black">{mode === "month" ? "Monthly Position Winners" : mode === "period" ? "Period Position Winners" : "Season Position Winners"}</h2></div><div className="grid gap-px bg-white/10 md:grid-cols-3">{winners.map(({ row, label, icon }) => {
      const apiId = row.season.player?.player_api_id || "";
      const headshot = headshots.get(apiId);
      return <div key={label} className="relative overflow-hidden bg-slate-950/80 px-5 pt-5">
        <div className="absolute left-4 top-4 z-10 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-violet-200 shadow-lg"><span className="mr-1.5">{icon}</span>{label}</div>
        <Link to={`/teams/${row.team.id}`} title={row.team.team_name} className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/95 p-1 shadow-lg">{row.team.logo ? <img src={row.team.logo} alt={`${row.team.team_name} logo`} className="h-full w-full object-contain" /> : <span className="text-[10px] font-black text-gray-700">{row.team.abbreviation}</span>}</Link>
        <Link to={`/player-profile?playerId=${apiId}`} className="mx-auto flex h-40 w-40 items-end justify-center overflow-hidden rounded-full bg-gradient-to-b from-white/10 to-violet-400/20 ring-1 ring-white/10">{headshot ? <img src={headshot} alt={`${playerName(row.season)} headshot`} className="h-full w-full object-contain object-bottom" /> : <span className="mb-10 text-5xl font-black text-white/20">{playerName(row.season).split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}</Link>
        <div className="relative -mx-5 mt-2 bg-gradient-to-t from-black/60 to-transparent px-5 pb-5 pt-5 text-center"><div className="flex items-center justify-center gap-2"><Link to={`/player-profile?playerId=${apiId}`} className="text-lg font-black hover:text-violet-300">{playerName(row.season)}</Link><PositionBadge position={row.position} /></div><p className="mt-1 text-xs text-gray-400">{row.team.abbreviation} · {row.gamesPlayed} GP</p><p className="mt-3 text-2xl font-black text-violet-300">{formatFantasyPoints(row.points)} <span className="text-xs font-bold text-gray-400">FPTS</span></p></div>
      </div>;
    })}</div></section>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">📈 Biggest Riser</p>{biggestRiser ? <div className="mt-3"><SpotlightPlayer row={biggestRiser} /><p className="mt-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">Climbed {biggestRiser.movement} positional ranking spot{biggestRiser.movement === 1 ? "" : "s"}</p></div> : <p className="mt-3 text-sm text-emerald-800/70 dark:text-emerald-200/70">No previous ranking is available for comparison.</p>}</section>
      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-500/20 dark:bg-sky-500/10"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">🥅 Best Goalie Tandem</p>{tandem ? <div className="mt-3"><Link to={`/teams/${tandem.team.id}`} className="flex items-center gap-3"><TeamMark team={tandem.team} size="large" /><span><span className="block font-black text-gray-900 dark:text-white">{tandem.team.team_name}</span><span className="text-xs text-gray-500">{tandem.goalies.map((row) => playerName(row.season)).join(" + ")}</span></span></Link><p className="mt-3 text-sm font-bold text-sky-800 dark:text-sky-200">{tandem.gamesPlayed} GP · {tandem.wins} W · {tandem.saves} SV · {formatFantasyPoints(tandem.points)} FPTS</p></div> : <p className="mt-3 text-sm text-sky-800/70 dark:text-sky-200/70">No team had two goalies appear in this range.</p>}</section>
    </div>
    {mode === "period" && <section className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 p-5 dark:border-cyan-500/20 dark:from-cyan-500/10 dark:to-blue-500/10"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">❄️ Cold as Ice</p><p className="mt-1 text-xs text-gray-500">Lowest-scoring rostered player with an appearance at each position. The current list holds until the next scoring period is complete.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cold.map((row) => <div key={row.season.id} className="rounded-xl border border-white/80 bg-white/75 p-3 shadow-sm dark:border-white/10 dark:bg-gray-950/40"><SpotlightPlayer row={row} badge="❄️" /></div>)}</div></section>}
  </div>;
}

function TeamTable({ rows }: { rows: TeamRanking[] }) {
  return <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-white/[0.03]"><tr><th className="px-3 py-3">Rank</th><th className="px-3 py-3 text-left">Team</th><th className="px-3 py-3">GP</th><th className="px-3 py-3">Fantasy Points</th><th className="px-3 py-3">FPPG</th><th className="px-3 py-3">Movement</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows.map((row) => <tr key={row.team.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]"><td className="px-3 py-3 text-center text-lg font-black">#{row.rank}</td><td className="px-3 py-3"><Link to={`/teams/${row.team.id}`} className="flex min-w-52 items-center gap-3"><TeamMark team={row.team} size="large" /><span><span className="block font-bold text-gray-900 hover:text-brand-500 dark:text-white">{row.team.team_name}</span><span className="text-xs text-gray-400">{row.team.abbreviation}</span></span></Link></td><td className="px-3 py-3 text-center tabular-nums">{row.gamesPlayed}</td><td className="px-3 py-3 text-center text-base font-black tabular-nums text-brand-600 dark:text-brand-300">{formatFantasyPoints(row.points)}</td><td className="px-3 py-3 text-center font-semibold tabular-nums">{row.gamesPlayed ? formatFantasyPoints(row.points / row.gamesPlayed) : "—"}</td><td className="px-3 py-3 text-center">{movementLabel(row.movement)}</td></tr>)}</tbody></table></div>;
}

function UnitCard({ position, teams }: { position: Position; teams: TeamRanking[] }) {
  const played = teams.filter((row) => row.units[position].gamesPlayed > 0);
  const sorted = [...played].sort((a, b) => b.units[position].points - a.units[position].points);
  const top = sorted.slice(0, 5);
  const bottom = [...sorted].reverse().slice(0, 5);
  const list = (rows: TeamRanking[], tone: "top" | "bottom") => <div className="space-y-1.5 p-3">{rows.length ? rows.map((row, index) => { const unit = row.units[position]; return <Link key={row.team.id} to={`/teams/${row.team.id}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04]"><span className={`text-xs font-black ${tone === "top" ? "text-success-600" : "text-error-500"}`}>{index + 1}</span><span className="flex min-w-0 items-center gap-2"><TeamMark team={row.team} /><span className="truncate text-sm font-semibold">{row.team.team_name}</span></span><span className="text-right"><span className="block text-sm font-black tabular-nums">{formatFantasyPoints(unit.points)}</span><span className="block text-[10px] text-gray-400">{unit.gamesPlayed} GP · {unit.gamesPlayed ? formatFantasyPoints(unit.points / unit.gamesPlayed) : "—"} FPPG</span></span></Link>; }) : <p className="p-4 text-center text-sm text-gray-500">No games played.</p>}</div>;
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800"><span className="mr-2 text-xs font-black text-brand-500">{position}</span><span className="font-bold">{positionNames[position]} units</span></div><div className="grid divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-gray-800"><div><p className="bg-success-50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-success-700 dark:bg-success-500/10 dark:text-success-300">Best</p>{list(top, "top")}</div><div><p className="bg-error-50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-error-700 dark:bg-error-500/10 dark:text-error-300">Worst</p>{list(bottom, "bottom")}</div></div></section>;
}

function RookieWatchTable({ title, subtitle, rows, season, accent = "brand" }: { title: string; subtitle: string; rows: PlayerRanking[]; season: number; accent?: "brand" | "amber" }) {
  const tone = accent === "amber" ? "text-amber-600 dark:text-amber-300" : "text-brand-500";
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className={`text-[10px] font-black uppercase tracking-[0.18em] ${tone}`}>{title}</p><p className="mt-1 text-xs text-gray-500">{subtitle}</p></div>
    {rows.length ? <div className="divide-y divide-gray-100 dark:divide-gray-800">{rows.map((row, index) => {
      const apiId = row.season.player?.player_api_id || "";
      const elcYear = Math.max(1, Math.min(3, 3 - ((row.season.term_end_year || season) - season)));
      return <article key={row.season.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_5rem_5rem_6rem]">
        <span className={`text-center text-lg font-black ${index < 3 ? tone : "text-gray-300 dark:text-gray-700"}`}>#{index + 1}</span>
        <div className="flex min-w-0 items-center gap-2">{row.team.logo && <img src={row.team.logo} alt="" className="h-9 w-9 shrink-0 object-contain" />}<div className="min-w-0"><div className="flex items-center gap-2"><Link to={`/player-profile?playerId=${apiId}`} className="truncate text-sm font-black text-gray-900 hover:text-brand-500 dark:text-white">{playerName(row.season)}</Link><PositionBadge position={row.position} /></div><p className="mt-0.5 truncate text-[10px] font-semibold uppercase text-gray-400">{row.team.abbreviation} · ELC year {elcYear} of 3</p></div></div>
        <div className="hidden text-center sm:block"><p className="text-[9px] font-black uppercase text-gray-400">GP</p><p className="text-sm font-bold tabular-nums">{row.gamesPlayed}</p></div>
        <div className="hidden text-center sm:block"><p className="text-[9px] font-black uppercase text-gray-400">{row.position === "G" ? "W / SV" : "G / A"}</p><p className="text-sm font-bold tabular-nums">{row.position === "G" ? `${row.wins} / ${row.saves}` : `${row.goals} / ${row.assists}`}</p></div>
        <div className="text-right"><p className={`text-base font-black tabular-nums ${tone}`}>{formatFantasyPoints(row.points)}</p><p className="text-[9px] font-black uppercase text-gray-400">FPTS · {row.gamesPlayed ? formatFantasyPoints(row.points / row.gamesPlayed) : "—"} FPPG</p></div>
      </article>;
    })}</div> : <p className="p-6 text-center text-sm text-gray-500">No eligible players have appeared in this range.</p>}
  </section>;
}

function RookieWatch({ rows, season, mode }: { rows: PlayerRanking[]; season: number; mode: PeriodMode }) {
  const elcPlayers = rows.filter((row) => row.season.salary === 500_000 && (row.season.contract_group || "").toUpperCase() === "ELC" && row.season.term_end_year != null && row.season.term_end_year >= season)
    .filter((row) => row.gamesPlayed > 0)
    .sort((a, b) => b.points - a.points || b.gamesPlayed - a.gamesPlayed);
  const firstYear = elcPlayers.filter((row) => row.season.term_end_year === season + 2).slice(0, 10);
  const forwards = elcPlayers.filter((row) => ["C", "LW", "RW"].includes(row.position)).slice(0, 5);
  const defence = elcPlayers.filter((row) => row.position === "D").slice(0, 5);
  const goalies = elcPlayers.filter((row) => row.position === "G").slice(0, 5);
  const rangeName = mode === "period" ? "this scoring period" : mode === "month" ? "this award month" : "the full season";
  return <div className="space-y-5">
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <div className="space-y-5"><RookieWatchTable title="Top 5 ELC Forwards" subtitle={`All ELC years · ${rangeName}`} rows={forwards} season={season} /><RookieWatchTable title="Top 5 ELC Defencemen" subtitle={`All ELC years · ${rangeName}`} rows={defence} season={season} /><RookieWatchTable title="Top 5 ELC Goalies" subtitle={`All ELC years · ${rangeName}`} rows={goalies} season={season} /></div>
      <aside className="space-y-5 xl:sticky xl:top-24"><section className="overflow-hidden rounded-2xl bg-gradient-to-br from-amber-950 via-slate-950 to-emerald-950 p-6 text-white shadow-lg"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">🌟 Rookie Watch · Season {season}</p><h2 className="mt-2 text-2xl font-black">The next wave</h2><p className="mt-2 text-sm leading-6 text-slate-300">ELC leaderboards include every active $500,000 entry-level contract. Rookie of the Year Watch is stricter: only players in year one of their three-year ELC are eligible.</p></section><RookieWatchTable title="Rookie of the Year Watch" subtitle={`First-year ELC players ranked together across all positions for ${rangeName}.`} rows={firstYear} season={season} accent="amber" /></aside>
    </div>
  </div>;
}

export default function PowerRankings() {
  const [tab, setTab] = useState<"players" | "teams" | "rookies">("players");
  const [season, setSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [mode, setMode] = useState<PeriodMode>("period");
  const [period, setPeriod] = useState(() => latestPeriod(CURRENT_LEAGUE_SEASON));
  const [month, setMonth] = useState(0);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [playerSeasons, setPlayerSeasons] = useState<PlayerSeasonWithRelations[]>([]);
  const [transactions, setTransactions] = useState<LeagueTransaction[]>([]);
  const [currentSkaters, setCurrentSkaters] = useState<NhlSkaterRecord[]>([]);
  const [currentGoalies, setCurrentGoalies] = useState<NhlGoalieRecord[]>([]);
  const [previousSkaters, setPreviousSkaters] = useState<NhlSkaterRecord[]>([]);
  const [previousGoalies, setPreviousGoalies] = useState<NhlGoalieRecord[]>([]);
  const [headshots, setHeadshots] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const seasonId = nhlSeasonId(season);
    const selectedMonth = monthRange(season, month);
    const priorMonth = month > 0 ? monthRange(season, month - 1) : null;
    const currentStart = mode === "month" ? selectedMonth.start : periodStart(season, period);
    const currentEnd = mode === "month" ? selectedMonth.end : periodEnd(currentStart);
    const previousStart = mode === "month" ? priorMonth?.start : period > 1 ? shiftDate(currentStart, -14) : undefined;
    const previousEnd = mode === "month" ? priorMonth?.end : previousStart ? periodEnd(previousStart) : undefined;
    Promise.all([
      fetchFantasyTeams(), fetchTeamBrandingHistory(), fetchPlayerSeasonsBySeason(season), fetchLeagueTransactions(),
      mode === "season" ? fetchNhlSkaterStats(seasonId) : fetchNhlSkaterStatsForPeriod(seasonId, currentStart, currentEnd),
      mode === "season" ? fetchNhlGoalieStats(seasonId) : fetchNhlGoalieStatsForPeriod(seasonId, currentStart, currentEnd),
      mode === "season" || !previousStart || !previousEnd ? Promise.resolve([] as NhlSkaterRecord[]) : fetchNhlSkaterStatsForPeriod(seasonId, previousStart, previousEnd),
      mode === "season" || !previousStart || !previousEnd ? Promise.resolve([] as NhlGoalieRecord[]) : fetchNhlGoalieStatsForPeriod(seasonId, previousStart, previousEnd),
    ]).then(([teamRows, branding, seasonRows, transactionRows, skaters, goalies, priorSkaters, priorGoalies]) => {
      if (!active) return;
      setTeams(teamRows.map((team) => applyTeamBranding(team, branding, season)));
      setPlayerSeasons(seasonRows);
      setTransactions(transactionRows);
      setCurrentSkaters(skaters); setCurrentGoalies(goalies);
      setPreviousSkaters(priorSkaters); setPreviousGoalies(priorGoalies);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load power rankings."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, month, period, season]);

  const rankingEndDate = mode === "period"
    ? periodEnd(periodStart(season, period))
    : mode === "month"
      ? monthRange(season, month).end
      : `${season}-04-30`;
  const previousRankingEndDate = mode === "period" && period > 1
    ? shiftDate(periodStart(season, period), -1)
    : mode === "month" && month > 0
      ? monthRange(season, month - 1).end
      : rankingEndDate;

  const { playerRankings, teamRankings, goalieTandems } = useMemo(() => {
    const currentSkaterMap = new Map(currentSkaters.map((row) => [String(row.playerId), row]));
    const currentGoalieMap = new Map(currentGoalies.map((row) => [String(row.playerId), row]));
    const previousSkaterMap = new Map(previousSkaters.map((row) => [String(row.playerId), row]));
    const previousGoalieMap = new Map(previousGoalies.map((row) => [String(row.playerId), row]));
    const teamMap = new Map(teams.map((team) => [team.id, team]));
    const rosterAt = (asOfDate: string) => playerSeasons
      .map((row) => ({ ...row, fantasy_team_id: historicalTeamId(row, transactions, asOfDate) }))
      .filter((row) => Boolean(row.fantasy_team_id && row.player?.player_api_id && normalizePosition(row.position)));
    const eligible = rosterAt(rankingEndDate);
    const previousEligible = rosterAt(previousRankingEndDate);
    const previousRanks = new Map<number, number>();
    positions.forEach((pos) => eligible.filter((row) => normalizePosition(row.position) === pos).map((row) => ({ row, ...scoreForPlayer(row, previousSkaterMap, previousGoalieMap) })).filter((item) => item.gamesPlayed > 0).sort((a, b) => b.points - a.points).forEach((item, index) => previousRanks.set(item.row.id, index + 1)));
    const players: PlayerRanking[] = [];
    positions.forEach((pos) => {
      const positional = eligible.filter((row) => normalizePosition(row.position) === pos).map((row) => ({ row, team: teamMap.get(row.fantasy_team_id!), ...scoreForPlayer(row, currentSkaterMap, currentGoalieMap) })).filter((item): item is typeof item & { team: FantasyTeam } => Boolean(item.team)).sort((a, b) => Number(b.gamesPlayed > 0) - Number(a.gamesPlayed > 0) || b.points - a.points || b.gamesPlayed - a.gamesPlayed);
      let playedRank = 0;
      positional.forEach((item) => { const rank = item.gamesPlayed > 0 ? ++playedRank : 0; const prior = previousRanks.get(item.row.id); players.push({ season: item.row, team: item.team, position: pos, nhlTeam: item.teamAbbrevs, birthDate: item.birthDate, gamesPlayed: item.gamesPlayed, goals: item.goals, assists: item.assists, nhlPoints: item.nhlPoints, wins: item.wins, saves: item.saves, savePct: item.savePct, goalsAgainstAverage: item.goalsAgainstAverage, points: item.points, rank, movement: mode === "season" ? 0 : prior && rank ? prior - rank : null }); });
    });
    const emptyUnits = () => Object.fromEntries(positions.map((pos) => [pos, { gamesPlayed: 0, points: 0 }])) as TeamRanking["units"];
    const scoringLineup = (roster: PlayerSeasonWithRelations[], teamId: number, skaterMap: Map<string, NhlSkaterRecord>, goalieMap: Map<string, NhlGoalieRecord>) => positions.flatMap((pos) => roster
      .filter((row) => row.fantasy_team_id === teamId && normalizePosition(row.position) === pos)
      .map((row) => ({ row, pos, score: scoreForPlayer(row, skaterMap, goalieMap) }))
      .sort((a, b) => b.score.points - a.score.points || b.score.gamesPlayed - a.score.gamesPlayed)
      .slice(0, scoringLimits[pos]));
    const currentTeams = teams.map((team) => {
      const units = emptyUnits();
      scoringLineup(eligible, team.id, currentSkaterMap, currentGoalieMap).forEach(({ pos, score }) => { units[pos].gamesPlayed += score.gamesPlayed; units[pos].points += score.points; });
      return { team, units, gamesPlayed: positions.reduce((sum, pos) => sum + units[pos].gamesPlayed, 0), points: positions.reduce((sum, pos) => sum + units[pos].points, 0) };
    }).sort((a, b) => b.points - a.points);
    const previousTeamRanks = new Map<number, number>();
    teams.map((team) => ({ team, points: scoringLineup(previousEligible, team.id, previousSkaterMap, previousGoalieMap).reduce((sum, item) => sum + item.score.points, 0) })).sort((a, b) => b.points - a.points).forEach((row, index) => previousTeamRanks.set(row.team.id, index + 1));
    const rankedTeams: TeamRanking[] = currentTeams.map((row, index) => ({ ...row, rank: index + 1, movement: mode === "season" ? 0 : (previousTeamRanks.get(row.team.id) || 0) - (index + 1) }));
    const goalieTandems = teams.map((team) => {
      const goalies = players.filter((row) => row.team.id === team.id && row.position === "G" && row.gamesPlayed > 0).sort((a, b) => b.points - a.points).slice(0, scoringLimits.G);
      const source = goalies.map((row) => currentGoalieMap.get(row.season.player?.player_api_id || "")).filter(Boolean) as NhlGoalieRecord[];
      return { team, goalies, gamesPlayed: source.reduce((sum, row) => sum + row.gamesPlayed, 0), wins: source.reduce((sum, row) => sum + row.wins, 0), saves: source.reduce((sum, row) => sum + row.saves, 0), goalsAgainst: source.reduce((sum, row) => sum + row.goalsAgainst, 0), points: goalies.reduce((sum, row) => sum + row.points, 0) };
    }).filter((row) => row.goalies.length >= 2).sort((a, b) => b.points - a.points);
    return { playerRankings: players, teamRankings: rankedTeams, goalieTandems };
  }, [currentGoalies, currentSkaters, mode, playerSeasons, previousGoalies, previousRankingEndDate, previousSkaters, rankingEndDate, teams, transactions]);

  const podiumPlayerIds = useMemo(() => categoryWinners(playerRankings)
    .map(({ row }) => row.season.player?.player_api_id)
    .filter((id): id is string => Boolean(id)), [playerRankings]);

  useEffect(() => {
    let active = true;
    const cache = readHeadshotCache();
    const cached = podiumPlayerIds.filter((id) => cache[id]?.url && Date.now() - cache[id].savedAt < headshotCacheAge).map((id) => [id, cache[id].url] as const);
    if (cached.length) setHeadshots((current) => new Map([...current, ...cached]));
    podiumPlayerIds.forEach((id) => {
      if (cache[id]?.url && Date.now() - cache[id].savedAt < headshotCacheAge) return;
      void fetchNhlPlayerLanding(Number(id)).then((landing) => {
        if (!active || !landing.headshot) return;
        setHeadshots((current) => new Map(current).set(id, landing.headshot!));
        try {
          const latest = readHeadshotCache();
          latest[id] = { url: landing.headshot, savedAt: Date.now() };
          localStorage.setItem(headshotCacheKey, JSON.stringify(latest));
        } catch { /* Headshots still render if browser storage is unavailable. */ }
      }).catch(() => {});
    });
    return () => { active = false; };
  }, [podiumPlayerIds]);

  const changeSeason = (year: number) => { setSeason(year); setPeriod(latestPeriod(year)); };

  const selectedPeriodStart = periodStart(season, period);
  const selectedMonthRange = monthRange(season, month);

  return <div><PageMeta title="Power Rankings | Great Lakes Dynasty" description="GLDHL player and team power rankings by scoring period" /><PageBreadcrumb pageTitle="Power Rankings" />
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 via-slate-900 to-violet-950 p-6 text-white shadow-xl sm:p-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">GLDHL Analytics</p><h1 className="mt-2 text-3xl font-black">Power Rankings</h1><p className="mt-2 max-w-2xl text-sm text-gray-300">Who’s hot, who’s cold, and which roster units owned the scoring period. Rankings use official GLDHL fantasy scoring.</p></section>
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid grid-cols-3 rounded-xl border border-gray-300 p-1 dark:border-gray-700"><button type="button" onClick={() => setTab("players")} className={`whitespace-nowrap rounded-lg px-2 py-2 text-[11px] font-bold sm:px-4 sm:text-sm ${tab === "players" ? "bg-brand-500 text-white" : "text-gray-600 dark:text-gray-300"}`}>Player Rankings</button><button type="button" onClick={() => setTab("teams")} className={`whitespace-nowrap rounded-lg px-2 py-2 text-[11px] font-bold sm:px-4 sm:text-sm ${tab === "teams" ? "bg-brand-500 text-white" : "text-gray-600 dark:text-gray-300"}`}>Team Rankings</button><button type="button" onClick={() => setTab("rookies")} className={`whitespace-nowrap rounded-lg px-2 py-2 text-[11px] font-bold sm:px-4 sm:text-sm ${tab === "rookies" ? "bg-amber-500 text-white" : "text-gray-600 dark:text-gray-300"}`}>Rookie Watch</button></div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-xs font-bold uppercase text-gray-500">Season<select value={season} onChange={(event) => changeSeason(Number(event.target.value))} className="mt-1 block h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white">{seasonOptions.map((year) => <option key={year}>{year}</option>)}</select></label>
            <div className="flex h-10 rounded-lg border border-gray-300 p-1 dark:border-gray-700"><button type="button" onClick={() => setMode("period")} className={`rounded-md px-3 text-xs font-bold ${mode === "period" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500"}`}>Periods</button><button type="button" onClick={() => setMode("month")} className={`rounded-md px-3 text-xs font-bold ${mode === "month" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500"}`}>Months</button><button type="button" onClick={() => setMode("season")} className={`rounded-md px-3 text-xs font-bold ${mode === "season" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500"}`}>Full Season</button></div>
            {mode === "period" && <label className="text-xs font-bold uppercase text-gray-500">Scoring period<select value={period} onChange={(event) => setPeriod(Number(event.target.value))} className="mt-1 block h-10 min-w-56 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium normal-case text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white">{Array.from({ length: periodsPerSeason }, (_, index) => index + 1).map((number) => { const start = periodStart(season, number); return <option key={number} value={number}>Period {number} · {periodLabel(start)}</option>; })}</select></label>}
            {mode === "month" && <label className="text-xs font-bold uppercase text-gray-500">Month<select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 block h-10 min-w-40 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium normal-case text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white">{monthNames.map((name, index) => <option key={name} value={index}>{monthLabel(season, index)}</option>)}</select></label>}
          </div>
        </div>
        {mode === "period" && <p className="mt-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Period {period}: {periodLabel(selectedPeriodStart)} <span className="ml-2 font-normal text-gray-400">· {period > 1 ? "Movement compares the previous two-week period" : "Opening period — no previous-period comparison"}</span></p>}
        {mode === "month" && <p className="mt-3 text-sm font-semibold text-gray-600 dark:text-gray-300">{monthLabel(season, month)}: {rangeLabel(selectedMonthRange.start, selectedMonthRange.end)} <span className="ml-2 font-normal text-gray-400">· {month > 0 ? "Movement compares the previous month" : "Opening award month — no previous-month comparison"}</span></p>}
      </section>
      {loading ? <div className="grid animate-pulse gap-5"><div className="h-72 rounded-2xl bg-gray-100 dark:bg-gray-800" /><div className="h-72 rounded-2xl bg-gray-100 dark:bg-gray-800" /></div> : error ? <div className="rounded-xl border border-error-200 bg-error-50 p-5 text-error-700">{error}</div> : tab === "players" ? <div className="space-y-5"><PlayerHighlights rows={playerRankings} mode={mode} tandem={goalieTandems[0]} headshots={headshots} />{positions.map((pos) => <PlayerPositionCard key={pos} position={pos} rows={playerRankings.filter((row) => row.position === pos)} />)}</div> : tab === "rookies" ? <RookieWatch rows={playerRankings} season={season} mode={mode} /> : <div className="space-y-5"><div><h2 className="mb-3 text-xl font-black text-gray-900 dark:text-white">Overall team rankings</h2><TeamTable rows={teamRankings} /></div><div className="pt-2"><h2 className="mb-3 text-xl font-black text-gray-900 dark:text-white">Positional unit rankings</h2><div className="space-y-5">{positions.map((pos) => <UnitCard key={pos} position={pos} teams={teamRankings} />)}</div></div></div>}
      {!loading && !error && <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400"><strong>How this works:</strong> Rankings reconstruct each player’s fantasy team as of the end of the selected period or month using the league transaction history. Team rankings count the highest-scoring 3 C, 3 LW, 3 RW, 6 D and 2 G from that historical roster. Extra roster players remain eligible for individual Player Rankings but do not add to team or positional-unit totals. Team GP is the combined number of NHL appearances by those scoring players, and FPPG is their fantasy points divided by those appearances. Players with zero games are excluded from Bottom 5 lists.</p>}
    </div>
  </div>;
}
