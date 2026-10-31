import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import {
  FantasyTeam,
  FantasyTeamManagerTenure,
  fetchFantasyTeamByAbbreviation,
  fetchTeamManagerTenures,
  getManagerForSeason,
} from "../../lib/fantasyTeams";
import {
  fetchPlayerSeasonsByTeamAndSeason,
  PlayerSeasonWithRelations,
} from "../../lib/fantasyPlayers";
import {
  fetchMlbBoxScore,
  fetchMlbDailyStats,
  fetchMlbGames,
  fetchMlbStats,
  formatStatValue,
  type MlbStatRecord,
} from "../../lib/mlb";

const seasonOptions = Array.from({ length: 10 }, (_, index) => 2026 + index);
const salaryCap = 47_000_000;
const capOnlyPositions = new Set(["W", "IR"]);
type StatsView = "year" | "today";

const batterSections = [
  { code: "C", label: "Catcher" },
  { code: "1B", label: "First Base" },
  { code: "2B", label: "Second Base" },
  { code: "SS", label: "Shortstop" },
  { code: "3B", label: "Third Base" },
  { code: "OF", label: "Outfield" },
  { code: "DH", label: "Designated Hitter" },
];

const pitcherSections = [
  { code: "SP", label: "Starting Pitcher" },
  { code: "RP", label: "Relief Pitcher" },
];

const capOnlySections = [
  { code: "W", label: "Waiver" },
  { code: "IR", label: "Injured Reserve" },
];

const salaryPositionOrder = [
  "C",
  "1B",
  "2B",
  "SS",
  "3B",
  "OF",
  "DH",
  "SP",
  "RP",
  "W",
  "IR",
];

const salaryGroups = [
  { label: "Infield", positions: ["C", "1B", "2B", "SS", "3B"] },
  { label: "Outfield", positions: ["OF"] },
  { label: "Pitching", positions: ["SP", "RP"] },
  { label: "Non Rostered", positions: ["W", "IR"] },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatYear(date: string | null) {
  if (!date) return "Not set";

  return String(new Date(`${date}T00:00:00`).getFullYear());
}

function DetailItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-gray-800 dark:text-white/90">
        {value || "Not set"}
      </p>
    </div>
  );
}

