import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import PositionBadge from "../../components/hockey/PositionBadge";
import { applyTeamBranding, fetchFantasyTeams, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import {
  fetchPlayerSeasonsBySeason,
  type PlayerSeasonWithRelations,
} from "../../lib/fantasyPlayers";
import { fetchMlbDailyStats, fetchMlbStats, type MlbStatRecord } from "../../lib/mlb";
import { CURRENT_LEAGUE_SEASON, playedAndCurrentSeasons } from "../../lib/leagueSeasons";
import { fetchStandingsTeamOrder } from "../../lib/leagueStandings";

const seasonOptions = playedAndCurrentSeasons;

const hitterSlots = [
  ...["C", "1B", "2B", "SS", "3B", "DH"].map((position) => ({ key: position, position, label: position, slotIndex: 0 })),
  ...Array.from({ length: 3 }, (_, index) => ({ key: `OF${index + 1}`, position: "OF", label: `OF${index + 1}`, slotIndex: index })),
];
const pitcherSlots = [
  ...Array.from({ length: 5 }, (_, index) => ({ key: `SP${index + 1}`, position: "SP", label: `SP${index + 1}`, slotIndex: index })),
  { key: "RP", position: "RP", label: "RP", slotIndex: 0 },
];
const standingsSlots = [...hitterSlots, ...pitcherSlots];
const positionGroups = ["C", "1B", "2B", "SS", "3B", "OF", "DH", "SP", "RP"].map((position) => ({
  position,
  slots: standingsSlots.filter((slot) => slot.position === position),
}));

type StandingsRow = {
  team: FantasyTeam;
  rank: number;
  slotScores: Record<string, number>;
  slotPpg: Record<string, number | null>;
  slotPlayers: Record<string, PlayerSeasonWithRelations | undefined>;
  points: number;
  pointsBehind: number;
};

function getPlayerApiId(season?: PlayerSeasonWithRelations) {
  return season?.player?.player_api_id || "";
}

function getPosition(season?: PlayerSeasonWithRelations) {
  return (season?.position || "").toUpperCase();
}

function scoreSlot<T>(
  players: PlayerSeasonWithRelations[],
  slot: { position: string; slotIndex: number },
  stats: Map<string, T>,
  getScore: (record: T) => number,
  getGamesPlayed: (record: T) => number,
) {
  return players
    .filter((season) => getPosition(season) === slot.position)
    .map((season) => {
      const record = stats.get(getPlayerApiId(season));
      const score = record ? getScore(record) : 0;
      const gamesPlayed = record ? getGamesPlayed(record) : 0;
      return { season, score, ppg: gamesPlayed > 0 ? score / gamesPlayed : null };
    })
    .sort((a, b) => b.score - a.score)[slot.slotIndex];
}

function standingsPlayerName(season?: PlayerSeasonWithRelations) {
  return season?.player?.full_name
    || [season?.player?.first_name, season?.player?.last_name].filter(Boolean).join(" ")
    || "Open slot";
}

function compactPlayerName(season?: PlayerSeasonWithRelations) {
  const name = standingsPlayerName(season);
  if (name === "Open slot") return "Open";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

function SlotScoreCell({ season, score, ppg, className, showHeadshot }: { season?: PlayerSeasonWithRelations; score: number; ppg: number | null; className: string; showHeadshot: boolean }) {
  const apiId = getPlayerApiId(season);
  const name = standingsPlayerName(season);
  const content = <>
    {showHeadshot && apiId && <img src={`https://img.mlbstatic.com/mlb-photos/image/upload/w_60,q_auto:best,f_auto/v1/people/${apiId}/headshot/67/current`} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} className="h-6 w-6 shrink-0 rounded-full bg-white object-contain object-bottom ring-1 ring-black/10 dark:bg-gray-800 dark:ring-white/10" />}
    <span className="min-w-0 leading-none"><span className="block truncate text-[8px] font-semibold text-gray-500 dark:text-gray-400">{compactPlayerName(season)}</span><span className="mt-1 block text-[11px] font-bold tabular-nums text-gray-800 dark:text-gray-200">{formatPoints(score)}</span></span>
  </>;
  return <td className={className} title={`${name} · ${formatPoints(score)} points · ${ppg === null ? "—" : ppg.toFixed(2)} PPG`}>{apiId ? <Link to={`/baseball-player-profile?playerId=${apiId}&type=${getPosition(season) === "SP" || getPosition(season) === "RP" ? "pitching" : "hitting"}`} aria-label={`View ${name}`} className="mx-auto flex w-[68px] items-center justify-center gap-1 rounded-md px-1 py-0.5 transition hover:bg-black/5 dark:hover:bg-white/10">{content}</Link> : <span className="mx-auto flex w-[68px] items-center justify-center gap-1 px-1 py-0.5">{content}</span>}</td>;
}

function getBatterScore(record: MlbStatRecord) {
  return Number(record.stats.runs ?? 0) + Number(record.stats.hits ?? 0)
    + Number(record.stats.doubles ?? 0) + Number(record.stats.triples ?? 0) * 2
    + Number(record.stats.homeRuns ?? 0) * 3 + Number(record.stats.rbi ?? 0)
    + Number(record.stats.stolenBases ?? 0) * 2;
}

function getPitcherScore(record: MlbStatRecord) {
  return Number(record.stats.wins ?? 0) * 8 + Number(record.stats.strikeOuts ?? 0)
    + Number(record.stats.saves ?? 0) * 6 + Number(record.stats.completeGames ?? 0) * 5
    + Number(record.stats.shutouts ?? 0) * 5;
}

function statsDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function heatMapClass(value: number, values: number[]) {
  if (!values.length) return "bg-white dark:bg-transparent";
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) return "bg-white dark:bg-transparent";

  const position = (value - minimum) / (maximum - minimum);
  if (position >= 0.8) return "bg-red-100/80 dark:bg-red-500/15";
  if (position >= 0.6) return "bg-red-50/70 dark:bg-red-500/8";
  if (position <= 0.2) return "bg-blue-100/80 dark:bg-blue-500/15";
  if (position <= 0.4) return "bg-blue-50/70 dark:bg-blue-500/8";
  return "bg-white dark:bg-transparent";
}

