import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  type FantasyTeam,
  type FantasyTeamManagerTenure,
  type FantasyTeamFinish,
  type FantasyTeamBranding,
  applyTeamBranding,
  fetchFantasyTeamByAbbreviation,
  fetchTeamManagerTenures,
  fetchTeamFinishes,
  fetchTeamBrandingHistory,
  getManagerForSeason,
} from "../../lib/fantasyTeams";
import { fetchPlayerSeasons, fetchPlayerSeasonsByTeam, fetchPlayerSeasonsByTeamAndSeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import {
  formatFantasyPoints,
} from "../../lib/nhl";
import { fetchMlbDailyStats, fetchMlbPlayerProfile, fetchMlbStats, formatStatValue, type MlbStatRecord } from "../../lib/mlb";
import { fetchAwards, fetchPlayerAwards, mapAwardsByPlayer, type Award, type PlayerAward } from "../../lib/awards";
import PlayerAwardBadges from "./PlayerAwardBadges";
import { CURRENT_LEAGUE_SEASON, playedAndCurrentSeasons } from "../../lib/leagueSeasons";
import TeamIdentityCard from "./TeamIdentityCard";
import { fetchTradeBlockListings } from "../../lib/tradeMarket";
import TradeBlockBadge from "./TradeBlockBadge";
import PlayerInterestButton from "./PlayerInterestButton";
import { usePlayerTradeInterest } from "../../hooks/usePlayerTradeInterest";
import { fetchBuyoutPenalties, type BuyoutPenalty } from "../../lib/buyouts";
import { fetchRetentionAdjustments, type RetentionAdjustment } from "../../lib/retentions";
import { useAuth } from "../../context/AuthContext";
import { fetchUserTeamAssignment } from "../../lib/teamUserAssignments";
import { fetchTeamLeadership, setTeamLeadershipSlot, type LeadershipSlot, type TeamLeadership } from "../../lib/teamLeadership";
import PositionBadge from "../../components/hockey/PositionBadge";
import InjuryDesignationBadge from "../../components/hockey/InjuryDesignationBadge";

const ROSTER_LIMIT = 27;
const MLB_STATS_SEASON = CURRENT_LEAGUE_SEASON;
const MLB_FALLBACK_SEASON = CURRENT_LEAGUE_SEASON - 1;
const seasonOptions = [CURRENT_LEAGUE_SEASON + 1, ...playedAndCurrentSeasons];
const activeSections = [
  { code: "C", label: "Catcher", type: "player" },
  { code: "1B", label: "First Base", type: "player" },
  { code: "2B", label: "Second Base", type: "player" },
  { code: "SS", label: "Shortstop", type: "player" },
  { code: "3B", label: "Third Base", type: "player" },
  { code: "OF", label: "Outfield", type: "player" },
  { code: "DH", label: "Designated Hitter", type: "player" },
  { code: "SP", label: "Starting Pitcher", type: "player" },
  { code: "RP", label: "Relief Pitcher", type: "player" },
] as const;
const nonRosterSections = [
  { code: "RFA", label: "RFA Rights", cap: false },
  { code: "W", label: "Waivers", cap: true },
  { code: "IR", label: "Injured Reserve", cap: true },
  { code: "LTIR", label: "Long-Term Injured Reserve", cap: false },
  { code: "RETENTION", label: "Retention", cap: true },
] as const;
const activePositions = new Set(activeSections.map((section) => section.code));
const capPositions = new Set([...activePositions, "W", "IR", "RETENTION"]);
const ageRosterPositions = new Set([...activePositions, "W", "IR", "LTIR"]);
const prospectPositions = new Set(["PROSPECT", "AP"]);
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function salaryCapForSeason(_year: number) {
  return 47_000_000;
}

function getMlbBatterScore(record?: MlbStatRecord) {
  if (!record) return 0;
  return Number(record.stats.runs ?? 0)
    + Number(record.stats.hits ?? 0)
    + Number(record.stats.doubles ?? 0)
    + Number(record.stats.triples ?? 0) * 2
    + Number(record.stats.homeRuns ?? 0) * 3
    + Number(record.stats.rbi ?? 0)
    + Number(record.stats.stolenBases ?? 0) * 2;
}

function getMlbPitcherScore(record?: MlbStatRecord) {
  if (!record) return 0;
  return Number(record.stats.wins ?? 0) * 8
    + Number(record.stats.strikeOuts ?? 0)
    + Number(record.stats.saves ?? 0) * 6
    + Number(record.stats.completeGames ?? 0) * 5
    + Number(record.stats.shutouts ?? 0) * 5;
}

function playerName(season: PlayerSeasonWithRelations) {
  return season.player?.full_name || [season.player?.first_name, season.player?.last_name].filter(Boolean).join(" ") || "Unknown Player";
}

function fantasyPlayerName(player: PlayerAward["player"]) {
  return player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Unknown Player";
}

function playerApiId(season: PlayerSeasonWithRelations) {
  return season.player?.player_api_id || "";
}

function ageOnDate(birthDate: string, asOf: Date) {
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = asOf.getFullYear() - year;
  if (asOf.getMonth() + 1 < month || (asOf.getMonth() + 1 === month && asOf.getDate() < day)) age -= 1;
  return age;
}

function position(season: PlayerSeasonWithRelations) {
  return (season.position || "UNASSIGNED").toUpperCase();
}

function LiveBadge() {
  return <span className="ml-2 inline-flex animate-pulse rounded-full bg-error-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-error-700 ring-1 ring-error-200 dark:bg-error-500/10 dark:text-error-300 dark:ring-error-500/30"><span className="mr-1.5 mt-1 h-1.5 w-1.5 rounded-full bg-error-500" />Live</span>;
}

function LeadershipBadge({ role }: { role?: "C" | "A" }) {
  if (!role) return null;
  return <span title={role === "C" ? "Team Captain" : "Alternate Captain"} className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black ring-1 ${role === "C" ? "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/40" : "bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/40"}`}>{role}</span>;
}

function PlayerName({ season, nhlTeam, teamLogo, awards = [], onTradeBlock = false, interestAction, isLive = false, leadershipRole }: { season: PlayerSeasonWithRelations; nhlTeam?: string; teamLogo?: string; awards?: PlayerAward[]; onTradeBlock?: boolean; interestAction?: React.ReactNode; isLive?: boolean; leadershipRole?: "C" | "A" }) {
  const isExpiring = season.term_end_year === season.season_year;
  const nhlTeamAbbreviation = nhlTeam?.split(",")[0]?.trim();
  return <div className="flex min-w-56 items-center gap-2 text-left">
    {interestAction}
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
      {teamLogo ? <img src={teamLogo} alt={`${nhlTeamAbbreviation || "MLB"} club logo`} title={nhlTeamAbbreviation} className="h-full w-full object-contain p-0.5" /> : <span className="text-[10px] font-semibold text-gray-500">{nhlTeamAbbreviation || "MLB"}</span>}
    </div>
    <div><p className="font-medium text-gray-800 dark:text-white/90">{season.player?.player_api_id && !season.player.player_api_id.startsWith("ap-") ? <Link to={`/baseball-player-profile?playerId=${season.player.player_api_id}&type=${["P", "SP", "RP"].includes((season.position || "").toUpperCase()) ? "pitching" : "hitting"}`} className="text-brand-500 hover:underline">{playerName(season)}</Link> : playerName(season)}<InjuryDesignationBadge position={season.position} /><LeadershipBadge role={leadershipRole} />{isLive && <LiveBadge />}<PlayerAwardBadges awards={awards} includeMonthly={false} />{onTradeBlock && <TradeBlockBadge className="ml-2 align-middle" />}</p>
      <p className={`mt-0.5 text-[11px] ${isExpiring ? "font-semibold text-orange-600 dark:text-orange-400" : "text-gray-500 dark:text-gray-400"}`}>
        {[nhlTeam || "—", money.format(season.salary || 0), season.term_end_year || "No term"].join(" | ")}
        {isExpiring && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">Expiring</span>}
      </p>
    </div>
  </div>;
}

function MlbRosterTable({ code, label, players, stats, teamNames, teamLogos, daily = false, awardsByPlayer, tradeBlockIds, leadershipByPlayer, renderInterest }: { code: string; label: string; players: PlayerSeasonWithRelations[]; stats: Map<string, MlbStatRecord>; teamNames: Map<string, string>; teamLogos: Map<string, string>; daily?: boolean; awardsByPlayer: Map<number, PlayerAward[]>; tradeBlockIds: Set<number>; leadershipByPlayer: Map<number, "C" | "A">; renderInterest: (season: PlayerSeasonWithRelations) => React.ReactNode }) {
  const pitcher = ["SP", "RP", "P"].includes(code);
  const scoreFor = (record?: MlbStatRecord) => pitcher ? getMlbPitcherScore(record) : getMlbBatterScore(record);
  const rows = [...players].sort((a, b) => scoreFor(stats.get(playerApiId(b))) - scoreFor(stats.get(playerApiId(a))) || playerName(a).localeCompare(playerName(b)));
  const columns = pitcher
    ? [["GP", "gamesPlayed"], ["GS", "gamesStarted"], ["IP", "inningsPitched"], ["W", "wins"], ["L", "losses"], ["SV", "saves"], ["BS", "blownSaves"], ["K", "strikeOuts"], ["ERA", "era"], ["WHIP", "whip"]] as const
    : [["GP", "gamesPlayed"], ["AB", "atBats"], ["R", "runs"], ["H", "hits"], ["2B", "doubles"], ["3B", "triples"], ["HR", "homeRuns"], ["RBI", "rbi"], ["BB", "baseOnBalls"], ["SO", "strikeOuts"], ["SB", "stolenBases"]] as const;
  return <RosterSection code={code} label={label} count={players.length}>
    <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">{rows.length ? rows.map((season) => { const apiId = playerApiId(season); const record = stats.get(apiId); const score = scoreFor(record); const games = Number(record?.stats.gamesPlayed ?? 0); const emptyValue = daily ? 0 : undefined; return <MobileRosterCard key={season.id} season={season} nhlTeam={record?.teamAbbreviation || teamNames.get(apiId)} teamLogo={record?.teamLogoUrl || teamLogos.get(apiId)} awards={season.player?.id ? awardsByPlayer.get(season.player.id) || [] : []} onTradeBlock={tradeBlockIds.has(season.id)} interestAction={renderInterest(season)} isLive={false} leadershipRole={leadershipByPlayer.get(season.id)} details={[["GP", formatStatValue(record?.stats.gamesPlayed ?? emptyValue)], [pitcher ? "K" : "HR", formatStatValue(record?.stats[pitcher ? "strikeOuts" : "homeRuns"] ?? emptyValue)], [pitcher ? "W" : "RBI", formatStatValue(record?.stats[pitcher ? "wins" : "rbi"] ?? emptyValue)], ["Score", record || daily ? formatFantasyPoints(score) : "—"], ["FPPG", games ? formatFantasyPoints(score / games) : daily ? formatFantasyPoints(0) : "—"]]} />; }) : <p className="p-4 text-center text-sm text-gray-500">No players.</p>}</div>
    <table className="hidden min-w-full divide-y divide-gray-100 text-xs dark:divide-gray-800 md:table"><thead><tr className="text-center font-semibold uppercase text-gray-500 dark:text-gray-400"><th className="px-2 py-2 text-left">Player</th><th className="px-2 py-2">Pos</th>{columns.map(([heading]) => <th key={heading} className="whitespace-nowrap px-2 py-2">{heading}</th>)}<th className="px-2 py-2">Score</th><th className="px-2 py-2">FPPG</th></tr></thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows.length === 0 ? <EmptyRow columns={columns.length + 4} /> : rows.map((season) => { const apiId = playerApiId(season); const record = stats.get(apiId); const score = scoreFor(record); const games = Number(record?.stats.gamesPlayed ?? 0); return <tr key={season.id} className="text-center text-gray-600 dark:text-gray-300"><td className="px-2 py-2"><PlayerName season={season} nhlTeam={record?.teamAbbreviation || teamNames.get(apiId)} teamLogo={record?.teamLogoUrl || teamLogos.get(apiId)} awards={season.player?.id ? awardsByPlayer.get(season.player.id) || [] : []} onTradeBlock={tradeBlockIds.has(season.id)} interestAction={renderInterest(season)} leadershipRole={leadershipByPlayer.get(season.id)} /></td><td className="px-2 py-2"><PositionBadge position={code} /></td>{columns.map(([heading, key]) => <td key={heading} className="px-2 py-2">{formatStatValue(record?.stats[key] ?? (daily ? 0 : undefined))}</td>)}<td className="px-2 py-2 font-semibold text-gray-800 dark:text-white/90">{record || daily ? formatFantasyPoints(score) : "—"}</td><td className="px-2 py-2">{games ? formatFantasyPoints(score / games) : daily ? formatFantasyPoints(0) : "—"}</td></tr>; })}</tbody>
    </table>
  </RosterSection>;
}

function MobileRosterCard({ season, nhlTeam, teamLogo, awards, onTradeBlock, interestAction, isLive, leadershipRole, details }: { season: PlayerSeasonWithRelations; nhlTeam?: string; teamLogo?: string; awards: PlayerAward[]; onTradeBlock: boolean; interestAction?: React.ReactNode; isLive: boolean; leadershipRole?: "C" | "A"; details: Array<[string, React.ReactNode]> }) {
  return <article className="p-3">
    <PlayerName season={season} nhlTeam={nhlTeam} teamLogo={teamLogo} awards={awards} onTradeBlock={onTradeBlock} interestAction={interestAction} isLive={isLive} leadershipRole={leadershipRole} />
    <dl className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-gray-50 p-2 dark:bg-white/[0.03]">
      {details.map(([label, value]) => <div key={label} className="min-w-0 text-center"><dt className="truncate text-[9px] font-bold uppercase tracking-wide text-gray-400">{label}</dt><dd className="mt-1 truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{value}</dd></div>)}
    </dl>
  </article>;
}

function PayrollCard({ label, value, danger = false, detail }: { label: string; value: string; danger?: boolean; detail?: string }) {
  return <div className={`rounded-lg border p-4 ${danger ? "border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10" : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}>
    <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</p>
    <p className={`mt-2 text-base font-semibold ${danger ? "text-error-700 dark:text-error-400" : "text-gray-800 dark:text-white/90"}`}>{value}</p>
    {detail && <p className="mt-1 text-[10px] font-medium leading-4 text-gray-400">{detail}</p>}
  </div>;
}

function LineupPlayerCard({ season, score, ppg, headshot, teamName, teamLogo, role, isLive }: { season?: PlayerSeasonWithRelations; score?: number; ppg?: number; headshot?: string; teamName?: string; teamLogo?: string; role?: "C" | "A"; isLive?: boolean }) {
  if (!season) return <div className="h-[64px] rounded-lg border border-dashed border-gray-300 bg-white/60 dark:border-gray-700 dark:bg-gray-900/50" />;
  const apiId = playerApiId(season);
  const resolvedHeadshot = headshot || (apiId ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best,f_auto/v1/people/${apiId}/headshot/67/current` : undefined);
  return <Link to={apiId ? `/player-profile?playerId=${apiId}` : "#"} className="group relative flex h-[68px] min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-white/80 bg-white/95 p-1.5 text-left shadow-[0_3px_10px_rgba(15,23,42,.18)] ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg dark:border-gray-700 dark:bg-gray-900/95 dark:ring-gray-700">
    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-red-600 via-amber-400 to-sky-700 opacity-75" />
    <div className="absolute right-2 top-1.5 z-20 rounded-md bg-slate-900/90 px-1.5 py-0.5 text-[9px] font-black tabular-nums text-white shadow-sm ring-1 ring-white/20" title="Total fantasy points (points per game)">
      {formatFantasyPoints(score || 0)} <span className="font-bold text-slate-300">({(ppg || 0).toFixed(2)})</span>
    </div>
    <div className="relative flex h-[54px] w-[46px] shrink-0 items-end justify-center overflow-hidden rounded-lg bg-gradient-to-b from-sky-100 via-slate-50 to-slate-200 dark:from-sky-950 dark:via-gray-800 dark:to-gray-900">
      <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-gray-400">{playerName(season).split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
      {resolvedHeadshot && <img src={resolvedHeadshot} alt={`${playerName(season)} headshot`} onError={(event) => { event.currentTarget.style.display = "none"; }} className="relative z-10 h-full w-full object-contain object-bottom transition group-hover:scale-105" />}
    </div>
    <div className="relative z-10 min-w-0 flex-1">
      <div className="flex items-center gap-1"><PositionBadge position={position(season)} />{role && <LeadershipBadge role={role} />}{isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-error-500" title="Live now" />}</div>
      <p className="mt-1 truncate text-xs font-black tracking-tight text-gray-900 group-hover:text-brand-600 dark:text-white">{playerName(season)}</p>
      <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-wide text-gray-400">{teamName?.split(",")[0] || "MLB"} · {season.salary == null ? "Contract TBD" : `${money.format(season.salary)} | ${season.term_end_year || "—"}`}</p>
    </div>
    {teamLogo && <img src={teamLogo} alt={`${teamName || "MLB club"} logo`} className="pointer-events-none absolute -bottom-2 -right-2 h-14 w-14 object-contain opacity-[0.10] grayscale-[20%] transition group-hover:scale-105 group-hover:opacity-[0.16]" />}
  </Link>;
}

function LineupPreview({ roster, contractHistory, seasonYear, hittingStats, pitchingStats, headshots, nhlTeams, teamLogos, leadershipByPlayer, livePlayerIds, team }: { roster: PlayerSeasonWithRelations[]; contractHistory: PlayerSeasonWithRelations[]; seasonYear: number; hittingStats: Map<string, MlbStatRecord>; pitchingStats: Map<string, MlbStatRecord>; headshots: Map<string, string>; nhlTeams: Map<string, string>; teamLogos: Map<string, string>; leadershipByPlayer: Map<number, "C" | "A">; livePlayerIds: Set<string>; team: FantasyTeam }) {
  const entries = roster.filter((season) => activePositions.has(position(season) as never)).map((season) => {
    const apiId = playerApiId(season);
    const isPitcher = ["SP", "RP", "P"].includes(position(season));
    const record = isPitcher ? pitchingStats.get(apiId) : hittingStats.get(apiId);
    const score = isPitcher ? getMlbPitcherScore(record) : getMlbBatterScore(record);
    const gamesPlayed = Number(record?.stats.gamesPlayed ?? 0);
    return { season, score, ppg: gamesPlayed ? score / gamesPlayed : 0, nhlTeam: record?.teamAbbreviation || nhlTeams.get(apiId), teamLogo: record?.teamLogoUrl };
  }).sort((a, b) => b.score - a.score || playerName(a.season).localeCompare(playerName(b.season)));
  type Entry = (typeof entries)[number];
  const eligiblePositions = (entry: Entry) => position(entry.season)
    .split(/[\s,\/|-]+/)
    .filter(Boolean)
    .map((code) => ["LF", "CF", "RF"].includes(code) ? "OF" : code);
  const pitchers = entries.filter((entry) => eligiblePositions(entry).some((code) => ["SP", "RP", "P"].includes(code)));
  const hitters = entries.filter((entry) => !pitchers.includes(entry));
  const selected = new Set<number>();
  const take = (pool: Entry[], code: string, count = 1) => pool
    .filter((entry) => !selected.has(entry.season.id) && (code === "DH" || eligiblePositions(entry).includes(code)))
    .slice(0, count)
    .map((entry) => { selected.add(entry.season.id); return entry; });
  const field = {
    thirdBase: take(hitters, "3B")[0],
    shortstop: take(hitters, "SS")[0],
    secondBase: take(hitters, "2B")[0],
    firstBase: take(hitters, "1B")[0],
    catcher: take(hitters, "C")[0],
    outfield: take(hitters, "OF", 3),
    designatedHitter: take(hitters, "DH")[0],
  };
  const starters = take(pitchers, "SP", 5);
  const reliever = take(pitchers, "RP")[0];
  const sortReserves = (positionOrder: readonly string[]) => (a: Entry, b: Entry) => {
    const positionRank = (entry: Entry) => {
      const ranks = eligiblePositions(entry)
        .map((code) => positionOrder.indexOf(code))
        .filter((rank) => rank >= 0);
      return ranks.length ? Math.min(...ranks) : positionOrder.length;
    };
    return positionRank(a) - positionRank(b)
      || b.score - a.score
      || playerName(a.season).localeCompare(playerName(b.season));
  };
  const bench = hitters
    .filter((entry) => !selected.has(entry.season.id))
    .sort(sortReserves(["C", "1B", "2B", "SS", "3B", "OF", "DH"]));
  const bullpen = pitchers
    .filter((entry) => !selected.has(entry.season.id))
    .sort(sortReserves(["SP", "RP"]));
  void contractHistory;
  void seasonYear;
  const card = (entry?: Entry) => <LineupPlayerCard season={entry?.season} score={entry?.score} ppg={entry?.ppg} teamName={entry?.nhlTeam} teamLogo={entry?.teamLogo || (entry ? teamLogos.get(playerApiId(entry.season)) : undefined)} headshot={entry ? headshots.get(playerApiId(entry.season)) : undefined} role={entry ? leadershipByPlayer.get(entry.season.id) : undefined} isLive={entry ? livePlayerIds.has(playerApiId(entry.season)) : false} />;
  const slot = (label: string, entry?: Entry, onField = false) => <div><p className={`mb-1 text-center text-[9px] font-black uppercase tracking-[0.18em] ${onField ? "text-gray-500 dark:text-gray-400" : "text-emerald-700 dark:text-emerald-300"}`}>{label}</p>{card(entry)}</div>;
  const reserveSection = (title: string, description: string, players: Entry[]) => players.length > 0 && <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-700 dark:bg-white/[0.025]"><div className="mb-3 flex items-center justify-between gap-3"><div><h4 className="text-xs font-black uppercase tracking-[0.18em] text-gray-700 dark:text-gray-200">{title}</h4><p className="mt-0.5 text-[10px] text-gray-500">{description}</p></div><span className="rounded-full bg-gray-100 px-2 py-1 text-[9px] font-black text-gray-500 dark:bg-gray-800">{players.length}</span></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{players.map((entry) => <div key={entry.season.id}>{card(entry)}</div>)}</div></section>;
  return <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-950/40">
    <div className="relative overflow-hidden border-b border-gray-200 px-5 py-5 dark:border-gray-800">
      <div className="absolute inset-0 opacity-[0.07]" style={{ background: `linear-gradient(120deg, ${team.primary_color || "#2563eb"}, transparent 65%, ${team.secondary_color || "#f97316"})` }} />
      <div className="relative flex items-center gap-3">{team.logo && <img src={team.logo} alt="" className="h-12 w-12 object-contain" />}<div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500">Automatic scoring lineup</p><h3 className="text-xl font-black text-gray-900 dark:text-white">{team.team_name} Lineup Preview</h3><p className="mt-1 text-xs text-gray-500">9 scoring hitters · 5 scoring starters · 1 scoring reliever</p></div></div>
    </div>
    <div className="space-y-5 p-4 sm:p-5">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.8fr)]">
      <section className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-xs dark:border-gray-800 dark:bg-gray-950 sm:p-3">
        <div className="relative hidden aspect-[16/9] overflow-hidden rounded-xl bg-slate-100 dark:bg-gray-900 sm:block">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="outfield-grass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#65a97a" />
                <stop offset="100%" stopColor="#2f7d50" />
              </linearGradient>
              <pattern id="mowing-stripes" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
                <rect width="40" height="80" fill="rgba(255,255,255,.035)" />
              </pattern>
            </defs>
            <path d="M500 535 L52 122 Q500 -120 948 122 Z" fill="url(#outfield-grass)" />
            <path d="M500 535 L52 122 Q500 -120 948 122 Z" fill="url(#mowing-stripes)" />
            <path d="M500 520 L315 345 L500 185 L685 345 Z" fill="#bd8b5f" />
            <path d="M500 470 L370 345 L500 232 L630 345 Z" fill="#438d5e" />
            <path d="M500 520 L52 122 M500 520 L948 122" stroke="rgba(255,255,255,.8)" strokeWidth="3" />
            <path d="M500 520 L315 345 L500 185 L685 345 Z" fill="none" stroke="rgba(255,255,255,.65)" strokeWidth="3" />
            <circle cx="500" cy="362" r="30" fill="#bd8b5f" />
            <rect x="493" y="355" width="14" height="5" rx="2" fill="#f8fafc" />
            <rect x="493" y="178" width="14" height="14" transform="rotate(45 500 185)" fill="#f8fafc" />
            <rect x="678" y="338" width="14" height="14" transform="rotate(45 685 345)" fill="#f8fafc" />
            <rect x="308" y="338" width="14" height="14" transform="rotate(45 315 345)" fill="#f8fafc" />
            <path d="M490 512 L510 512 L516 521 L500 533 L484 521 Z" fill="#f8fafc" />
            <path d="M82 128 Q500 -76 918 128" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="8" />
          </svg>
          <div className="absolute left-[4%] top-[12%] w-[28%] max-w-[180px]">{slot("LEFT FIELD", field.outfield[0], true)}</div>
          <div className="absolute left-1/2 top-[4%] w-[28%] max-w-[180px] -translate-x-1/2">{slot("CENTER FIELD", field.outfield[1], true)}</div>
          <div className="absolute right-[4%] top-[12%] w-[28%] max-w-[180px]">{slot("RIGHT FIELD", field.outfield[2], true)}</div>
          <div className="absolute left-[4%] top-[50%] w-[28%] max-w-[180px]">{slot("3B", field.thirdBase, true)}</div>
          <div className="absolute left-[27%] top-[36%] w-[28%] max-w-[180px]">{slot("SS", field.shortstop, true)}</div>
          <div className="absolute right-[27%] top-[36%] w-[28%] max-w-[180px]">{slot("2B", field.secondBase, true)}</div>
          <div className="absolute right-[4%] top-[50%] w-[28%] max-w-[180px]">{slot("1B", field.firstBase, true)}</div>
          <div className="absolute bottom-[1%] left-1/2 w-[28%] max-w-[180px] -translate-x-1/2">{slot("C", field.catcher, true)}</div>
          <div className="absolute bottom-[4%] right-[3%] w-[25%] max-w-[170px]">{slot("DH", field.designatedHitter, true)}</div>
        </div>
        <div className="grid gap-2 rounded-xl bg-gray-50 p-2 dark:bg-gray-900 sm:hidden">{Array.from({ length: 3 }, (_, index) => <div key={`mobile-of-${index}`}>{slot(`OF ${index + 1}`, field.outfield[index], true)}</div>)}<div className="grid grid-cols-2 gap-2">{slot("3B", field.thirdBase, true)}{slot("SS", field.shortstop, true)}{slot("2B", field.secondBase, true)}{slot("1B", field.firstBase, true)}{slot("C", field.catcher, true)}{slot("DH", field.designatedHitter, true)}</div></div>
      </section>
      <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><section className="rounded-xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.025]"><div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-black uppercase tracking-[0.18em] text-gray-700 dark:text-gray-200">Rotation</h4><span className="text-[9px] font-black uppercase text-gray-400">5 scoring SP</span></div><div className="grid gap-2">{Array.from({ length: 5 }, (_, index) => <div key={`starter-${index}`}>{starters[index] ? card(starters[index]) : <div className="h-[68px] rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">SP {index + 1} available</div>}</div>)}</div></section><section className="rounded-xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.025]"><div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-black uppercase tracking-[0.18em] text-gray-700 dark:text-gray-200">Relief Ace</h4><span className="text-[9px] font-black uppercase text-gray-400">1 scoring RP</span></div>{reliever ? card(reliever) : <div className="h-[68px] rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">RP available</div>}</section></aside>
      </div>
      {reserveSection("Bench", "All non-scoring position players, ordered by position then season fantasy points", bench)}
      {reserveSection("Bullpen", "All pitchers outside the five scoring SP and one scoring RP, ordered by position then season fantasy points", bullpen)}
    </div>
  </div>;
}

function Medal({ icon, value, label, years, tone }: { icon: string; value: number; label: string; years: number[]; tone: "gold" | "silver" | "bronze" }) {
  const styles = {
    gold: "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300",
    silver: "border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-500/10 dark:text-gray-200",
    bronze: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300",
  };
  return <div className={`rounded-lg border p-4 text-center ${styles[tone]}`}>
    <span className="text-2xl" aria-label={label}>{icon}</span>
    <p className="mt-1 text-lg font-semibold">{value}</p>
    <p className="mt-1 min-h-4 text-xs font-medium opacity-80">{years.length ? years.join(", ") : "—"}</p>
  </div>;
}

const featuredAwardOrder = ["Championship", "MVP", "Rookie of the Year", "Top C", "Top LW", "Top RW", "Top D"];
const honourMonths = ["October", "November", "December", "January", "February", "March", "April"];

function normalizedAwardName(name: string) {
  return name.trim().toLowerCase();
}

function TrophyImage({ award, name }: { award?: Award | null; name: string }) {
  return award?.image_url ? (
    <img src={award.image_url} alt={`${name} trophy`} className="h-20 w-20 object-contain drop-shadow-sm" />
  ) : (
    <span className="text-6xl" role="img" aria-label={`${name} trophy`}>🏆</span>
  );
}

function TrophyCase({
  team,
  finishes,
  playerAwards,
  teamSeasons,
  awards,
}: {
  team: FantasyTeam;
  finishes: FantasyTeamFinish[];
  playerAwards: PlayerAward[];
  teamSeasons: PlayerSeasonWithRelations[];
  awards: Award[];
}) {
  const [view, setView] = useState<"seasonal" | "monthly">("seasonal");
  const championshipAward = awards.find((award) => normalizedAwardName(award.name) === "championship");
  const playerSeasonKeys = new Set(teamSeasons.map((season) => `${season.player_id}:${season.season_year}`));
  const seasonalPlayerTrophies = playerAwards
    .filter((assignment) => !assignment.is_monthly)
    .filter((assignment) => assignment.award && normalizedAwardName(assignment.award.name) !== "championship")
    .filter((assignment) => playerSeasonKeys.has(`${assignment.player_id}:${assignment.season_year}`));
  const monthlyPlayerTrophies = playerAwards
    .filter((assignment) => assignment.is_monthly && assignment.fantasy_team_id === team.id);
  const seasonalTrophies = [
    ...finishes
      .filter((finish) => finish.placement === 1)
      .map((finish) => ({
        key: `championship-${finish.id}`,
        name: "Championship",
        year: finish.season_year,
        award: championshipAward,
        player: null as PlayerAward["player"],
        monthIndex: undefined as number | undefined,
      })),
    ...seasonalPlayerTrophies.map((assignment) => ({
      key: `player-award-${assignment.id}`,
      name: assignment.award?.name || "Award",
      year: assignment.season_year,
      award: assignment.award,
      player: assignment.player,
      monthIndex: undefined as number | undefined,
    })),
  ].sort((a, b) => {
    const order = (name: string) => {
      const index = featuredAwardOrder.findIndex((featuredName) => normalizedAwardName(featuredName) === normalizedAwardName(name));
      return index === -1 ? featuredAwardOrder.length : index;
    };
    return order(a.name) - order(b.name) || b.year - a.year;
  });
  const monthlyTrophies = monthlyPlayerTrophies.map((assignment) => ({ key: `monthly-honour-${assignment.id}`, name: assignment.award?.name || "Monthly Honour", year: assignment.season_year, award: assignment.award, player: assignment.player, monthIndex: assignment.month_index })).sort((a, b) => b.year - a.year || (b.monthIndex ?? -1) - (a.monthIndex ?? -1));
  const trophies = view === "seasonal" ? seasonalTrophies : monthlyTrophies;

  return <section id="trophy-case" className="mt-6 scroll-mt-24 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-transparent sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Club honours</p>
      <h3 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">Trophy Case</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Championships and individual awards won while representing the {team.team_name}.</p>
      </div>
      <div className="inline-flex shrink-0 rounded-lg border border-amber-300/70 bg-white/70 p-1 dark:border-amber-500/30 dark:bg-gray-900/60"><button type="button" onClick={() => setView("seasonal")} className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === "seasonal" ? "bg-amber-500 text-white" : "text-gray-500"}`}>Seasonal Awards</button><button type="button" onClick={() => setView("monthly")} className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === "monthly" ? "bg-amber-500 text-white" : "text-gray-500"}`}>Monthly Honours</button></div>
    </div>
    {trophies.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {trophies.map((trophy) => {
        const apiId = trophy.player?.player_api_id;
        const winnerName = trophy.player ? fantasyPlayerName(trophy.player) : team.team_name;
        return <article key={trophy.key} className="flex min-h-36 items-center gap-4 rounded-xl border border-amber-200 bg-white/90 p-4 shadow-sm dark:border-amber-500/20 dark:bg-gray-900/80">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10"><TrophyImage award={trophy.award} name={trophy.name} /></div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">{trophy.monthIndex !== undefined ? `${honourMonths[trophy.monthIndex]} · ` : ""}{trophy.year}</p>
            <h4 className="mt-1 text-base font-bold text-gray-900 dark:text-white">{trophy.name}</h4>
            {apiId ? <Link to={`/player-profile?playerId=${apiId}`} className="mt-1 block truncate text-sm font-medium text-brand-500 hover:underline">{winnerName}</Link> : <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{winnerName}</p>}
          </div>
        </article>;
      })}
    </div> : <p className="mt-5 rounded-lg border border-dashed border-amber-300 p-5 text-center text-sm text-gray-500 dark:border-amber-500/30 dark:text-gray-400">{view === "monthly" ? "No monthly honours have been recorded for this team yet." : "No seasonal trophies have been recorded for this team yet."}</p>}
  </section>;
}

function CompactTable({ code, label, players, teamNames, teamLogos, note, awardsByPlayer, tradeBlockIds, livePlayerIds, renderInterest }: { code: string; label: string; players: PlayerSeasonWithRelations[]; teamNames: Map<string, string>; teamLogos: Map<string, string>; note: string; awardsByPlayer: Map<number, PlayerAward[]>; tradeBlockIds: Set<number>; livePlayerIds: Set<string>; renderInterest: (season: PlayerSeasonWithRelations) => React.ReactNode }) {
  return <RosterSection code={code} label={label} count={players.length} note={note}>
    <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">{players.length ? players.map((season) => { const apiId = playerApiId(season); const mlbTeam = teamNames.get(apiId); return <MobileRosterCard key={season.id} season={season} nhlTeam={mlbTeam} teamLogo={teamLogos.get(apiId)} awards={season.player?.id ? awardsByPlayer.get(season.player.id) || [] : []} onTradeBlock={tradeBlockIds.has(season.id)} interestAction={renderInterest(season)} isLive={livePlayerIds.has(apiId)} details={[["MLB", mlbTeam || "—"], ["Pos", <PositionBadge position={position(season)} />], ["Salary", season.salary == null ? "—" : money.format(season.salary)], ["Term", season.term_end_year || "—"]]} />; }) : <p className="p-4 text-center text-sm text-gray-500">No players.</p>}</div>
    <table className="hidden min-w-full divide-y divide-gray-100 text-xs dark:divide-gray-800 md:table">
      <thead><tr className="text-left font-semibold uppercase text-gray-500 dark:text-gray-400">
        {['Name','Team','Pos','Salary','Term'].map((heading) => <th key={heading} className="px-2 py-2">{heading}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {players.length === 0 ? <EmptyRow columns={5} /> : players.map((season) => {
          const apiId = playerApiId(season);
          const mlbTeam = teamNames.get(apiId);
          return <tr key={season.id} className="text-gray-600 dark:text-gray-300">
            <td className="px-2 py-2"><PlayerName season={season} nhlTeam={mlbTeam} teamLogo={teamLogos.get(apiId)} awards={season.player?.id ? awardsByPlayer.get(season.player.id) || [] : []} onTradeBlock={tradeBlockIds.has(season.id)} interestAction={renderInterest(season)} isLive={livePlayerIds.has(apiId)} /></td>
            <td className="px-2 py-2">{mlbTeam || "—"}</td>
            <td className="px-2 py-2"><PositionBadge position={position(season)} /></td>
            <td className="px-2 py-2">{season.salary == null ? "—" : money.format(season.salary)}</td>
            <td className={`px-2 py-2 ${season.term_end_year === season.season_year ? "font-semibold text-orange-600 dark:text-orange-400" : ""}`}>
              {season.term_end_year || "—"}
              {season.term_end_year === season.season_year && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">Expiring</span>}
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </RosterSection>;
}

function RosterSection({ code, label, count, note, children }: { code: string; label: string; count: number; note?: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
      <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">{code} <span className="font-normal text-gray-500">({label})</span></h4>
      <span className="text-xs text-gray-500 dark:text-gray-400">{note || `${count} players`}</span>
    </div>
    <div className="overflow-x-auto">{children}</div>
  </section>;
}

function EmptyRow({ columns }: { columns: number }) {
  return <tr><td colSpan={columns} className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">No players.</td></tr>;
}

function MultiYearView({
  years,
  rosters,
  hittingStats,
  pitchingStats,
  teamNames,
  teamLogos,
  awardsByPlayer,
  leadershipByPlayer,
}: {
  years: number[];
  rosters: Record<number, PlayerSeasonWithRelations[]>;
  hittingStats: Map<string, MlbStatRecord>;
  pitchingStats: Map<string, MlbStatRecord>;
  teamNames: Map<string, string>;
  teamLogos: Map<string, string>;
  awardsByPlayer: Map<number, PlayerAward[]>;
  leadershipByPlayer: Map<number, "C" | "A">;
}) {
  const summaries = years.map((year) => {
    const rows = rosters[year] || [];
    const salary = rows.filter((row) => capPositions.has(position(row) as never)).reduce((total, row) => total + (row.salary || 0), 0);
    const rosterSize = rows.filter((row) => activePositions.has(position(row) as never)).length;
    const cap = salaryCapForSeason(year);
    return { year, salary, rosterSize, cap, space: cap - salary };
  });

  const players = useMemo(() => {
    const grouped = new Map<string, { representative: PlayerSeasonWithRelations; seasons: Map<number, PlayerSeasonWithRelations> }>();
    years.forEach((year) => (rosters[year] || []).forEach((row) => {
      const key = String(row.player?.id || row.player_id || row.player?.player_api_id || row.id);
      const existing = grouped.get(key);
      if (existing) existing.seasons.set(year, row);
      else grouped.set(key, { representative: row, seasons: new Map([[year, row]]) });
    }));
    return [...grouped.values()];
  }, [rosters, years]);

  const scoreForPlayer = ({ representative }: (typeof players)[number]) => {
    const apiId = playerApiId(representative);
    const pitcher = ["SP", "RP", "P"].includes(position(representative));
    return pitcher ? getMlbPitcherScore(pitchingStats.get(apiId)) : getMlbBatterScore(hittingStats.get(apiId));
  };

  const renderPlayerTable = (code: string, label: string) => {
    const sectionPlayers = players
      .filter(({ representative }) => position(representative) === code)
      .sort((a, b) => scoreForPlayer(b) - scoreForPlayer(a));
    return <RosterSection key={code} code={code} label={label} count={sectionPlayers.length}>
      <table className="min-w-full divide-y divide-gray-100 text-xs dark:divide-gray-800">
        <thead><tr className="text-center font-semibold uppercase text-gray-500 dark:text-gray-400">
          <th className="px-3 py-3 text-left">Player</th><th className="whitespace-nowrap px-3 py-3">MLB Team</th><th className="px-3 py-3">Pos</th>
          {years.map((year) => <th key={year} className="px-3 py-3">{year}</th>)}
          <th className="px-3 py-3">Score</th><th className="px-3 py-3">PPG</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{sectionPlayers.length === 0 ? <EmptyRow columns={years.length + 5} /> : sectionPlayers.map(({ representative, seasons }) => {
          const apiId = playerApiId(representative);
          const isPitcher = ["SP", "RP", "P"].includes(code);
          const record = isPitcher ? pitchingStats.get(apiId) : hittingStats.get(apiId);
          const score = isPitcher ? getMlbPitcherScore(record) : getMlbBatterScore(record);
          const gamesPlayed = Number(record?.stats.gamesPlayed ?? 0);
          const apiPosition = record?.position || code;
          return <tr key={representative.player?.id || representative.id} className="text-center text-gray-600 dark:text-gray-300">
            <td className="px-3 py-3 text-left"><PlayerName season={representative} nhlTeam={record?.teamAbbreviation || teamNames.get(apiId)} teamLogo={record?.teamLogoUrl || teamLogos.get(apiId)} awards={representative.player?.id ? awardsByPlayer.get(representative.player.id) || [] : []} /></td>
            <td className="px-3 py-3">{record?.teamAbbreviation || teamNames.get(apiId) || "—"}</td>
            <td className="px-3 py-3"><PositionBadge position={apiPosition} /></td>
            {years.map((year) => {
              const row = seasons.get(year);
              return <td key={year} className="whitespace-nowrap px-3 py-3 font-medium text-gray-800 dark:text-white/90">{row?.salary == null ? "—" : money.format(row.salary)}{row && <LeadershipBadge role={leadershipByPlayer.get(row.id)} />}</td>;
            })}
            <td className="px-3 py-3 font-semibold text-gray-800 dark:text-white/90">{record ? formatFantasyPoints(score) : "—"}</td>
            <td className="px-3 py-3">{gamesPlayed ? formatFantasyPoints(score / gamesPlayed) : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </RosterSection>;
  };

  return <div className="mt-5 space-y-5">
    {activeSections.map((section) => renderPlayerTable(section.code, section.label))}

    <div className="pt-2"><h3 className="mb-3 font-semibold text-gray-800 dark:text-white/90">Year-by-Year Payroll</h3><div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-white/[0.03]"><tr className="text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400"><th className="px-3 py-3">Season</th><th className="px-3 py-3">Salary Cap</th><th className="px-3 py-3">Salary Spent</th><th className="px-3 py-3">Cap Space</th><th className="px-3 py-3">Roster Size</th></tr></thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{summaries.map((summary) => <tr key={summary.year} className="text-gray-600 dark:text-gray-300"><td className="px-3 py-3 font-semibold text-gray-800 dark:text-white/90">{summary.year}</td><td className="px-3 py-3">{money.format(summary.cap)}</td><td className="px-3 py-3">{money.format(summary.salary)}</td><td className={`px-3 py-3 font-medium ${summary.space < 0 ? "text-error-600 dark:text-error-400" : "text-success-600 dark:text-success-400"}`}>{summary.space < 0 ? `${money.format(Math.abs(summary.space))} over` : money.format(summary.space)}</td><td className={`px-3 py-3 ${summary.rosterSize > ROSTER_LIMIT ? "font-semibold text-error-600 dark:text-error-400" : ""}`}>{summary.rosterSize} / {ROSTER_LIMIT}</td></tr>)}</tbody>
      </table>
    </div></div>
  </div>;
}

function TeamLeadershipEditor({ roster, leadership, disabled, onChange }: { roster: PlayerSeasonWithRelations[]; leadership: TeamLeadership[]; disabled: boolean; onChange: (slot: LeadershipSlot, playerSeasonId: number | null) => void }) {
  const eligible = roster.filter((season) => activePositions.has(position(season) as never)).sort((a, b) => playerName(a).localeCompare(playerName(b)));
  const selected = new Map(leadership.map((entry) => [entry.slot, entry.player_season_id]));
  const slots: Array<[LeadershipSlot, string]> = [["C", "Captain"], ["A1", "Alternate Captain 1"], ["A2", "Alternate Captain 2"]];
  return <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/[0.06]">
    <div><h4 className="font-semibold text-gray-900 dark:text-white">Team Leadership</h4><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Choose one captain and two alternate captains for this season.</p></div>
    <div className="mt-3 grid gap-3 md:grid-cols-3">{slots.map(([slot, label]) => {
      const current = selected.get(slot) ?? "";
      const chosenElsewhere = new Set([...selected.entries()].filter(([otherSlot]) => otherSlot !== slot).map(([, playerId]) => playerId));
      return <label key={slot} className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}<select disabled={disabled} value={current} onChange={(event) => onChange(slot, event.target.value ? Number(event.target.value) : null)} className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"><option value="">Unassigned</option>{eligible.map((season) => <option key={season.id} value={season.id} disabled={chosenElsewhere.has(season.id)}>{playerName(season)} · {position(season)}</option>)}</select></label>;
    })}</div>
  </div>;
}

export default function HockeyTeamDetail() {
  const { user, isAdmin } = useAuth();
  const { abbreviation = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSeason = Number(searchParams.get("season"));
  const [team, setTeam] = useState<FantasyTeam | null>(null);
  const [managerTenures, setManagerTenures] = useState<FantasyTeamManagerTenure[]>([]);
  const [teamFinishes, setTeamFinishes] = useState<FantasyTeamFinish[]>([]);
  const [brandingHistory, setBrandingHistory] = useState<FantasyTeamBranding[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(
    seasonOptions.includes(requestedSeason) ? requestedSeason : CURRENT_LEAGUE_SEASON,
  );
  const [viewMode, setViewMode] = useState<"single" | "lineup" | "multi">("lineup");
  const [roster, setRoster] = useState<PlayerSeasonWithRelations[]>([]);
  const [buyoutPenalties, setBuyoutPenalties] = useState<BuyoutPenalty[]>([]);
  const [retentionAdjustments, setRetentionAdjustments] = useState<RetentionAdjustment[]>([]);
  const [tradeBlockIds, setTradeBlockIds] = useState<Set<number>>(new Set());
  const tradeInterest = usePlayerTradeInterest(selectedSeason);
  const [multiYearRosters, setMultiYearRosters] = useState<Record<number, PlayerSeasonWithRelations[]>>({});
  const [multiYearLeadership, setMultiYearLeadership] = useState<Map<number, "C" | "A">>(new Map());
  const [mlbHittingStats, setMlbHittingStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [mlbPitchingStats, setMlbPitchingStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [lineupHeadshots, setLineupHeadshots] = useState<Map<string, string>>(new Map());
  const [nhlTeamsByPlayer, setNhlTeamsByPlayer] = useState<Map<string, string>>(new Map());
  const [mlbTeamLogosByPlayer, setMlbTeamLogosByPlayer] = useState<Map<string, string>>(new Map());
  const [birthDatesByPlayer, setBirthDatesByPlayer] = useState<Map<string, string>>(new Map());
  const [statsView, setStatsView] = useState<"season" | "today" | "yesterday">("season");
  const [dailyMlbHittingStats, setDailyMlbHittingStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [dailyMlbPitchingStats, setDailyMlbPitchingStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [dailyStatsLoading, setDailyStatsLoading] = useState(false);
  const [livePlayerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [awardsByPlayer, setAwardsByPlayer] = useState<Map<number, PlayerAward[]>>(new Map());
  const [playerAwards, setPlayerAwards] = useState<PlayerAward[]>([]);
  const [awardDefinitions, setAwardDefinitions] = useState<Award[]>([]);
  const [teamPlayerSeasons, setTeamPlayerSeasons] = useState<PlayerSeasonWithRelations[]>([]);
  const [contractHistory, setContractHistory] = useState<PlayerSeasonWithRelations[]>([]);
  const [leadership, setLeadership] = useState<TeamLeadership[]>([]);
  const [canManageLeadership, setCanManageLeadership] = useState(false);
  const [leadershipBusy, setLeadershipBusy] = useState(false);
  const [leadershipError, setLeadershipError] = useState("");

  function handleSeasonChange(year: number) {
    setSelectedSeason(year);
    setSearchParams({ season: String(year) }, { replace: true });
  }

  useEffect(() => {
    setViewMode("lineup");
  }, [abbreviation]);

  useEffect(() => {
    setLoading(true);
    fetchFantasyTeamByAbbreviation(abbreviation)
      .then(async (row) => {
        setTeam(row);
        if (row) {
          const [tenures, finishes, branding, historicalRosters, allContractRows] = await Promise.all([
            fetchTeamManagerTenures(row.id),
            fetchTeamFinishes(row.id),
            fetchTeamBrandingHistory(row.id),
            fetchPlayerSeasonsByTeam(row.id),
            fetchPlayerSeasons(),
          ]);
          setManagerTenures(tenures);
          setTeamFinishes(finishes);
          setBrandingHistory(branding);
          setTeamPlayerSeasons(historicalRosters);
          setContractHistory(allContractRows);
        } else {
          setManagerTenures([]);
          setTeamFinishes([]);
            setTeamPlayerSeasons([]);
            setContractHistory([]);
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [abbreviation]);

  useEffect(() => {
    if (!team) return;
    Promise.all([fetchPlayerSeasonsByTeamAndSeason(team.id, selectedSeason), fetchBuyoutPenalties(selectedSeason, team.id).catch(() => [] as BuyoutPenalty[]), fetchRetentionAdjustments(selectedSeason, team.id).catch(() => [] as RetentionAdjustment[])])
      .then(([seasonRows, penaltyRows, adjustmentRows]) => {
        setRoster(seasonRows);
        setBuyoutPenalties(penaltyRows);
        setRetentionAdjustments(adjustmentRows);
        setError("");
      })
      .catch((err: Error) => setError(err.message));

    fetchTradeBlockListings(selectedSeason)
      .then((rows) => setTradeBlockIds(new Set(rows.map((row) => row.player_season_id))))
      .catch(() => setTradeBlockIds(new Set()));

    Promise.all([fetchPlayerAwards(), fetchAwards(true)])
      .then(([rows, definitions]) => {
        setPlayerAwards(rows);
        setAwardsByPlayer(mapAwardsByPlayer(rows));
        setAwardDefinitions(definitions);
      })
      .catch(() => {
        setPlayerAwards([]);
        setAwardsByPlayer(new Map());
        setAwardDefinitions([]);
      });
  }, [team, selectedSeason]);

  useEffect(() => {
    if (!team) return;
    let active = true;
    Promise.all([
      fetchTeamLeadership(team.id, selectedSeason),
      user ? fetchUserTeamAssignment(user.id, selectedSeason).catch(() => null) : Promise.resolve(null),
    ]).then(([rows, assignment]) => {
      if (!active) return;
      setLeadership(rows);
      setCanManageLeadership(isAdmin || assignment?.fantasy_team_id === team.id);
      setLeadershipError("");
    }).catch((err: Error) => {
      if (active) setLeadershipError(err.message);
    });
    return () => { active = false; };
  }, [team, selectedSeason, user, isAdmin]);

  async function updateLeadership(slot: LeadershipSlot, playerSeasonId: number | null) {
    if (!team || !canManageLeadership) return;
    setLeadershipBusy(true);
    setLeadershipError("");
    try {
      await setTeamLeadershipSlot({ teamId: team.id, seasonYear: selectedSeason, slot, playerSeasonId });
      setLeadership(await fetchTeamLeadership(team.id, selectedSeason));
    } catch (err) {
      setLeadershipError(err instanceof Error ? err.message : "Unable to update team leadership.");
    } finally {
      setLeadershipBusy(false);
    }
  }

  const multiYearSeasons = useMemo(() => Array.from({ length: 5 }, (_, index) => selectedSeason + index), [selectedSeason]);

  useEffect(() => {
    if (!team || viewMode !== "multi") return;
    Promise.all(multiYearSeasons.map(async (year) => {
      const [explicitPlayers, leaders] = await Promise.all([
        fetchPlayerSeasonsByTeamAndSeason(team.id, year),
        fetchTeamLeadership(team.id, year).catch(() => [] as TeamLeadership[]),
      ]);
      const explicitPlayerIds = new Set(explicitPlayers.map((row) => row.player_id));
      const projectedPlayers = roster
        .filter((row) => !explicitPlayerIds.has(row.player_id) && (row.term_end_year ?? row.season_year) >= year)
        .map((row) => ({ ...row, season_year: year }));
      return { year, players: [...explicitPlayers, ...projectedPlayers], leaders };
    }))
      .then((results) => {
        setMultiYearRosters(Object.fromEntries(results.map(({ year, players }) => [year, players])));
        setMultiYearLeadership(new Map(results.flatMap(({ leaders }) => leaders.map((entry) => [entry.player_season_id, entry.slot === "C" ? "C" as const : "A" as const] as const))));
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, [team, viewMode, multiYearSeasons, roster]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchMlbStats("hitting", MLB_FALLBACK_SEASON),
      fetchMlbStats("pitching", MLB_FALLBACK_SEASON),
      fetchMlbStats("hitting", MLB_STATS_SEASON),
      fetchMlbStats("pitching", MLB_STATS_SEASON),
    ]).then(([previousHitters, previousPitchers, currentHitters, currentPitchers]) => {
      if (!active) return;
      setMlbHittingStats(new Map([...previousHitters, ...currentHitters].filter((record) => record.playerId).map((record) => [String(record.playerId), record])));
      setMlbPitchingStats(new Map([...previousPitchers, ...currentPitchers].filter((record) => record.playerId).map((record) => [String(record.playerId), record])));
    }).catch((err: Error) => {
      if (active) setStatsError(err.message || `Unable to load ${MLB_FALLBACK_SEASON}-${MLB_STATS_SEASON} MLB statistics.`);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const metadataRows = [...roster, ...Object.values(multiYearRosters).flat()];
    const ids = [...new Set(metadataRows.map(playerApiId))].filter(Boolean);
    if (!ids.length) return () => { active = false; };

    void Promise.allSettled(ids.map(async (id) => {
      const currentProfile = await fetchMlbPlayerProfile(Number(id), MLB_STATS_SEASON);
      const profile = currentProfile.teamLogoUrl && currentProfile.teamAbbreviation !== "UNK"
        ? currentProfile
        : await fetchMlbPlayerProfile(Number(id), MLB_FALLBACK_SEASON);
      return { id, profile };
    })).then((results) => {
      if (!active) return;
      const headshots = new Map<string, string>();
      const teams = new Map<string, string>();
      const logos = new Map<string, string>();
      const birthDates = new Map<string, string>();

      ids.forEach((id) => headshots.set(id, `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best,f_auto/v1/people/${id}/headshot/67/current`));
      results.forEach((result) => {
        if (result.status !== "fulfilled") return;
        const { id, profile } = result.value;
        if (profile.teamAbbreviation) teams.set(id, profile.teamAbbreviation);
        if (profile.teamLogoUrl) logos.set(id, profile.teamLogoUrl);
        if (profile.birthDate) birthDates.set(id, profile.birthDate);
      });

      setLineupHeadshots(headshots);
      setNhlTeamsByPlayer(teams);
      setMlbTeamLogosByPlayer(logos);
      setBirthDatesByPlayer(birthDates);
    });
    return () => { active = false; };
  }, [roster, multiYearRosters, selectedSeason]);

  useEffect(() => {
    if (statsView === "season") return;
    let active = true;
    const refreshDailyMlbStats = async () => {
      setDailyStatsLoading(true);
      const date = new Date();
      if (statsView === "yesterday") date.setDate(date.getDate() - 1);
      try {
        const [hitters, pitchers] = await Promise.all([
          fetchMlbDailyStats("hitting", date),
          fetchMlbDailyStats("pitching", date),
        ]);
        if (!active) return;
        setDailyMlbHittingStats(new Map(hitters.filter((record) => record.playerId).map((record) => [String(record.playerId), record])));
        setDailyMlbPitchingStats(new Map(pitchers.filter((record) => record.playerId).map((record) => [String(record.playerId), record])));
        setStatsError("");
      } catch (err) {
        if (!active) return;
        setDailyMlbHittingStats(new Map());
        setDailyMlbPitchingStats(new Map());
        setStatsError(err instanceof Error ? err.message : "Unable to load MLB daily statistics.");
      } finally {
        if (active) setDailyStatsLoading(false);
      }
    };
    void refreshDailyMlbStats();
    const intervalId = statsView === "today" ? window.setInterval(() => void refreshDailyMlbStats(), 30_000) : null;
    return () => { active = false; if (intervalId) window.clearInterval(intervalId); };
  }, [statsView]);

  const byPosition = useMemo(() => roster.reduce<Record<string, PlayerSeasonWithRelations[]>>((groups, season) => {
    const code = position(season);
    (groups[code] ||= []).push(season);
    return groups;
  }, {}), [roster]);
  const selectedManager = getManagerForSeason(managerTenures, selectedSeason);
  const displayTeam = team ? applyTeamBranding(team, brandingHistory, selectedSeason) : null;
  const rosterCount = roster.filter((season) => activePositions.has(position(season) as never)).length;
  const ageRoster = roster.filter((season) => ageRosterPositions.has(position(season) as never));
  const ageDate = selectedSeason === CURRENT_LEAGUE_SEASON ? new Date() : new Date(`${selectedSeason - 1}-10-01T12:00:00`);
  const rosterAges = ageRoster.map((season) => birthDatesByPlayer.get(playerApiId(season))).filter((date): date is string => Boolean(date)).map((date) => ageOnDate(date, ageDate)).filter((age): age is number => age !== null);
  const averageRosterAge = rosterAges.length ? rosterAges.reduce((sum, age) => sum + age, 0) / rosterAges.length : null;
  const buyoutPenaltyTotal = buyoutPenalties.reduce((sum, penalty) => sum + penalty.amount, 0);
  const retentionNet = retentionAdjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
  const capSalary = roster.filter((season) => capPositions.has(position(season) as never)).reduce((sum, season) => sum + (season.salary || 0), 0) + buyoutPenaltyTotal + retentionNet;
  const salaryCap = salaryCapForSeason(selectedSeason);
  const capSpace = salaryCap - capSalary;
  const prospects = roster.filter((season) => prospectPositions.has(position(season)));
  const dailyStatsWithSeasonMetadata = (seasonStats: Map<string, MlbStatRecord>, dailyStats: Map<string, MlbStatRecord>) => {
    const merged = new Map([...seasonStats].map(([id, record]) => [id, { ...record, stats: {} }] as const));
    dailyStats.forEach((daily, id) => {
      const fallback = seasonStats.get(id);
      merged.set(id, {
        ...fallback,
        ...daily,
        teamName: daily.teamName && daily.teamName !== "Unknown Team" ? daily.teamName : fallback?.teamName || "Unknown Team",
        teamAbbreviation: daily.teamAbbreviation && daily.teamAbbreviation !== "UNK" ? daily.teamAbbreviation : fallback?.teamAbbreviation || "UNK",
        teamLogoUrl: daily.teamLogoUrl || fallback?.teamLogoUrl,
        stats: daily.stats,
      });
    });
    return merged;
  };
  const displayedMlbHittingStats = statsView === "season" ? mlbHittingStats : dailyStatsWithSeasonMetadata(mlbHittingStats, dailyMlbHittingStats);
  const displayedMlbPitchingStats = statsView === "season" ? mlbPitchingStats : dailyStatsWithSeasonMetadata(mlbPitchingStats, dailyMlbPitchingStats);
  const leadershipByPlayer = new Map(leadership.map((entry) => [entry.player_season_id, entry.slot === "C" ? "C" as const : "A" as const]));
  const finishYears = (placement: 1 | 2 | 3) => teamFinishes
    .filter((finish) => finish.placement === placement)
    .map((finish) => finish.season_year)
    .sort((a, b) => b - a);
  const renderInterest = (season: PlayerSeasonWithRelations) => tradeInterest.canExpressInterest(season) ? <PlayerInterestButton interested={tradeInterest.isInterested(season.id)} busy={tradeInterest.busyPlayerSeasonId === season.id} onClick={() => void tradeInterest.toggleInterest(season)} /> : null;

  return <div>
    <PageMeta title="Great Lakes Dynasty Hockey League" description="GLDHL team roster and payroll" />
    <PageBreadcrumb pageTitle={displayTeam?.team_name || "Team Detail"} />
    {loading && <div className="rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-500">Loading team…</div>}
    {!loading && error && !team && <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-error-700">{error}</div>}
    {!loading && !team && !error && <div className="rounded-2xl border border-gray-200 p-10 text-center"><p>Team not found.</p><Link to="/teams" className="mt-4 inline-block text-brand-500">Back to Teams</Link></div>}
    {team && <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="h-2" style={{ background: `linear-gradient(90deg, ${displayTeam?.primary_color || "#1d4ed8"}, ${displayTeam?.secondary_color || "#f97316"})` }} />
      <div className="p-4 xl:p-6">
        <TeamIdentityCard team={displayTeam || team} season={selectedSeason} managerName={selectedManager?.manager_name || team.manager_name} />
        <div className="mt-4 grid grid-cols-3 gap-3"><Medal icon="🥇" value={team.championships} label="Championships" years={finishYears(1)} tone="gold" /><Medal icon="🥈" value={team.runner_up_finishes} label="Runner-up finishes" years={finishYears(2)} tone="silver" /><Medal icon="🥉" value={team.third_place_finishes} label="Third-place finishes" years={finishYears(3)} tone="bronze" /></div>
        <div className="mt-3 flex flex-wrap justify-end gap-3"><Link to={`/teams/${team.id}/farm-systems`} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">🏒 View Farm Systems</Link><Link to={`/teams/${team.id}/records`} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">📚 View Record Book</Link><a href="#trophy-case" className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600">🏆 View Trophy Case</a></div>
        <TrophyCase team={displayTeam || team} finishes={teamFinishes} playerAwards={playerAwards} teamSeasons={teamPlayerSeasons} awards={awardDefinitions} />

        <div className="mt-6 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-semibold text-gray-800 text-theme-lg dark:text-white/90">Roster &amp; Payroll</h3><p className="text-xs text-gray-500">Active roster limit: {ROSTER_LIMIT} players.</p></div><div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end"><div className="inline-flex min-h-11 flex-wrap rounded-lg border border-gray-300 p-1 dark:border-gray-700"><button type="button" onClick={() => setViewMode("lineup")} className={`rounded-md px-3 py-2 text-sm font-medium ${viewMode === "lineup" ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}>Lineup</button><button type="button" onClick={() => setViewMode("single")} className={`rounded-md px-3 py-2 text-sm font-medium ${viewMode === "single" ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}>Roster</button><button type="button" onClick={() => setViewMode("multi")} className={`rounded-md px-3 py-2 text-sm font-medium ${viewMode === "multi" ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}>Multi-Year</button></div><div className="w-full sm:w-44"><label htmlFor="season" className="mb-1 block text-sm font-medium">{viewMode === "multi" ? "Starting Season" : "Season"}</label><select id="season" value={selectedSeason} onChange={(event) => handleSeasonChange(Number(event.target.value))} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 dark:border-gray-700 dark:bg-gray-900">{seasonOptions.map((year) => <option key={year}>{year}</option>)}</select></div></div></div>
          {viewMode === "single" && <div className="mt-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center"><div className="inline-flex rounded-lg border border-gray-300 p-1 dark:border-gray-700"><button type="button" onClick={() => setStatsView("season")} className={`rounded-md px-3 py-1.5 text-xs font-bold ${statsView === "season" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500"}`}>Season</button><button type="button" onClick={() => setStatsView("today")} className={`rounded-md px-3 py-1.5 text-xs font-bold ${statsView === "today" ? "bg-error-500 text-white" : "text-gray-500"}`}>Today</button><button type="button" onClick={() => setStatsView("yesterday")} className={`rounded-md px-3 py-1.5 text-xs font-bold ${statsView === "yesterday" ? "bg-brand-500 text-white" : "text-gray-500"}`}>Yesterday</button></div>{statsView !== "season" && <span className="text-xs text-gray-500">{dailyStatsLoading ? "Updating…" : statsView === "today" ? "Live MLB stats · updates every 30 seconds" : "Yesterday's MLB results"}</span>}</div>}
          {viewMode !== "multi" && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><PayrollCard label="Salary Cap" value={money.format(salaryCap)} /><PayrollCard label="Cap Salary" value={money.format(capSalary)} /><PayrollCard label="Buyout Penalties" value={money.format(buyoutPenaltyTotal)} /><PayrollCard label="Retention Net" value={money.format(retentionNet)} danger={retentionNet > 0} /><PayrollCard label={capSpace >= 0 ? "Cap Space" : "Over Cap"} value={money.format(Math.abs(capSpace))} danger={capSpace < 0} /><PayrollCard label="Active Roster" value={`${rosterCount} / ${ROSTER_LIMIT}`} danger={rosterCount > ROSTER_LIMIT} /><PayrollCard label="Average Age" value={averageRosterAge === null ? "Loading…" : `${averageRosterAge.toFixed(1)} years`} detail={`${ageRoster.length} active, IR, LTIR and waiver players`} /></div>}
          {viewMode === "single" && canManageLeadership && <TeamLeadershipEditor roster={roster} leadership={leadership} disabled={leadershipBusy} onChange={(slot, playerSeasonId) => void updateLeadership(slot, playerSeasonId)} />}
          {leadershipError && <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">Team leadership: {leadershipError}</div>}
          {error && <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">{error}</div>}
          {statsError && <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">Roster loaded, but MLB statistics could not be loaded: {statsError}</div>}
          {viewMode === "multi" ? <MultiYearView years={multiYearSeasons} rosters={multiYearRosters} hittingStats={mlbHittingStats} pitchingStats={mlbPitchingStats} teamNames={nhlTeamsByPlayer} teamLogos={mlbTeamLogosByPlayer} awardsByPlayer={awardsByPlayer} leadershipByPlayer={multiYearLeadership} /> : viewMode === "lineup" ? <LineupPreview roster={roster} contractHistory={contractHistory} seasonYear={selectedSeason} hittingStats={mlbHittingStats} pitchingStats={mlbPitchingStats} headshots={lineupHeadshots} nhlTeams={nhlTeamsByPlayer} teamLogos={mlbTeamLogosByPlayer} leadershipByPlayer={leadershipByPlayer} livePlayerIds={livePlayerIds} team={displayTeam || team} /> : <div className="mt-5 space-y-4">
            {activeSections.map((section) => <MlbRosterTable key={section.code} code={section.code} label={section.label} players={byPosition[section.code] || []} stats={["SP", "RP"].includes(section.code) ? displayedMlbPitchingStats : displayedMlbHittingStats} teamNames={nhlTeamsByPlayer} teamLogos={mlbTeamLogosByPlayer} daily={statsView !== "season"} awardsByPlayer={awardsByPlayer} tradeBlockIds={tradeBlockIds} leadershipByPlayer={leadershipByPlayer} renderInterest={renderInterest} />)}
            <div className="pt-2"><h3 className="mb-3 font-semibold text-gray-800 dark:text-white/90">Non-Rostered Players</h3><div className="space-y-4">{nonRosterSections.map((section) => <CompactTable key={section.code} code={section.code} label={section.label} players={byPosition[section.code] || []} teamNames={nhlTeamsByPlayer} teamLogos={mlbTeamLogosByPlayer} note={section.cap ? "Counts toward cap only" : "Excluded from cap and roster"} awardsByPlayer={awardsByPlayer} tradeBlockIds={tradeBlockIds} livePlayerIds={livePlayerIds} renderInterest={renderInterest} />)}</div></div>
            <div className="pt-2"><h3 className="mb-3 font-semibold text-gray-800 dark:text-white/90">Buyout Penalties</h3><div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"><div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]"><span className="text-sm font-semibold">Dead cap charges</span><span className="text-xs text-gray-500">Counts toward cap · no roster spot</span></div>{buyoutPenalties.length ? <table className="min-w-full text-sm"><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{buyoutPenalties.map((penalty) => <tr key={penalty.id}><td className="px-3 py-3 font-semibold">{penalty.player?.full_name || "Player buyout"}</td><td className="px-3 py-3 text-center">{penalty.season_year}</td><td className="px-3 py-3 text-right font-black text-error-600">{money.format(penalty.amount)}</td></tr>)}</tbody></table> : <p className="px-3 py-5 text-center text-sm text-gray-500">No buyout penalties this season.</p>}</div></div>
            <div className="pt-2"><h3 className="mb-3 font-semibold text-gray-800 dark:text-white/90">Salary Retention</h3><div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"><div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]"><span className="text-sm font-semibold">Retention charges and relief</span><span className="text-xs text-gray-500">Net adjustment: {money.format(retentionNet)}</span></div>{retentionAdjustments.length ? <table className="min-w-full text-sm"><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{retentionAdjustments.map((adjustment) => { const counterpart = adjustment.adjustment_type === "charge" ? adjustment.retention?.receiving_team : adjustment.retention?.retaining_team; return <tr key={adjustment.id}><td className="px-3 py-3 font-semibold">{adjustment.player?.full_name || "Retained contract"}</td><td className="px-3 py-3 text-center capitalize">{adjustment.adjustment_type}{counterpart ? ` · ${counterpart.abbreviation}` : ""}</td><td className={`px-3 py-3 text-right font-black ${adjustment.amount > 0 ? "text-error-600" : "text-success-600"}`}>{adjustment.amount > 0 ? "+" : "−"}{money.format(Math.abs(adjustment.amount))}</td></tr>; })}</tbody></table> : <p className="px-3 py-5 text-center text-sm text-gray-500">No retention adjustments this season.</p>}</div></div>
            <div className="pt-2"><h3 className="mb-3 font-semibold text-gray-800 dark:text-white/90">Acquired Prospects</h3><CompactTable code="AP" label="Acquired Prospects" players={prospects} teamNames={nhlTeamsByPlayer} teamLogos={mlbTeamLogosByPlayer} note="Excluded from cap and roster" awardsByPlayer={awardsByPlayer} tradeBlockIds={tradeBlockIds} livePlayerIds={livePlayerIds} renderInterest={renderInterest} /></div>
          </div>}
        </div>
      </div>
    </div>}
  </div>;
}