function PayrollItem({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "positive" | "danger";
}) {
  const styles = {
    default: "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900",
    positive:
      "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10",
    danger:
      "border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10",
  };

  const valueStyles = {
    default: "text-gray-800 dark:text-white/90",
    positive: "text-success-700 dark:text-success-400",
    danger: "text-error-700 dark:text-error-400",
  };

  return (
    <div className={`rounded-lg border p-4 ${styles[tone]}`}>
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-2 text-base font-semibold ${valueStyles[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function MedalItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "gold" | "silver" | "bronze";
}) {
  const styles = {
    gold: "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300",
    silver: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
    bronze: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300",
  };

  const medals = {
    gold: "1st",
    silver: "2nd",
    bronze: "3rd",
  };

  return (
    <div className={`rounded-lg border p-4 ${styles[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase">{medals[tone]}</span>
        <span className="text-2xl font-semibold">{value}</span>
      </div>
      <p className="mt-2 text-sm font-medium">{label}</p>
    </div>
  );
}

function formatSalary(salary: number | null) {
  return salary === null ? "Not set" : currencyFormatter.format(salary);
}

function getPlayerName(season: PlayerSeasonWithRelations) {
  const player = season.player;
  return (
    player?.full_name ||
    [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
    "Unknown Player"
  );
}

function getPosition(season: PlayerSeasonWithRelations) {
  return (season.position || "Unassigned").toUpperCase();
}

function getPlayerApiId(season: PlayerSeasonWithRelations) {
  return season.player?.player_api_id || "";
}

function getBatterScore(record: MlbStatRecord | undefined) {
  if (!record) return 0;

  return (
    Number(record.stats.runs ?? 0) * 1 +
    Number(record.stats.hits ?? 0) * 1 +
    Number(record.stats.doubles ?? 0) * 1 +
    Number(record.stats.triples ?? 0) * 2 +
    Number(record.stats.homeRuns ?? 0) * 3 +
    Number(record.stats.rbi ?? 0) * 1 +
    Number(record.stats.stolenBases ?? 0) * 2
  );
}

function getPitcherScore(record: MlbStatRecord | undefined) {
  if (!record) return 0;

  return (
    Number(record.stats.wins ?? 0) * 8 +
    Number(record.stats.strikeOuts ?? 0) * 1 +
    Number(record.stats.saves ?? 0) * 6 +
    Number(record.stats.completeGames ?? 0) * 5 +
    Number(record.stats.shutouts ?? 0) * 5
  );
}

function getPpg(record: MlbStatRecord | undefined, score: number) {
  const gamesPlayed = Number(record?.stats.gamesPlayed ?? 0);

  if (!gamesPlayed) {
    return null;
  }

  return score / gamesPlayed;
}

function sortPlayersByScore(
  players: PlayerSeasonWithRelations[],
  stats: Map<string, MlbStatRecord>,
  getScore: (record: MlbStatRecord | undefined) => number,
) {
  return [...players].sort((a, b) => {
    const aScore = getScore(stats.get(getPlayerApiId(a)));
    const bScore = getScore(stats.get(getPlayerApiId(b)));

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    return getPlayerName(a).localeCompare(getPlayerName(b));
  });
}

function mapStatsByPlayerId(records: MlbStatRecord[]) {
  return new Map(
    records
      .filter((record) => record.playerId)
      .map((record) => [String(record.playerId), record]),
  );
}

function RosterPlayerCell({
  season,
  teamLogoUrl,
  teamName,
  isLive,
  isProbableStarter,
}: {
  season: PlayerSeasonWithRelations;
  teamLogoUrl?: string;
  teamName?: string;
  isLive?: boolean;
  isProbableStarter?: boolean;
}) {
  const apiId = getPlayerApiId(season);
  const contractText = `${formatSalary(season.salary)}${
    season.term_end_year ? ` | ${season.term_end_year}` : ""
  }`;

  return (
    <div className="flex min-w-40 items-center gap-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        {teamLogoUrl ? (
          <img
            src={teamLogoUrl}
            alt={`${teamName || "MLB team"} logo`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-[10px] font-semibold text-gray-500">
            MLB
          </span>
        )}
      </div>
      {apiId ? (
        <div>
          <Link
            to={`/player-profile?playerId=${apiId}`}
            className="font-medium text-brand-500 hover:text-brand-600 hover:underline"
          >
            {getPlayerName(season)}
          </Link>
          {isLive && <LiveBadge />}
          {isProbableStarter && <ProbableStarterBadge />}
          <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            {contractText}
          </p>
        </div>
      ) : (
        <div>
          <span className="font-medium text-gray-800 dark:text-white/90">
            {getPlayerName(season)}
          </span>
          {isLive && <LiveBadge />}
          {isProbableStarter && <ProbableStarterBadge />}
          <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            {contractText}
          </p>
        </div>
      )}
    </div>
  );
}

function LiveBadge() {
  return (
    <span className="ml-2 inline-flex rounded-full bg-error-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-error-700 ring-1 ring-error-200 dark:bg-error-500/10 dark:text-error-300 dark:ring-error-500/30">
      Live
    </span>
  );
}

function ProbableStarterBadge() {
  return (
    <span className="ml-2 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30">
      Probable SP
    </span>
  );
}

function BatterRosterTable({
  code,
  label,
  players,
  stats,
  sortStats,
  livePlayerIds,
  probableStarterIds,
}: {
  code: string;
  label: string;
  players: PlayerSeasonWithRelations[];
  stats: Map<string, MlbStatRecord>;
  sortStats: Map<string, MlbStatRecord>;
  livePlayerIds: Set<string>;
  probableStarterIds: Set<string>;
}) {
  const sortedPlayers = sortPlayersByScore(players, sortStats, getBatterScore);

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {code} <span className="font-normal text-gray-500 dark:text-gray-400">({label})</span>
        </h4>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {players.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-xs dark:divide-gray-800">
          <thead>
            <tr className="bg-white text-center font-semibold uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <th className="px-2 py-2 text-left">Player</th>
              <th className="px-2 py-2">G</th>
              <th className="px-2 py-2">AB</th>
              <th className="px-2 py-2">R</th>
              <th className="px-2 py-2">H</th>
              <th className="px-2 py-2">2B</th>
              <th className="px-2 py-2">3B</th>
              <th className="px-2 py-2">HR</th>
              <th className="px-2 py-2">RBI</th>
              <th className="px-2 py-2">BB</th>
              <th className="px-2 py-2">SO</th>
              <th className="px-2 py-2">SB</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">PPG</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sortedPlayers.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                  No players.
                </td>
              </tr>
            ) : (
              sortedPlayers.map((season) => {
                const record = stats.get(getPlayerApiId(season));
                const score = getBatterScore(record);
                const ppg = getPpg(record, score);

                return (
                                  <tr key={season.id} className="text-center text-gray-600 dark:text-gray-300">
                                    <td className="px-2 py-2 text-left">
                                      <RosterPlayerCell
                                        season={season}
                                        teamLogoUrl={record?.teamLogoUrl}
                                        teamName={record?.teamName}
                                        isLive={livePlayerIds.has(getPlayerApiId(season))}
                                        isProbableStarter={probableStarterIds.has(getPlayerApiId(season))}
                                      />
                                    </td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.gamesPlayed)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.atBats)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.runs)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.hits)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.doubles)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.triples)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.homeRuns)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.rbi)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.baseOnBalls)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.strikeOuts)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.stolenBases)}</td>
                    <td className="px-2 py-2 font-semibold text-gray-800 dark:text-white/90">{score}</td>
                    <td className="px-2 py-2">{ppg === null ? "—" : ppg.toFixed(2)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PitcherRosterTable({
  code,
  label,
  players,
  stats,
  sortStats,
  livePlayerIds,
  probableStarterIds,
}: {
  code: string;
  label: string;
  players: PlayerSeasonWithRelations[];
  stats: Map<string, MlbStatRecord>;
  sortStats: Map<string, MlbStatRecord>;
  livePlayerIds: Set<string>;
  probableStarterIds: Set<string>;
}) {
  const sortedPlayers = sortPlayersByScore(players, sortStats, getPitcherScore);

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {code} <span className="font-normal text-gray-500 dark:text-gray-400">({label})</span>
        </h4>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {players.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-xs dark:divide-gray-800">
          <thead>
            <tr className="bg-white text-center font-semibold uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <th className="px-2 py-2 text-left">Player</th>
              <th className="px-2 py-2">G</th>
              <th className="px-2 py-2">GS</th>
              <th className="px-2 py-2">IP</th>
              <th className="px-2 py-2">W</th>
              <th className="px-2 py-2">L</th>
              <th className="px-2 py-2">SV</th>
              <th className="px-2 py-2">H</th>
              <th className="px-2 py-2">ER</th>
              <th className="px-2 py-2">HR</th>
              <th className="px-2 py-2">BB</th>
              <th className="px-2 py-2">SO</th>
              <th className="px-2 py-2">C</th>
              <th className="px-2 py-2">SHO</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">PPG</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sortedPlayers.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                  No players.
                </td>
              </tr>
            ) : (
              sortedPlayers.map((season) => {
                const record = stats.get(getPlayerApiId(season));
                const score = getPitcherScore(record);
                const ppg = getPpg(record, score);

                return (
                                  <tr key={season.id} className="text-center text-gray-600 dark:text-gray-300">
                                    <td className="px-2 py-2 text-left">
                                      <RosterPlayerCell
                                        season={season}
                                        teamLogoUrl={record?.teamLogoUrl}
                                        teamName={record?.teamName}
                                        isLive={livePlayerIds.has(getPlayerApiId(season))}
                                        isProbableStarter={probableStarterIds.has(getPlayerApiId(season))}
                                      />
                                    </td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.gamesPlayed)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.gamesStarted)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.inningsPitched)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.wins)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.losses)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.saves)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.hits)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.earnedRuns)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.homeRuns)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.baseOnBalls)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.strikeOuts)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.completeGames)}</td>
                    <td className="px-2 py-2">{formatStatValue(record?.stats.shutouts)}</td>
                    <td className="px-2 py-2 font-semibold text-gray-800 dark:text-white/90">{score}</td>
                    <td className="px-2 py-2">{ppg === null ? "—" : ppg.toFixed(2)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CapOnlyRosterTable({
  code,
  label,
  players,
  hittingStats,
  pitchingStats,
  livePlayerIds,
  probableStarterIds,
}: {
  code: string;
  label: string;
  players: PlayerSeasonWithRelations[];
  hittingStats: Map<string, MlbStatRecord>;
  pitchingStats: Map<string, MlbStatRecord>;
  livePlayerIds: Set<string>;
  probableStarterIds: Set<string>;
}) {
  if (players.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {code} <span className="font-normal text-gray-500 dark:text-gray-400">({label})</span>
        </h4>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Counts toward cap only
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-xs dark:divide-gray-800">
          <thead>
            <tr className="bg-white text-left font-semibold uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <th className="px-2 py-2">Player</th>
              <th className="px-2 py-2">Position</th>
              <th className="px-2 py-2">Contract AAV</th>
              <th className="px-2 py-2">Term</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {players.map((season) => (
              <tr key={season.id} className="text-gray-600 dark:text-gray-300">
                <td className="px-2 py-2">
                  <RosterPlayerCell
                    season={season}
                    teamLogoUrl={
                      hittingStats.get(getPlayerApiId(season))?.teamLogoUrl ||
                      pitchingStats.get(getPlayerApiId(season))?.teamLogoUrl
                    }
                    teamName={
                      hittingStats.get(getPlayerApiId(season))?.teamName ||
                      pitchingStats.get(getPlayerApiId(season))?.teamName
                    }
                    isLive={livePlayerIds.has(getPlayerApiId(season))}
                    isProbableStarter={probableStarterIds.has(getPlayerApiId(season))}
                  />
                </td>
                <td className="px-2 py-2">{getPosition(season)}</td>
                <td className="px-2 py-2">{formatSalary(season.salary)}</td>
                <td className="px-2 py-2">{season.term_end_year || "Not set"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function TeamDetail() {
  const { abbreviation = "" } = useParams();
  const [team, setTeam] = useState<FantasyTeam | null>(null);
  const [managerTenures, setManagerTenures] = useState<FantasyTeamManagerTenure[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [statsView, setStatsView] = useState<StatsView>("year");
  const [roster, setRoster] = useState<PlayerSeasonWithRelations[]>([]);
  const [hittingStats, setHittingStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [pitchingStats, setPitchingStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [todayHittingStats, setTodayHittingStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [todayPitchingStats, setTodayPitchingStats] = useState<Map<string, MlbStatRecord>>(new Map());
  const [livePlayerIds, setLivePlayerIds] = useState<Set<string>>(new Set());
  const [probableStarterIds, setProbableStarterIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState("");
  const [rosterError, setRosterError] = useState("");
  const [statsError, setStatsError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    fetchFantasyTeamByAbbreviation(abbreviation)
      .then(async (teamRow) => {
        setTeam(teamRow);
        setManagerTenures(teamRow ? await fetchTeamManagerTenures(teamRow.id) : []);
      })
      .catch((err) => setError(err.message || "Unable to load team."))
      .finally(() => setLoading(false));
  }, [abbreviation]);

  const selectedManager = useMemo(
    () => getManagerForSeason(managerTenures, selectedSeason),
    [managerTenures, selectedSeason],
  );

  useEffect(() => {
    if (!team) {
      setRoster([]);
      return;
    }

    setRosterLoading(true);
    setRosterError("");

    fetchPlayerSeasonsByTeamAndSeason(team.id, selectedSeason)
      .then(setRoster)
      .catch((err) => setRosterError(err.message || "Unable to load roster."))
      .finally(() => setRosterLoading(false));
  }, [team, selectedSeason]);

  useEffect(() => {
    let active = true;

    setStatsLoading(true);
    setStatsError("");

    Promise.all([
      fetchMlbStats("hitting", selectedSeason),
      fetchMlbStats("pitching", selectedSeason),
    ])
      .then(([hitters, pitchers]) => {
        if (!active) return;

        setHittingStats(mapStatsByPlayerId(hitters));
        setPitchingStats(mapStatsByPlayerId(pitchers));
      })
      .catch((err) => {
        if (active) {
          setStatsError(err.message || "Unable to load MLB stats.");
          setHittingStats(new Map());
          setPitchingStats(new Map());
        }
      })
      .finally(() => {
        if (active) {
          setStatsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedSeason]);

  useEffect(() => {
    let active = true;

    async function loadTodayStats() {
      if (statsView !== "today") return;

      setStatsLoading(true);
      setStatsError("");

      try {
        const [hitters, pitchers] = await Promise.all([
          fetchMlbDailyStats("hitting"),
          fetchMlbDailyStats("pitching"),
        ]);

        if (active) {
          setTodayHittingStats(mapStatsByPlayerId(hitters));
          setTodayPitchingStats(mapStatsByPlayerId(pitchers));
        }
      } catch (err) {
        if (active) {
          setStatsError(
            err instanceof Error ? err.message : "Unable to load today's MLB stats.",
          );
          setTodayHittingStats(new Map());
          setTodayPitchingStats(new Map());
        }
      } finally {
        if (active) {
          setStatsLoading(false);
        }
      }
    }

    loadTodayStats();

    return () => {
      active = false;
    };
  }, [statsView]);

  useEffect(() => {
    let active = true;

    async function loadGameIndicators() {
      try {
        const games = await fetchMlbGames();
        const liveGames = games.filter((game) => game.status === "live");
        const nextProbableStarterIds = new Set(
          games
            .flatMap((game) => [
              game.away.probablePitcherId,
              game.home.probablePitcherId,
            ])
            .filter((playerId): playerId is number => typeof playerId === "number")
            .map((playerId) => String(playerId)),
        );

        if (!liveGames.length) {
          if (active) {
            setLivePlayerIds(new Set());
            setProbableStarterIds(nextProbableStarterIds);
          }
          return;
        }

        const boxScores = await Promise.all(
          liveGames.map((game) => fetchMlbBoxScore(game.gamePk)),
        );
        const nextLivePlayerIds = new Set(
          boxScores.flatMap((boxScore) =>
            boxScore.players.map((player) => String(player.playerId)),
          ),
        );

        if (active) {
          setLivePlayerIds(nextLivePlayerIds);
          setProbableStarterIds(nextProbableStarterIds);
        }
      } catch {
        if (active) {
          setLivePlayerIds(new Set());
          setProbableStarterIds(new Set());
        }
      }
    }

    loadGameIndicators();
    const intervalId = window.setInterval(loadGameIndicators, 60_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const rosterByPosition = useMemo(() => {
    return roster.reduce<Record<string, PlayerSeasonWithRelations[]>>((groups, season) => {
      const position = getPosition(season);
      groups[position] = groups[position] || [];
      groups[position].push(season);
      return groups;
    }, {});
  }, [roster]);

  const salaryByPosition = useMemo(() => {
    return roster.reduce<Record<string, number>>((totals, season) => {
      const position = getPosition(season);
      totals[position] = (totals[position] || 0) + (season.salary || 0);
      return totals;
    }, {});
  }, [roster]);

  const salaryByGroup = useMemo(() => {
    return Object.fromEntries(
      salaryGroups.map((group) => [
        group.label,
        group.positions.reduce(
          (total, position) => total + (salaryByPosition[position] || 0),
          0,
        ),
      ]),
    );
  }, [salaryByPosition]);

  const totalSalary = useMemo(
    () => roster.reduce((total, season) => total + (season.salary || 0), 0),
    [roster],
  );
  const capSpace = salaryCap - totalSalary;
  const activeHittingStats = statsView === "today" ? todayHittingStats : hittingStats;
  const activePitchingStats = statsView === "today" ? todayPitchingStats : pitchingStats;

  const rosterCount = useMemo(
    () => roster.filter((season) => !capOnlyPositions.has(getPosition(season))).length,
    [roster],
  );

  return (
    <div>
      <PageMeta title="Great Lakes Dynasty Hockey League" description="GLDHL fantasy team details" />
      <PageBreadcrumb pageTitle={team?.team_name || "Team Detail"} />

      {loading && (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          Loading team...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-error-200 bg-error-50 px-5 py-6 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {!loading && !error && !team && (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="font-semibold text-gray-800 text-theme-xl dark:text-white/90">
            Team Not Found
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This team does not exist or is not active publicly.
          </p>
          <Link
            to="/teams"
            className="mt-6 inline-flex rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            Back to Teams
          </Link>
        </div>
      )}

      {!loading && !error && team && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div
            className="h-3"
            style={{
              background: `linear-gradient(90deg, ${
                team.primary_color || "#1d4ed8"
              }, ${team.secondary_color || "#f97316"})`,
            }}
          />

          <div className="p-4 xl:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                  {team.logo ? (
                    <img
                      src={team.logo}
                      alt={`${team.team_name} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-base font-semibold text-gray-500 dark:text-gray-400">
                      {team.abbreviation}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                    {team.team_name}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                    {team.abbreviation}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 text-sm text-gray-600 dark:text-gray-300 sm:grid-cols-2 lg:min-w-72">
                <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
                  <span className="block text-xs uppercase text-gray-500 dark:text-gray-400">
                    Manager
                  </span>
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    {selectedManager?.manager_name || team.manager_name || "Not set"}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
                  <span className="block text-xs uppercase text-gray-500 dark:text-gray-400">
                    Seasons
                  </span>
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    {selectedManager
                      ? `${selectedManager.start_season}–${selectedManager.end_season || "present"}`
                      : formatYear(team.manager_since)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <DetailItem label="MLB Farm System 1" value={team.eastern_farm_system || "See seasonal farm tracker"} />
              <DetailItem label="MLB Farm System 2" value={team.western_farm_system || "See seasonal farm tracker"} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MedalItem label="Championships" value={team.championships} tone="gold" />
              <MedalItem label="Runner-Up" value={team.runner_up_finishes} tone="silver" />
              <MedalItem label="Third Place" value={team.third_place_finishes} tone="bronze" />
            </div>

            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800 text-theme-lg dark:text-white/90">
                    Roster & Payroll
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Public read-only roster data for the selected season.
                  </p>
                </div>

                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                      Stats
                    </label>
                    <div className="flex rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
                      <button
                        type="button"
                        onClick={() => setStatsView("year")}
                        className={`h-9 rounded-md px-3 text-sm font-semibold transition ${
                          statsView === "year"
                            ? "bg-brand-500 text-white"
                            : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        }`}
                      >
                        Year Stats
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatsView("today")}
                        className={`h-9 rounded-md px-3 text-sm font-semibold transition ${
                          statsView === "today"
                            ? "bg-brand-500 text-white"
                            : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        }`}
                      >
                        Today's Stats
                      </button>
                    </div>
                  </div>

                  <div className="w-full sm:w-44">
                    <label
                      htmlFor="season_selector"
                      className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
                    >
                      Season
                    </label>
                    <select
                      id="season_selector"
                      value={selectedSeason}
                      onChange={(event) => setSelectedSeason(Number(event.target.value))}
                      className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
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

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <PayrollItem label="Salary Cap" value={formatSalary(salaryCap)} />
                <PayrollItem label="Salary Spent" value={formatSalary(totalSalary)} />
                <PayrollItem
                  label={capSpace >= 0 ? "Cap Space" : "Over Cap"}
                  value={formatSalary(Math.abs(capSpace))}
                  tone={capSpace >= 0 ? "positive" : "danger"}
                />
                <PayrollItem label="Roster Count" value={rosterCount} />
              </div>

              {rosterLoading && (
                <div className="mt-5 rounded-lg border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  Loading roster...
                </div>
              )}

              {!rosterLoading && rosterError && (
                <div className="mt-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
                  {rosterError}
                </div>
              )}

              {!rosterLoading && !rosterError && roster.length === 0 && (
                <div className="mt-5 rounded-lg border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  No players have been added for {selectedSeason}.
                </div>
              )}

              {!rosterLoading && !rosterError && roster.length > 0 && (
                <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-4">
                    {statsLoading && (
                      <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        Loading MLB stats...
                      </div>
                    )}
                    {statsError && (
                      <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-xs text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
                        {statsError}
                      </div>
                    )}
                    {batterSections.map((section) => (
                      <BatterRosterTable
                        key={section.code}
                        code={section.code}
                        label={section.label}
                        players={rosterByPosition[section.code] || []}
                        stats={activeHittingStats}
                        sortStats={hittingStats}
                        livePlayerIds={livePlayerIds}
                        probableStarterIds={probableStarterIds}
                      />
                    ))}
                    {pitcherSections.map((section) => (
                      <PitcherRosterTable
                        key={section.code}
                        code={section.code}
                        label={section.label}
                        players={rosterByPosition[section.code] || []}
                        stats={activePitchingStats}
                        sortStats={pitchingStats}
                        livePlayerIds={livePlayerIds}
                        probableStarterIds={probableStarterIds}
                      />
                    ))}
                    {capOnlySections.map((section) => (
                      <CapOnlyRosterTable
                        key={section.code}
                        code={section.code}
                        label={section.label}
                        players={rosterByPosition[section.code] || []}
                        hittingStats={activeHittingStats}
                        pitchingStats={activePitchingStats}
                        livePlayerIds={livePlayerIds}
                        probableStarterIds={probableStarterIds}
                      />
                    ))}
                  </div>

                  <aside className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      Salary By Position
                    </h4>
                    <div className="mt-3 space-y-2">
                      {salaryPositionOrder.map((position) => (
                        <div
                          key={position}
                          className="flex items-center justify-between gap-4 text-xs"
                        >
                          <span className="text-gray-500 dark:text-gray-400">
                            {position}
                          </span>
                          <span className="font-medium text-gray-800 dark:text-white/90">
                            {formatSalary(salaryByPosition[position] || 0)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-800">
                      <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        Salary By Group
                      </h4>
                      <div className="mt-3 space-y-2">
                        {salaryGroups.map((group) => (
                          <div
                            key={group.label}
                            className="flex items-center justify-between gap-4 text-xs"
                          >
                            <span className="text-gray-500 dark:text-gray-400">
                              {group.label}
                            </span>
                            <span className="font-medium text-gray-800 dark:text-white/90">
                              {formatSalary(salaryByGroup[group.label] || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
