import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import {
  fetchMlbBoxScore,
  fetchMlbGames,
  formatStatValue,
  type MlbBoxScore,
  type MlbBoxScorePlayer,
  type MlbGame,
  type MlbGameStatus,
} from "../../lib/mlb";

const statusOrder: MlbGameStatus[] = ["live", "upcoming", "final"];
const statusLabels: Record<MlbGameStatus, string> = {
  live: "Live",
  upcoming: "Not Started",
  final: "Final",
};

const statusDescriptions: Record<MlbGameStatus, string> = {
  live: "Games currently in progress",
  upcoming: "Games still waiting for first pitch",
  final: "Completed games from today",
};

type OwnedPlayer = {
  teamName: string;
  abbreviation: string;
  logo: string | null;
};

const battingColumns = [
  { key: "atBats", label: "AB" },
  { key: "runs", label: "R" },
  { key: "hits", label: "H" },
  { key: "doubles", label: "2B" },
  { key: "triples", label: "3B" },
  { key: "homeRuns", label: "HR" },
  { key: "rbi", label: "RBI" },
  { key: "baseOnBalls", label: "BB" },
  { key: "strikeOuts", label: "SO" },
  { key: "stolenBases", label: "SB" },
];

const pitchingColumns = [
  { key: "inningsPitched", label: "IP" },
  { key: "hits", label: "H" },
  { key: "runs", label: "R" },
  { key: "earnedRuns", label: "ER" },
  { key: "baseOnBalls", label: "BB" },
  { key: "strikeOuts", label: "SO" },
  { key: "homeRuns", label: "HR" },
];

function formatGameTime(gameDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(gameDate));
}

function getStatusBadgeClasses(status: MlbGameStatus) {
  if (status === "live") {
    return "bg-error-50 text-error-700 ring-error-200 dark:bg-error-500/10 dark:text-error-300 dark:ring-error-500/30";
  }

  if (status === "final") {
    return "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700";
  }

  return "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30";
}

function getGameStatusText(game: MlbGame) {
  if (game.status === "live") {
    return game.inning || game.detailedState;
  }

  if (game.status === "final") {
    return game.detailedState || "Final";
  }

  return formatGameTime(game.gameDate);
}