function podiumRankClass(rank: number) {
  if (rank === 1) return "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300";
  if (rank === 2) return "bg-slate-200 text-slate-700 dark:bg-slate-400/20 dark:text-slate-200";
  if (rank === 3) return "bg-orange-100 text-orange-800 dark:bg-orange-700/20 dark:text-orange-300";
  return "text-gray-500 dark:text-gray-400";
}

function TeamCell({ row, season }: { row: StandingsRow; season: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${podiumRankClass(row.rank)}`}>
        {row.rank}
      </span>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {row.team.logo ? (
          <img
            src={row.team.logo}
            alt={`${row.team.team_name} logo`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-xs font-semibold text-gray-500">
            {row.team.abbreviation}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <Link to={`/teams/${row.team.id}?season=${season}`} title={row.team.team_name} className="block truncate text-xs font-semibold text-brand-500 hover:text-brand-600 hover:underline">
          {row.team.team_name}
        </Link>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">
          {row.team.abbreviation}
        </p>
      </div>
    </div>
  );
}

export default function Standings() {
  const [selectedSeason, setSelectedSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [playerSeasons, setPlayerSeasons] = useState<PlayerSeasonWithRelations[]>([]);
  const [hitterStats, setHitterStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [pitcherStats, setPitcherStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [statsView, setStatsView] = useState<"season" | "today" | "yesterday">("season");
  const [dailyHitterStats, setDailyHitterStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [dailyPitcherStats, setDailyPitcherStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [dailyLoading, setDailyLoading] = useState(false);
  const [showHeatMap, setShowHeatMap] = useState(false);
  const [showHeadshots, setShowHeadshots] = useState(() => window.localStorage.getItem("standings-show-headshots") !== "false");
  const [hidePositionDetails, setHidePositionDetails] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fallbackOrder, setFallbackOrder] = useState<number[]>([]);

  useEffect(() => {
    window.localStorage.setItem("standings-show-headshots", String(showHeadshots));
  }, [showHeadshots]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    const statsRequest = Promise.all([
      fetchMlbStats("hitting", selectedSeason),
      fetchMlbStats("pitching", selectedSeason),
    ]).then(([hitters, pitchers]) => ({ hitters, pitchers }));

    Promise.all([
      fetchFantasyTeams(),
      fetchTeamBrandingHistory(),
      fetchPlayerSeasonsBySeason(selectedSeason),
      statsRequest,
      fetchStandingsTeamOrder(selectedSeason),
    ])
      .then(([teamRows, brandingRows, seasonRows, stats, standingsOrder]) => {
        if (!active) return;

        setTeams(teamRows.map((team) => applyTeamBranding(team, brandingRows, selectedSeason)));
        setPlayerSeasons(seasonRows);
        setHitterStats(new Map(stats.hitters.map((record) => [String(record.playerId), record])));
        setPitcherStats(new Map(stats.pitchers.map((record) => [String(record.playerId), record])));
        setFallbackOrder(standingsOrder);
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Unable to load standings.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedSeason]);

  useEffect(() => {
    if (statsView === "season") return;
    let active = true;
    const refresh = async () => {
      setDailyLoading(true);
      try {
        const date = statsDate(statsView === "yesterday" ? -1 : 0);
        const [hitters, pitchers] = await Promise.all([
          fetchMlbDailyStats("hitting", date),
          fetchMlbDailyStats("pitching", date),
        ]);
        if (!active) return;
        setDailyHitterStats(new Map(hitters.map((record) => [String(record.playerId), record])));
        setDailyPitcherStats(new Map(pitchers.map((record) => [String(record.playerId), record])));
      } catch {
        if (!active) return;
        setDailyHitterStats(new Map());
        setDailyPitcherStats(new Map());
      } finally {
        if (active) setDailyLoading(false);
      }
    };
    void refresh();
    const intervalId = statsView === "today" ? window.setInterval(() => void refresh(), 30_000) : null;
    return () => { active = false; if (intervalId) window.clearInterval(intervalId); };
  }, [statsView, selectedSeason]);

  const displayedHitterStats = statsView === "season" ? hitterStats : dailyHitterStats;
  const displayedPitcherStats = statsView === "season" ? pitcherStats : dailyPitcherStats;

  const standings = useMemo<StandingsRow[]>(() => {
    const rows = teams.map((team) => {
      const teamPlayers = playerSeasons.filter(
        (season) => season.fantasy_team_id === team.id,
      );
      const slotScores: Record<string, number> = {};
      const slotPpg: Record<string, number | null> = {};
      const slotPlayers: Record<string, PlayerSeasonWithRelations | undefined> = {};

      hitterSlots.forEach((slot) => {
        const result = scoreSlot(teamPlayers, slot, displayedHitterStats, getBatterScore, (record) => Number(record.stats.gamesPlayed ?? 0));
        slotScores[slot.key] = result?.score || 0;
        slotPpg[slot.key] = result?.ppg ?? null;
        slotPlayers[slot.key] = result?.season;
      });

      pitcherSlots.forEach((slot) => {
        const result = scoreSlot(teamPlayers, slot, displayedPitcherStats, getPitcherScore, (record) => Number(record.stats.gamesPlayed ?? 0));
        slotScores[slot.key] = result?.score || 0;
        slotPpg[slot.key] = result?.ppg ?? null;
        slotPlayers[slot.key] = result?.season;
      });

      return {
        team,
        rank: 0,
        slotScores,
        slotPpg,
        slotPlayers,
        points: standingsSlots.reduce(
          (total, slot) => total + (slotScores[slot.key] || 0),
          0,
        ),
        pointsBehind: 0,
      };
    });

    const allZero = rows.every((row) => row.points === 0);
    const fallbackRank = new Map(fallbackOrder.map((teamId, index) => [teamId, index]));
    const sortedRows = rows.sort((a, b) => b.points - a.points || (allZero
      ? (fallbackRank.get(a.team.id) ?? Number.MAX_SAFE_INTEGER) - (fallbackRank.get(b.team.id) ?? Number.MAX_SAFE_INTEGER)
      : 0));
    const leaderPoints = sortedRows[0]?.points ?? 0;

    return sortedRows.map((row, index) => ({
      ...row,
      rank: index + 1,
      pointsBehind: leaderPoints - row.points,
    }));
  }, [teams, playerSeasons, displayedHitterStats, displayedPitcherStats, fallbackOrder]);

  const averageRow = useMemo(() => {
    const slotScores = Object.fromEntries(
      standingsSlots.map((slot) => [
        slot.key,
        average(standings.map((row) => row.slotScores[slot.key] || 0)),
      ]),
    );

    return {
      slotScores,
      points: average(standings.map((row) => row.points)),
    };
  }, [standings]);

  const medianRow = useMemo(() => {
    const slotScores = Object.fromEntries(
      standingsSlots.map((slot) => [
        slot.key,
        median(standings.map((row) => row.slotScores[slot.key] || 0)),
      ]),
    );

    return {
      slotScores,
      points: median(standings.map((row) => row.points)),
    };
  }, [standings]);

  const groupScore = (row: StandingsRow, position: string) => positionGroups
    .find((group) => group.position === position)?.slots
    .reduce((total, slot) => total + (row.slotScores[slot.key] || 0), 0) || 0;
  const groupHeatMapValues = Object.fromEntries(positionGroups.map((group) => [
    group.position,
    standings.map((row) => groupScore(row, group.position)),
  ]));
  const heatMapValues = Object.fromEntries(standingsSlots.map((slot) => [
    slot.key,
    standings.map((row) => row.slotScores[slot.key] || 0),
  ]));
  const togglePosition = (position: string) => setExpandedPositions((current) => {
    const next = new Set(current);
    if (next.has(position)) next.delete(position); else next.add(position);
    return next;
  });
  const scoreLabel = statsView === "season" ? "Points" : statsView === "today" ? "Today" : "Yesterday";
  const scoreCaption = statsView === "season" ? "FPTS" : "DAILY FPTS";

  return (
    <div>
      <PageMeta
        title="Standings | Front Office Baseball League"
        description="Front Office Baseball League standings"
      />
      <PageBreadcrumb pageTitle="Standings" />

      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:py-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 text-theme-xl dark:text-white/90">
              {selectedSeason} League Standings
            </h3>
            <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">{statsView === "season" ? "Ranked by total fantasy points from each team’s scoring lineup." : `${scoreLabel}’s gain from scoring-lineup players only.`}</p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto lg:justify-end">
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Score View {dailyLoading && <span className="ml-1 text-brand-500">Updating…</span>}</label><div className="inline-flex h-11 w-full rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900 sm:w-auto">{(["season", "today", "yesterday"] as const).map((view) => <button key={view} type="button" onClick={() => { setStatsView(view); if (view !== "season") setSelectedSeason(CURRENT_LEAGUE_SEASON); }} className={`rounded-md px-3 text-xs font-bold capitalize transition ${statsView === view ? "bg-brand-500 text-white" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>{view}</button>)}</div></div>
            <button
              type="button"
              aria-pressed={hidePositionDetails}
              onClick={() => setHidePositionDetails((current) => !current)}
              className={`inline-flex h-11 items-center justify-between gap-3 rounded-lg border px-3.5 text-sm font-medium shadow-theme-xs transition sm:min-w-40 ${hidePositionDetails ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/10 dark:text-brand-300" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"}`}
            >
              <span>Compact view</span>
              <span className={`relative h-5 w-9 rounded-full transition ${hidePositionDetails ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${hidePositionDetails ? "left-[18px]" : "left-0.5"}`} /></span>
            </button>
            <button
              type="button"
              aria-pressed={showHeatMap}
              onClick={() => setShowHeatMap((current) => !current)}
              className={`inline-flex h-11 items-center justify-between gap-3 rounded-lg border px-3.5 text-sm font-medium shadow-theme-xs transition sm:min-w-40 ${showHeatMap ? "border-gray-300 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-white" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"}`}
            >
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-gradient-to-br from-blue-400 via-white to-red-400 ring-1 ring-gray-300 dark:ring-gray-600" />Heat map</span>
              <span className={`relative h-5 w-9 rounded-full transition ${showHeatMap ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${showHeatMap ? "left-[18px]" : "left-0.5"}`} /></span>
            </button>
            <button
              type="button"
              aria-pressed={showHeadshots}
              onClick={() => setShowHeadshots((current) => !current)}
              className={`inline-flex h-11 items-center justify-between gap-3 rounded-lg border px-3.5 text-sm font-medium shadow-theme-xs transition sm:min-w-40 ${showHeadshots ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/10 dark:text-brand-300" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"}`}
            >
              <span>Headshots</span>
              <span className={`relative h-5 w-9 rounded-full transition ${showHeadshots ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${showHeadshots ? "left-[18px]" : "left-0.5"}`} /></span>
            </button>
            <div className="w-full sm:w-44">
              <label
                htmlFor="standings_season"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Season
              </label>
              <select
                id="standings_season"
                value={selectedSeason}
                disabled={statsView !== "season"}
                onChange={(event) => setSelectedSeason(Number(event.target.value))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {seasonOptions.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-lg border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            Loading standings...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        )}

        {!loading && !error && standings.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            No teams have been added yet.
          </div>
        )}

        {!loading && !error && standings.length > 0 && (
          <>
          <div className="space-y-3 md:hidden">
            {standings.map((row) => (
              <Link
                key={`mobile-${row.team.id}`}
                to={`/teams/${row.team.id}?season=${selectedSeason}`}
                className={`block overflow-hidden rounded-2xl border bg-white shadow-theme-xs transition active:scale-[0.99] dark:bg-gray-900 ${row.rank === 1 ? "border-amber-300 ring-1 ring-amber-100 dark:border-amber-500/60 dark:ring-amber-500/10" : "border-gray-200 dark:border-gray-800"}`}
              >
                <div className="flex items-center gap-3 p-4">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${podiumRankClass(row.rank)}`}>
                    {row.rank}
                  </span>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
                    {row.team.logo ? <img src={row.team.logo} alt="" className="h-full w-full object-contain" /> : <span className="text-xs font-bold text-gray-500">{row.team.abbreviation}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-gray-900 dark:text-white">{row.team.team_name}</p>
                    <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{row.team.abbreviation}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black tabular-nums text-gray-900 dark:text-white">{formatPoints(row.points)}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{scoreCaption}</p>
                  </div>
                </div>
                {!hidePositionDetails && <div className="grid grid-cols-3 border-t border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-white/[0.025]">
                  {positionGroups.map((group) => (
                    <div key={group.position} className={`px-1 py-3 text-center ${showHeatMap ? heatMapClass(groupScore(row, group.position), groupHeatMapValues[group.position]) : ""}`}>
                      <PositionBadge position={group.position} />
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-700 dark:text-gray-200">{formatPoints(groupScore(row, group.position))}</p>
                    </div>
                  ))}
                </div>}
                <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs dark:border-gray-800">
                  <span className="font-semibold text-gray-400">Behind leader</span>
                  <span className={`font-bold tabular-nums ${row.pointsBehind === 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-300"}`}>{row.pointsBehind === 0 ? "Leader" : `−${formatPoints(row.pointsBehind)}`}</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 md:block">
            <table className={`w-full table-fixed divide-y divide-gray-200 text-[11px] dark:divide-gray-800 ${hidePositionDetails ? "min-w-[520px]" : "min-w-[1080px]"}`}>
              <colgroup>
                <col className={hidePositionDetails ? "w-[300px]" : "w-[170px]"} />
                {!hidePositionDetails && positionGroups.flatMap((group) => expandedPositions.has(group.position) ? group.slots.map((slot) => <col key={slot.key} className="w-[76px]" />) : [<col key={group.position} className="w-[54px]" />])}
                <col className="w-[68px]" /><col className="w-[68px]" />
              </colgroup>
              <thead className="bg-gray-50 dark:bg-white/[0.03]">
                <tr>
                  <th rowSpan={hidePositionDetails ? 1 : 2} className="sticky left-0 z-10 bg-gray-50 px-2 py-2 text-left font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    Team
                  </th>
                  {!hidePositionDetails && positionGroups.map((group) => {
                    const expanded = expandedPositions.has(group.position);
                    return <th key={group.position} rowSpan={expanded ? 1 : 2} colSpan={expanded ? group.slots.length : 1} className="border-l border-gray-200 px-1 py-1 text-center font-semibold text-gray-700 dark:border-gray-800 dark:text-gray-200">
                      <button type="button" onClick={() => togglePosition(group.position)} aria-expanded={expanded} className="inline-flex items-center justify-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-200/70 dark:hover:bg-gray-800" title={`${expanded ? "Collapse" : "Expand"} ${group.position} scoring`}><PositionBadge position={group.position} /><span className={`text-[8px] text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span></button>
                    </th>;
                  })}
                  <th rowSpan={hidePositionDetails ? 1 : 2} className="border-l border-gray-200 px-1 py-2 text-center font-bold text-gray-900 dark:border-gray-800 dark:text-white">
                    {scoreLabel}
                  </th>
                  <th rowSpan={hidePositionDetails ? 1 : 2} className="px-1 py-2 text-center font-semibold text-gray-700 dark:text-gray-200">
                    Behind
                  </th>
                </tr>
                {!hidePositionDetails && <tr>{positionGroups.flatMap((group) => expandedPositions.has(group.position) ? group.slots.map((slot) => <th key={slot.key} className="border-l border-t border-gray-200 px-0.5 py-1.5 text-center text-[10px] font-semibold text-gray-500 dark:border-gray-800">{slot.label}</th>) : [])}</tr>}
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {standings.map((row) => (
                  <tr
                    key={row.team.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  >
                    <td className="sticky left-0 z-10 bg-white px-2 py-2 dark:bg-gray-900">
                      <TeamCell row={row} season={selectedSeason} />
                    </td>
                    {!hidePositionDetails && positionGroups.flatMap((group) => expandedPositions.has(group.position) ? group.slots.map((slot) => <SlotScoreCell key={slot.key} season={row.slotPlayers[slot.key]} score={row.slotScores[slot.key] || 0} ppg={row.slotPpg[slot.key]} showHeadshot={showHeadshots} className={`whitespace-nowrap border-l border-gray-100 px-0.5 py-2 text-center transition-colors dark:border-gray-800 ${showHeatMap ? heatMapClass(row.slotScores[slot.key] || 0, heatMapValues[slot.key]) : ""}`} />) : [<td key={group.position} className={`whitespace-nowrap border-l border-gray-100 px-1 py-3 text-center font-bold tabular-nums text-gray-800 transition-colors dark:border-gray-800 dark:text-gray-200 ${showHeatMap ? heatMapClass(groupScore(row, group.position), groupHeatMapValues[group.position]) : ""}`}>{formatPoints(groupScore(row, group.position))}</td>])}
                    <td className="border-l border-gray-100 px-1 py-3 text-center text-xs font-bold text-gray-900 dark:border-gray-800 dark:text-white">
                      {formatPoints(row.points)}
                    </td>
                    <td className="px-1 py-3 text-center text-gray-600 dark:text-gray-300">
                      {row.pointsBehind === 0 ? "-" : formatPoints(row.pointsBehind)}
                    </td>
                  </tr>
                ))}

                <tr className="bg-gray-50 font-medium dark:bg-white/[0.03]">
                  <td className="sticky left-0 z-10 bg-gray-50 px-3 py-3 text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    Average
                  </td>
                  {!hidePositionDetails && positionGroups.flatMap((group) => expandedPositions.has(group.position) ? group.slots.map((slot) => <td key={slot.key} className="whitespace-nowrap border-l border-gray-200 px-2 py-3 text-center tabular-nums text-gray-600 dark:border-gray-800 dark:text-gray-300">{formatPoints(averageRow.slotScores[slot.key] || 0)}</td>) : [<td key={group.position} className="whitespace-nowrap border-l border-gray-200 px-3 py-3 text-center font-semibold tabular-nums text-gray-700 dark:border-gray-800 dark:text-gray-200">{formatPoints(average(standings.map((row) => groupScore(row, group.position))))}</td>])}
                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-200">
                    {formatPoints(averageRow.points)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-400">-</td>
                </tr>

                <tr className="bg-gray-50 font-medium dark:bg-white/[0.03]">
                  <td className="sticky left-0 z-10 bg-gray-50 px-3 py-3 text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    Median
                  </td>
                  {!hidePositionDetails && positionGroups.flatMap((group) => expandedPositions.has(group.position) ? group.slots.map((slot) => <td key={slot.key} className="whitespace-nowrap border-l border-gray-200 px-2 py-3 text-center tabular-nums text-gray-600 dark:border-gray-800 dark:text-gray-300">{formatPoints(medianRow.slotScores[slot.key] || 0)}</td>) : [<td key={group.position} className="whitespace-nowrap border-l border-gray-200 px-3 py-3 text-center font-semibold tabular-nums text-gray-700 dark:border-gray-800 dark:text-gray-200">{formatPoints(median(standings.map((row) => groupScore(row, group.position))))}</td>])}
                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-200">
                    {formatPoints(medianRow.points)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-400">-</td>
                </tr>
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