function TeamRow({
  team,
  status,
}: {
  team: MlbGame["away"];
  status: MlbGameStatus;
}) {
  const record =
    team.wins !== null && team.losses !== null ? `${team.wins}-${team.losses}` : null;

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {team.logoUrl ? (
          <img
            src={team.logoUrl}
            alt=""
            className="h-7 w-7 shrink-0 object-contain"
            loading="lazy"
          />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {team.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {team.abbreviation}
            {record ? ` · ${record}` : ""}
          </p>
        </div>
      </div>
      <div className="min-w-8 text-right text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
        {status === "upcoming" ? "—" : team.score ?? 0}
      </div>
    </div>
  );
}

function ProbablePitchers({ game }: { game: MlbGame }) {
  if (!game.away.probablePitcher && !game.home.probablePitcher) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
      <p className="font-semibold uppercase text-gray-500 dark:text-gray-400">
        Probable Pitchers
      </p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        <p>
          <span className="font-semibold">{game.away.abbreviation}:</span>{" "}
          {game.away.probablePitcher || "TBD"}
        </p>
        <p>
          <span className="font-semibold">{game.home.abbreviation}:</span>{" "}
          {game.home.probablePitcher || "TBD"}
        </p>
      </div>
    </div>
  );
}

function GameCard({
  game,
  selected,
  onSelect,
}: {
  game: MlbGame;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border bg-white p-4 text-left shadow-theme-xs transition hover:border-brand-300 hover:shadow-theme-md dark:bg-white/[0.03] ${
        selected
          ? "border-brand-300 ring-2 ring-brand-500/10 dark:border-brand-500/60"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getStatusBadgeClasses(
              game.status,
            )}`}
          >
            {getGameStatusText(game)}
          </span>
          {game.venue && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {game.venue}
            </p>
          )}
        </div>
        <p className="text-xs font-medium uppercase text-gray-400">
          MLB
        </p>
      </div>

      <div className="space-y-3">
        <TeamRow team={game.away} status={game.status} />
        <TeamRow team={game.home} status={game.status} />
      </div>

      <ProbablePitchers game={game} />
    </button>
  );
}

function GameSection({
  status,
  games,
  selectedGamePk,
  onSelectGame,
}: {
  status: MlbGameStatus;
  games: MlbGame[];
  selectedGamePk: number | null;
  onSelectGame: (game: MlbGame) => void;
}) {
  if (!games.length) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {statusLabels[status]}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {statusDescriptions[status]}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {games.length}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {games.map((game) => (
          <GameCard
            key={game.gamePk}
            game={game}
            selected={selectedGamePk === game.gamePk}
            onSelect={() => onSelectGame(game)}
          />
        ))}
      </div>
    </section>
  );
}

function getOwnedPlayerMap(seasons: PlayerSeasonWithRelations[]) {
  return seasons.reduce((map, season) => {
    const playerApiId = season.player?.player_api_id;
    const team = season.fantasy_team;

    if (!playerApiId || !team) return map;

    map.set(playerApiId, {
      teamName: team.team_name,
      abbreviation: team.abbreviation,
      logo: team.logo,
    });

    return map;
  }, new Map<string, OwnedPlayer>());
}

function OwnedBadge({ ownedPlayer }: { ownedPlayer: OwnedPlayer | undefined }) {
  if (!ownedPlayer) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30">
      {ownedPlayer.logo ? (
        <img
          src={ownedPlayer.logo}
          alt=""
          className="h-4 w-4 rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="h-4 w-4 rounded-full bg-brand-100 dark:bg-brand-500/20" />
      )}
      {ownedPlayer.abbreviation}
    </span>
  );
}

function PlayerNameCell({
  player,
  ownedPlayer,
  statsKey,
}: {
  player: MlbBoxScorePlayer;
  ownedPlayer: OwnedPlayer | undefined;
  statsKey: "battingStats" | "pitchingStats";
}) {
  return (
    <div className="flex min-w-[180px] items-center gap-2">
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900 dark:text-white">
          {player.playerName}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {player.position}
        </p>
      </div>
      <OwnedBadge ownedPlayer={ownedPlayer} />
      {statsKey === "pitchingStats" && (
        <PitcherDecisionBadge stats={player.pitchingStats} />
      )}
    </div>
  );
}

function PitcherDecisionBadge({
  stats,
}: {
  stats: MlbBoxScorePlayer["pitchingStats"];
}) {
  if (!stats) return null;

  const decisions = [
    Number(stats.wins ?? 0) > 0 ? "W" : null,
    Number(stats.losses ?? 0) > 0 ? "L" : null,
    Number(stats.saves ?? 0) > 0 ? "SV" : null,
  ].filter(Boolean);

  if (!decisions.length) return null;

  return (
    <span className="inline-flex rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700 ring-1 ring-success-200 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-500/30">
      {decisions.join(" / ")}
    </span>
  );
}

function BoxScoreTable({
  title,
  players,
  columns,
  statsKey,
  ownedPlayers,
}: {
  title: string;
  players: MlbBoxScorePlayer[];
  columns: { key: string; label: string }[];
  statsKey: "battingStats" | "pitchingStats";
  ownedPlayers: Map<string, OwnedPlayer>;
}) {
  const activePlayers = players
    .filter((player) => player[statsKey])
    .sort((a, b) => {
      const aOrder =
        statsKey === "battingStats" ? a.battingOrder : a.pitchingOrder;
      const bOrder =
        statsKey === "battingStats" ? b.battingOrder : b.pitchingOrder;

      return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
    });

  if (!activePlayers.length) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <th className="px-3 py-2">Player</th>
              {columns.map((column) => (
                <th key={column.key} className="px-3 py-2 text-center">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {activePlayers.map((player) => {
              const stats = player[statsKey] ?? {};
              const ownedPlayer = ownedPlayers.get(String(player.playerId));

              return (
                <tr key={`${statsKey}-${player.playerId}`}>
                  <td className="px-3 py-2">
                    <PlayerNameCell
                      player={player}
                      ownedPlayer={ownedPlayer}
                      statsKey={statsKey}
                    />
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="px-3 py-2 text-center tabular-nums text-gray-600 dark:text-gray-300"
                    >
                      {formatStatValue(stats[column.key])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamBoxScoreSection({
  teamName,
  teamAbbreviation,
  players,
  title,
  columns,
  statsKey,
  ownedPlayers,
}: {
  teamName: string;
  teamAbbreviation: string;
  players: MlbBoxScorePlayer[];
  title: string;
  columns: { key: string; label: string }[];
  statsKey: "battingStats" | "pitchingStats";
  ownedPlayers: Map<string, OwnedPlayer>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
          {teamAbbreviation}
        </p>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {teamName}
        </h3>
      </div>
      <BoxScoreTable
        title={title}
        players={players}
        columns={columns}
        statsKey={statsKey}
        ownedPlayers={ownedPlayers}
      />
    </div>
  );
}

function BoxScorePanel({
  selectedGame,
  boxScore,
  loading,
  error,
  ownedPlayers,
  onClose,
}: {
  selectedGame: MlbGame | null;
  boxScore: MlbBoxScore | null;
  loading: boolean;
  error: string;
  ownedPlayers: Map<string, OwnedPlayer>;
  onClose: () => void;
}) {
  if (!selectedGame) return null;

  const awayPlayers =
    boxScore?.players.filter((player) => player.teamSide === "away") ?? [];
  const homePlayers =
    boxScore?.players.filter((player) => player.teamSide === "home") ?? [];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Box Score
          </p>
          <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
            {selectedGame.away.abbreviation} at {selectedGame.home.abbreviation}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            User-owned players are marked with their fantasy team logo.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-brand-300 hover:text-brand-600 dark:border-gray-800 dark:text-gray-300"
        >
          Close
        </button>
      </div>

      {loading ? (
        <div className="mt-5 rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Loading box score...
        </div>
      ) : error ? (
        <div className="mt-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      ) : boxScore ? (
        <div className="mt-5 space-y-8">
          <div>
            <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">
              Batting
            </h3>
            <div className="grid gap-6 xl:grid-cols-2">
              <TeamBoxScoreSection
                teamName={boxScore.awayTeamName}
                teamAbbreviation={boxScore.awayTeamAbbreviation}
                players={awayPlayers}
                title="Batting"
                columns={battingColumns}
                statsKey="battingStats"
                ownedPlayers={ownedPlayers}
              />
              <TeamBoxScoreSection
                teamName={boxScore.homeTeamName}
                teamAbbreviation={boxScore.homeTeamAbbreviation}
                players={homePlayers}
                title="Batting"
                columns={battingColumns}
                statsKey="battingStats"
                ownedPlayers={ownedPlayers}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">
              Pitching
            </h3>
            <div className="grid gap-6 xl:grid-cols-2">
              <TeamBoxScoreSection
                teamName={boxScore.awayTeamName}
                teamAbbreviation={boxScore.awayTeamAbbreviation}
                players={awayPlayers}
                title="Pitching"
                columns={pitchingColumns}
                statsKey="pitchingStats"
                ownedPlayers={ownedPlayers}
              />
              <TeamBoxScoreSection
                teamName={boxScore.homeTeamName}
                teamAbbreviation={boxScore.homeTeamAbbreviation}
                players={homePlayers}
                title="Pitching"
                columns={pitchingColumns}
                statsKey="pitchingStats"
                ownedPlayers={ownedPlayers}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function Home() {
  const [games, setGames] = useState<MlbGame[]>([]);
  const [playerSeasons, setPlayerSeasons] = useState<PlayerSeasonWithRelations[]>([]);
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null);
  const [boxScore, setBoxScore] = useState<MlbBoxScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [boxScoreLoading, setBoxScoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [boxScoreError, setBoxScoreError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const seasonYear = new Date().getFullYear();

  async function loadGames(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const nextGames = await fetchMlbGames();
      setGames(nextGames);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load MLB games.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadPlayerOwnership() {
    try {
      const seasons = await fetchPlayerSeasonsBySeason(seasonYear);
      setPlayerSeasons(seasons);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load fantasy player ownership.",
      );
    }
  }

  async function handleSelectGame(game: MlbGame) {
    if (selectedGamePk === game.gamePk && boxScore) return;

    setSelectedGamePk(game.gamePk);
    setBoxScore(null);
    setBoxScoreError("");
    setBoxScoreLoading(true);

    try {
      const nextBoxScore = await fetchMlbBoxScore(game.gamePk);
      setBoxScore(nextBoxScore);
    } catch (err) {
      setBoxScoreError(
        err instanceof Error ? err.message : "Unable to load box score.",
      );
    } finally {
      setBoxScoreLoading(false);
    }
  }

  useEffect(() => {
    loadGames();
    loadPlayerOwnership();

    const intervalId = window.setInterval(() => {
      loadGames(true);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const groupedGames = useMemo(
    () =>
      statusOrder.reduce(
        (groups, status) => ({
          ...groups,
          [status]: games.filter((game) => game.status === status),
        }),
        {} as Record<MlbGameStatus, MlbGame[]>,
      ),
    [games],
  );

  const selectedGame =
    games.find((game) => game.gamePk === selectedGamePk) ?? null;
  const ownedPlayers = useMemo(
    () => getOwnedPlayerMap(playerSeasons),
    [playerSeasons],
  );
  const totalGames = games.length;
  const lastUpdatedLabel = lastUpdated
    ? new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(lastUpdated)
    : "Not loaded yet";

  return (
    <>
      <PageMeta
        title="MLB Scoreboard | Front Office Baseball League"
        description="Live MLB games and Front Office Baseball player results"
      />

      <div className="space-y-6">
        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                MLB Scoreboard
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                Today's Games
              </h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Live scores from MLB StatsAPI, grouped by game status.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="grid grid-cols-3 gap-2 text-center">
                {statusOrder.map((status) => (
                  <div
                    key={status}
                    className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
                  >
                    <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                      {statusLabels[status]}
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {groupedGames[status]?.length ?? 0}
                    </p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => loadGames(true)}
                disabled={refreshing}
                className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{totalGames} games today</span>
            <span>Last updated {lastUpdatedLabel}</span>
            <span>Auto-refreshes every 60 seconds</span>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
            {error}
          </div>
        )}

        <BoxScorePanel
          selectedGame={selectedGame}
          boxScore={boxScore}
          loading={boxScoreLoading}
          error={boxScoreError}
          ownedPlayers={ownedPlayers}
          onClose={() => {
            setSelectedGamePk(null);
            setBoxScore(null);
            setBoxScoreError("");
          }}
        />

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
            Loading today's MLB games...
          </div>
        ) : totalGames === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No MLB games are scheduled for today.
          </div>
        ) : (
          <div className="space-y-8">
            {statusOrder.map((status) => (
              <GameSection
                key={status}
                status={status}
                games={groupedGames[status] ?? []}
                selectedGamePk={selectedGamePk}
                onSelectGame={handleSelectGame}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
