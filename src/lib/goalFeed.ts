import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "./fantasyPlayers";
import { fetchFantasyTeams, type FantasyTeam } from "./fantasyTeams";
import { fetchLeagueTransactions, type LeagueTransaction } from "./transactions";
import { fetchProspectRights, getProspectRight, removeAgedOutProspectRights } from "./prospectRights";
import { fetchNhlDailyStats, fetchNhlLiveSeasonStats, getGoalieScore, getNhlStatsDate, getSkaterScore } from "./nhl";
import { fetchRecordBookData, type FranchiseStatLine } from "./recordBook";

type Localized = { default?: string };
type ScoreTeam = { id?: number; abbrev?: string; score?: number; logo?: string; commonName?: Localized; placeName?: Localized };
type ScoreGame = { id: number; gameState: string; startTimeUTC?: string; awayTeam?: ScoreTeam; homeTeam?: ScoreTeam };
type ScoreResponse = { games?: ScoreGame[] };
type RosterSpot = { playerId: number; teamId?: number; firstName?: Localized; lastName?: Localized; headshot?: string; sweaterNumber?: number; positionCode?: string };
type Play = {
  eventId: number; sortOrder?: number; typeDescKey?: string; timeInPeriod?: string;
  periodDescriptor?: { number?: number; periodType?: string; maxRegulationPeriods?: number };
  details?: { eventOwnerTeamId?: number; scoringPlayerId?: number; assist1PlayerId?: number; assist2PlayerId?: number; awayScore?: number; homeScore?: number; situationCode?: string; shotType?: string };
};
type PlayByPlay = { rosterSpots?: RosterSpot[]; plays?: Play[] };
type BoxscoreGoalie = { playerId?: number; saves?: number; goalsAgainst?: number; decision?: "W" | "L" | "O"; headshot?: string };
type Boxscore = { playerByGameStats?: { awayTeam?: { goalies?: BoxscoreGoalie[] }; homeTeam?: { goalies?: BoxscoreGoalie[] } } };

export type GoalFeedPlayer = {
  playerId: string;
  name: string;
  headshot?: string;
  fantasyTeam: FantasyTeam | null;
  prospect: boolean;
  tonightPoints: number | null;
};

export type GoalFeedEvent = {
  key: string;
  gameId: number;
  gameState: string;
  startTimeUTC?: string;
  nhlTeam: { abbreviation: string; logo?: string };
  awayTeam: { abbreviation: string; score: number; logo?: string };
  homeTeam: { abbreviation: string; score: number; logo?: string };
  scorer: GoalFeedPlayer;
  assists: GoalFeedPlayer[];
  period: number;
  periodType: string;
  timeInPeriod: string;
  strength: "PP" | "SH" | "EN" | null;
  shotType?: string;
  sortValue: number;
};

export type GoalieFeedEvent = {
  key: string;
  gameId: number;
  gameState: string;
  goalie: GoalFeedPlayer;
  saves: number;
  shutout: boolean;
  nhlTeam: { abbreviation: string; logo?: string };
  awayTeam: { abbreviation: string; score: number; logo?: string };
  homeTeam: { abbreviation: string; score: number; logo?: string };
  sortValue: number;
};

export type FeedStanding = { team: FantasyTeam; rank: number; points: number };

export type RecordMovement = {
  scope: "league" | "franchise";
  category: "Goals" | "Assists" | "Points" | "Game-Winning Goals" | "Wins" | "Shutouts";
  abbreviation: "G" | "A" | "P" | "GWG" | "W" | "SO";
  beforeRank: number | null;
  afterRank: number;
  value: number;
  moved: boolean;
  tied: boolean;
  passedNames: string[];
  tiedNames: string[];
  team: FantasyTeam | null;
};

export type RecordMovementEvent = {
  key: string;
  player: GoalFeedPlayer;
  movements: RecordMovement[];
  sortValue: number;
};

export type RecordChase = {
  key: string;
  player: GoalFeedPlayer;
  scope: "league" | "franchise";
  category: RecordMovement["category"];
  abbreviation: RecordMovement["abbreviation"];
  rank: number;
  value: number;
  needed: number;
  targetRank: number;
  targetNames: string[];
  team: FantasyTeam | null;
};

export type MilestoneWatchItem = {
  key: string;
  player: GoalFeedPlayer;
  category: "Goals" | "Assists" | "Points" | "Wins" | "Shutouts" | "Career FPTS";
  abbreviation: "G" | "A" | "P" | "W" | "SO" | "FPTS";
  target: number;
  value: number;
  remaining: number;
  achievedTonight: boolean;
  recognition: "standard" | "major" | "bronze" | "silver" | "gold" | "legendary";
};

type RecordMetric = {
  category: RecordMovement["category"];
  abbreviation: RecordMovement["abbreviation"];
  kind: "skater" | "goalie";
  value: (line: FranchiseStatLine) => number;
  dailyValue: (row: Record<string, unknown>) => number;
};

const recordMetrics: RecordMetric[] = [
  { category: "Goals", abbreviation: "G", kind: "skater", value: (line) => line.skater?.goals || 0, dailyValue: (row) => Number(row.goals || 0) },
  { category: "Assists", abbreviation: "A", kind: "skater", value: (line) => line.skater?.assists || 0, dailyValue: (row) => Number(row.assists || 0) },
  { category: "Points", abbreviation: "P", kind: "skater", value: (line) => line.skater?.points || 0, dailyValue: (row) => Number(row.goals || 0) + Number(row.assists || 0) },
  { category: "Game-Winning Goals", abbreviation: "GWG", kind: "skater", value: (line) => line.skater?.gameWinningGoals || 0, dailyValue: (row) => Number(row.gameWinningGoals || 0) },
  { category: "Wins", abbreviation: "W", kind: "goalie", value: (line) => line.goalie?.wins || 0, dailyValue: (row) => Number(row.wins || 0) },
  { category: "Shutouts", abbreviation: "SO", kind: "goalie", value: (line) => line.goalie?.shutouts || 0, dailyValue: (row) => Number(row.shutouts || 0) },
];

const recordBookCache = new Map<string, { expiresAt: number; request: ReturnType<typeof fetchRecordBookData> }>();

function fetchDatedRecordBook(date: string) {
  const cached = recordBookCache.get(date);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetchRecordBookData(null, null, date);
  recordBookCache.set(date, { expiresAt: Date.now() + (date === getNhlStatsDate() ? 60_000 : 15 * 60_000), request });
  request.catch(() => { if (recordBookCache.get(date)?.request === request) recordBookCache.delete(date); });
  return request;
}

function competitionRank(values: number[], value: number) {
  return 1 + values.filter((candidate) => candidate > value).length;
}

function buildRecordMovements(
  lines: FranchiseStatLine[],
  dailySkaters: Record<string, unknown>[],
  dailyGoalies: Record<string, unknown>[],
  players: Map<string, GoalFeedPlayer>,
  metricSortValues: Map<string, number>,
  ownerByPlayer: Map<string, number | null>,
) {
  const dailyByKind = {
    skater: new Map(dailySkaters.map((row) => [String(row.playerId), row])),
    goalie: new Map(dailyGoalies.map((row) => [String(row.playerId), row])),
  };
  const results: RecordMovementEvent[] = [];

  players.forEach((player, playerId) => {
    const playerLines = lines.filter((line) => line.playerId === playerId);
    const teamId = player.fantasyTeam?.id;
    if (!playerLines.length || !teamId) return;
    const movementsByEvent = new Map<number, RecordMovement[]>();

    recordMetrics.forEach((metric) => {
      const dailyRow = dailyByKind[metric.kind].get(playerId);
      const dailyValue = dailyRow ? metric.dailyValue(dailyRow) : 0;
      if (dailyValue <= 0) return;

      (["league", "franchise"] as const).forEach((scope) => {
        const recordLimit = scope === "league" ? 5 : 10;
        const scopedLines = scope === "league" ? lines : lines.filter((line) => line.team?.id === teamId);
        const grouped = new Map<string, { name: string; current: number; before: number }>();
        scopedLines.forEach((line) => {
          const current = grouped.get(line.playerId) || { name: line.playerName, current: 0, before: 0 };
          const value = metric.value(line);
          current.current += value;
          current.before += value;
          grouped.set(line.playerId, current);
        });
        grouped.forEach((row, candidateId) => {
          const candidateDaily = dailyByKind[metric.kind].get(candidateId);
          if (!candidateDaily) return;
          if (scope === "league" || ownerByPlayer.get(candidateId) === teamId) row.before -= metric.dailyValue(candidateDaily);
        });
        const subject = grouped.get(playerId);
        if (!subject || subject.current < dailyValue) return;
        const beforeValues = [...grouped.values()].map((row) => row.before);
        const currentValues = [...grouped.values()].map((row) => row.current);
        const beforeRank = competitionRank(beforeValues, subject.before);
        const afterRank = competitionRank(currentValues, subject.current);
        if (afterRank > recordLimit) return;
        const moved = afterRank < beforeRank;
        const passedNames = [...grouped.entries()].filter(([id, row]) => id !== playerId && row.before > subject.before && row.current < subject.current).map(([, row]) => row.name);
        const tiedNames = [...grouped.entries()].filter(([id, row]) => id !== playerId && row.current === subject.current).map(([, row]) => row.name);
        const sortValue = metricSortValues.get(`${playerId}:${metric.abbreviation}`);
        if (sortValue == null) return;
        const movement: RecordMovement = {
          scope, category: metric.category, abbreviation: metric.abbreviation,
          beforeRank: beforeRank <= recordLimit ? beforeRank : null, afterRank, value: subject.current,
          moved, tied: tiedNames.length > 0, passedNames: passedNames.slice(0, 2), tiedNames: tiedNames.slice(0, 2),
          team: scope === "franchise" ? player.fantasyTeam : null,
        };
        movementsByEvent.set(sortValue, [...(movementsByEvent.get(sortValue) || []), movement]);
      });
    });

    movementsByEvent.forEach((movements, sortValue) => {
      const signature = movements.map((movement) => `${movement.scope}:${movement.abbreviation}:${movement.afterRank}:${movement.value}`).join("|");
      results.push({ key: `records:${playerId}:${signature}`, player, movements, sortValue: sortValue + 0.5 });
    });
  });
  return results;
}

function buildRecordChases(lines: FranchiseStatLine[], rosterPlayers: Map<string, GoalFeedPlayer>) {
  const chases: RecordChase[] = [];
  recordMetrics.forEach((metric) => {
    const leagueGroups = new Map<string, { name: string; value: number; team: FantasyTeam | null }>();
    lines.forEach((line) => {
      const current = leagueGroups.get(line.playerId) || { name: line.playerName, value: 0, team: line.currentTeam };
      current.value += metric.value(line);
      current.team = line.currentTeam || current.team;
      leagueGroups.set(line.playerId, current);
    });
    const addChases = (scope: "league" | "franchise", groups: Map<string, { name: string; value: number; team: FantasyTeam | null }>, team: FantasyTeam | null) => {
      const rows = [...groups.entries()].filter(([, row]) => row.value > 0);
      const values = rows.map(([, row]) => row.value);
      rows.forEach(([playerId, row]) => {
        const player = rosterPlayers.get(playerId);
        if (!player || (scope === "franchise" && player.fantasyTeam?.id !== team?.id)) return;
        const rank = competitionRank(values, row.value);
        if (rank > (scope === "league" ? 6 : 11)) return;
        const nextValue = Math.min(...values.filter((value) => value > row.value));
        if (!Number.isFinite(nextValue)) return;
        const needed = nextValue - row.value + 1;
        if (needed > 2) return;
        const targetRank = competitionRank(values, nextValue);
        const targetNames = rows.filter(([candidateId, candidate]) => candidateId !== playerId && candidate.value === nextValue).map(([, candidate]) => candidate.name).slice(0, 2);
        chases.push({ key: `${scope}:${team?.id || "all"}:${metric.abbreviation}:${playerId}`, player, scope, category: metric.category, abbreviation: metric.abbreviation, rank, value: row.value, needed, targetRank, targetNames, team: scope === "franchise" ? team : null });
      });
    };
    addChases("league", leagueGroups, null);
    const teams = new Map(lines.filter((line) => line.team).map((line) => [line.team!.id, line.team!]));
    teams.forEach((team) => {
      const groups = new Map(lines.filter((line) => line.team?.id === team.id).map((line) => [line.playerId, { name: line.playerName, value: metric.value(line), team: line.currentTeam }]));
      addChases("franchise", groups, team);
    });
  });
  return chases.sort((a, b) => a.needed - b.needed || a.targetRank - b.targetRank || a.player.name.localeCompare(b.player.name)).slice(0, 12);
}

function buildMilestoneWatch(lines: FranchiseStatLine[], dailySkaters: Record<string, unknown>[], dailyGoalies: Record<string, unknown>[], rosterPlayers: Map<string, GoalFeedPlayer>) {
  const skaterDays = new Map(dailySkaters.map((row) => [String(row.playerId), row]));
  const goalieDays = new Map(dailyGoalies.map((row) => [String(row.playerId), row]));
  const metrics = [
    { category: "Goals", abbreviation: "G", standard: [50,100,150,200,250,300,350,400,450], major: [500,600,700,800,900], tiers: { bronze: 100, silver: 250, gold: 500, legendary: 700 }, watch: 5, value: (rows: FranchiseStatLine[]) => rows.reduce((sum, row) => sum + Number(row.skater?.goals || 0), 0), daily: (id: string) => Number(skaterDays.get(id)?.goals || 0) },
    { category: "Assists", abbreviation: "A", standard: [100,200,300,400,500,600,700,800,900], major: [1_000,1_200,1_500], tiers: { bronze: 200, silver: 500, gold: 1_000, legendary: 1_500 }, watch: 10, value: (rows: FranchiseStatLine[]) => rows.reduce((sum, row) => sum + Number(row.skater?.assists || 0), 0), daily: (id: string) => Number(skaterDays.get(id)?.assists || 0) },
    { category: "Points", abbreviation: "P", standard: [100,200,300,400,500,600,700,800,900], major: [1_000,1_250,1_500,1_750,2_000], tiers: { bronze: 200, silver: 500, gold: 1_000, legendary: 1_500 }, watch: 10, value: (rows: FranchiseStatLine[]) => rows.reduce((sum, row) => sum + Number(row.skater?.points || 0), 0), daily: (id: string) => Number(skaterDays.get(id)?.goals || 0) + Number(skaterDays.get(id)?.assists || 0) },
    { category: "Wins", abbreviation: "W", standard: [25,50,100,150,200,250,300,350], major: [400,500,600,700], tiers: { bronze: 100, silver: 250, gold: 400, legendary: 600 }, watch: 5, value: (rows: FranchiseStatLine[]) => rows.reduce((sum, row) => sum + Number(row.goalie?.wins || 0), 0), daily: (id: string) => Number(goalieDays.get(id)?.wins || 0) },
    { category: "Shutouts", abbreviation: "SO", standard: [10,20,25,30,40], major: [50,60,70,80,90,100], tiers: { bronze: 10, silver: 25, gold: 50, legendary: 100 }, watch: 2, value: (rows: FranchiseStatLine[]) => rows.reduce((sum, row) => sum + Number(row.goalie?.shutouts || 0), 0), daily: (id: string) => Number(goalieDays.get(id)?.shutouts || 0) },
  ] as const;
  const linesByPlayer = new Map<string, FranchiseStatLine[]>();
  lines.forEach((line) => linesByPlayer.set(line.playerId, [...(linesByPlayer.get(line.playerId) || []), line]));
  const achieved: MilestoneWatchItem[] = [];
  const upcoming: MilestoneWatchItem[] = [];
  rosterPlayers.forEach((player, playerId) => {
    const playerLines = linesByPlayer.get(playerId) || [];
    metrics.forEach((metric) => {
      const value = metric.value(playerLines);
      const before = value - metric.daily(playerId);
      const thresholds = [...new Set([...metric.standard, ...metric.major, ...Object.values(metric.tiers)])].sort((a, b) => a - b);
      const recognition = (target: number): MilestoneWatchItem["recognition"] => {
        const tier = Object.entries(metric.tiers).find(([, threshold]) => threshold === target)?.[0] as "bronze" | "silver" | "gold" | "legendary" | undefined;
        return tier || (metric.major.includes(target as never) ? "major" : "standard");
      };
      thresholds.filter((target) => before < target && value >= target).forEach((target) => achieved.push({ key: `${playerId}:${metric.abbreviation}:${target}`, player, category: metric.category, abbreviation: metric.abbreviation, target, value, remaining: 0, achievedTonight: true, recognition: recognition(target) }));
      const target = thresholds.find((threshold) => threshold > value);
      if (target) upcoming.push({ key: `${playerId}:${metric.abbreviation}:${target}`, player, category: metric.category, abbreviation: metric.abbreviation, target, value, remaining: target - value, achievedTonight: false, recognition: recognition(target) });
    });
  });
  const nearby = upcoming.filter((item) => item.remaining <= 2);
  return [...achieved.sort((a, b) => a.category.localeCompare(b.category)), ...nearby].sort((a, b) => Number(b.achievedTonight) - Number(a.achievedTonight) || a.remaining - b.remaining || a.player.name.localeCompare(b.player.name)).slice(0, 15);
}

function seasonForDate(date: string) {
  const [year, month] = date.split("-").map(Number);
  return month >= 9 ? year + 1 : year;
}

function historicalTeamId(row: PlayerSeasonWithRelations, transactions: LeagueTransaction[], date: string) {
  let teamId = row.fantasy_team_id;
  transactions.filter((transaction) => transaction.season_year === row.season_year && transaction.transaction_type === "trade" && transaction.transaction_date > date)
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
    .forEach((transaction) => {
      const move = transaction.trade_offer?.trade_offer_players.find((candidate) => candidate.player_season?.player_id === row.player_id);
      if (move) teamId = move.from_team_id;
    });
  return teamId;
}

function strengthLabel(code: string | undefined, scoringIsHome: boolean) {
  if (!code || code.length < 4) return null;
  const awayGoalie = Number(code[0]);
  const awaySkaters = Number(code[1]);
  const homeSkaters = Number(code[2]);
  const homeGoalie = Number(code[3]);
  const scoringSkaters = scoringIsHome ? homeSkaters : awaySkaters;
  const defendingSkaters = scoringIsHome ? awaySkaters : homeSkaters;
  const defendingGoalie = scoringIsHome ? awayGoalie : homeGoalie;
  if (defendingGoalie === 0) return "EN" as const;
  if (scoringSkaters > defendingSkaters) return "PP" as const;
  if (scoringSkaters < defendingSkaters) return "SH" as const;
  return null;
}

function estimatedGoalTime(startTimeUTC: string | undefined, period: number, periodType: string, minutes: number, seconds: number, sortOrder: number) {
  const start = startTimeUTC ? new Date(startTimeUTC).getTime() : 0;
  const playedSeconds = minutes * 60 + seconds;
  // NHL events do not include a wall-clock timestamp. Estimate it from puck
  // drop while accounting for intermissions so simultaneous games interleave
  // naturally instead of grouping primarily by scheduled start time.
  let elapsedSeconds: number;
  if (period <= 3) elapsedSeconds = Math.max(period - 1, 0) * (20 * 60 + 18 * 60) + playedSeconds;
  else if (periodType === "SO") elapsedSeconds = 3 * 20 * 60 + 2 * 18 * 60 + 8 * 60 + playedSeconds;
  else elapsedSeconds = 3 * 20 * 60 + 2 * 18 * 60 + 3 * 60 + Math.max(period - 4, 0) * (20 * 60 + 18 * 60) + playedSeconds;
  return start + elapsedSeconds * 1_000 + sortOrder / 1_000;
}

export async function fetchGoalFeed(date: string): Promise<{ events: GoalFeedEvent[]; goalieEvents: GoalieFeedEvent[]; nightlyStars: GoalFeedPlayer[]; recordEventsPromise: Promise<RecordMovementEvent[]>; recordChasesPromise: Promise<RecordChase[]>; milestoneWatchPromise: Promise<MilestoneWatchItem[]>; standings: FeedStanding[]; baselineStandings: FeedStanding[]; games: number; live: boolean; teams: FantasyTeam[] }> {
  const season = seasonForDate(date);
  const [scoreResponse, roster, teams, transactions, prospectRights, dailyStats, seasonStats] = await Promise.all([
    fetch(`/nhl-web-api/score/${date}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load NHL games (${response.status})`);
      return response.json() as Promise<ScoreResponse>;
    }),
    fetchPlayerSeasonsBySeason(season),
    fetchFantasyTeams(true),
    fetchLeagueTransactions(),
    fetchProspectRights(season),
    fetchNhlDailyStats(date).catch(() => ({ skaters: [], goalies: [] })),
    date === getNhlStatsDate() ? fetchNhlLiveSeasonStats(season).catch(() => null) : Promise.resolve(null),
  ]);
  const games = scoreResponse.games ?? [];
  const playByPlay = await Promise.all(games.map(async (game) => {
    const [playResponse, boxscoreResponse] = await Promise.all([
      fetch(`/nhl-web-api/gamecenter/${game.id}/play-by-play`, { cache: "no-store" }),
      fetch(`/nhl-web-api/gamecenter/${game.id}/boxscore`, { cache: "no-store" }),
    ]);
    return {
      game,
      data: playResponse.ok ? await playResponse.json() as PlayByPlay : null,
      boxscore: boxscoreResponse.ok ? await boxscoreResponse.json() as Boxscore : null,
    };
  }));
  const gamePlayers = new Map<number, string>();
  playByPlay.forEach(({ data }) => (data?.rosterSpots ?? []).forEach((player) => {
    gamePlayers.set(player.playerId, [player.firstName?.default, player.lastName?.default].filter(Boolean).join(" "));
  }));
  const eligibleProspectRights = await removeAgedOutProspectRights(prospectRights, [...gamePlayers].map(([playerId, playerName]) => ({ playerId, playerName })));
  const tonightPoints = new Map<string, number>([
    ...dailyStats.skaters.map((record) => [String(record.playerId), getSkaterScore(record)] as const),
    ...dailyStats.goalies.map((record) => [String(record.playerId), getGoalieScore(record)] as const),
  ]);
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const fantasyPlayers = new Map(roster.filter((row) => row.player?.player_api_id).map((row) => {
    const teamId = historicalTeamId(row, transactions, date);
    return [row.player!.player_api_id, { row, team: teamId ? teamMap.get(teamId) || null : null }] as const;
  }));
  const playerForGame = (data: PlayByPlay | null, playerId?: number, fallbackHeadshot?: string): GoalFeedPlayer | null => {
    if (!playerId) return null;
    const nhl = (data?.rosterSpots ?? []).find((candidate) => candidate.playerId === playerId);
    const fantasy = fantasyPlayers.get(String(playerId));
    const name = [nhl?.firstName?.default, nhl?.lastName?.default].filter(Boolean).join(" ") || fantasy?.row.player?.full_name || "Unknown player";
    const prospectRight = getProspectRight(eligibleProspectRights, playerId, name);
    const rosterPosition = (fantasy?.row.position || "").toUpperCase();
    const isRosterProspect = ["PROSPECT", "AP"].includes(rosterPosition);
    return { playerId: String(playerId), name, headshot: nhl?.headshot || fallbackHeadshot, fantasyTeam: fantasy?.team || prospectRight?.team || null, prospect: Boolean(prospectRight) && (isRosterProspect || !fantasy), tonightPoints: tonightPoints.get(String(playerId)) ?? null };
  };
  const events = playByPlay.flatMap(({ game, data }) => {
    if (!data) return [];
    const player = (playerId?: number) => playerForGame(data, playerId);
    return (data.plays ?? []).filter((play) => play.typeDescKey === "goal" && play.details?.scoringPlayerId).map((play) => {
      const details = play.details!;
      const scoringIsHome = details.eventOwnerTeamId === game.homeTeam?.id;
      const scorer = player(details.scoringPlayerId)!;
      const assists = [player(details.assist1PlayerId), player(details.assist2PlayerId)].filter((value): value is GoalFeedPlayer => Boolean(value));
      const period = play.periodDescriptor?.number || 0;
      const [minutes, seconds] = (play.timeInPeriod || "00:00").split(":").map(Number);
      return {
        key: `${game.id}:${play.eventId}`, gameId: game.id, gameState: game.gameState, startTimeUTC: game.startTimeUTC,
        nhlTeam: { abbreviation: (scoringIsHome ? game.homeTeam?.abbrev : game.awayTeam?.abbrev) || "NHL", logo: scoringIsHome ? game.homeTeam?.logo : game.awayTeam?.logo },
        awayTeam: { abbreviation: game.awayTeam?.abbrev || "AWAY", score: details.awayScore ?? game.awayTeam?.score ?? 0, logo: game.awayTeam?.logo },
        homeTeam: { abbreviation: game.homeTeam?.abbrev || "HOME", score: details.homeScore ?? game.homeTeam?.score ?? 0, logo: game.homeTeam?.logo },
        scorer, assists, period, periodType: play.periodDescriptor?.periodType || "REG", timeInPeriod: play.timeInPeriod || "00:00",
        strength: strengthLabel(details.situationCode, scoringIsHome), shotType: details.shotType,
        sortValue: estimatedGoalTime(game.startTimeUTC, period, play.periodDescriptor?.periodType || "REG", minutes, seconds, play.sortOrder || 0),
      } satisfies GoalFeedEvent;
    });
  }).sort((a, b) => b.sortValue - a.sortValue);
  const goalieEvents = playByPlay.flatMap(({ game, data, boxscore }) => {
    if (!["OFF", "FINAL"].includes(game.gameState) || !boxscore) return [];
    const winnerIsHome = (game.homeTeam?.score ?? 0) > (game.awayTeam?.score ?? 0);
    const goalies = winnerIsHome ? boxscore.playerByGameStats?.homeTeam?.goalies : boxscore.playerByGameStats?.awayTeam?.goalies;
    const winner = goalies?.find((goalie) => goalie.decision === "W");
    const goalie = playerForGame(data, winner?.playerId, winner?.headshot);
    if (!winner || !goalie) return [];
    const saves = winner.saves || 0;
    const shutout = (winner.goalsAgainst || 0) === 0;
    const latestPlay = Math.max(0, ...(data?.plays ?? []).map((play) => estimatedGoalTime(game.startTimeUTC, play.periodDescriptor?.number || 0, play.periodDescriptor?.periodType || "REG", ...((play.timeInPeriod || "00:00").split(":").map(Number) as [number, number]), play.sortOrder || 0)));
    return [{
      key: `${game.id}:goalie-win:${winner.playerId}`, gameId: game.id, gameState: game.gameState, goalie, saves, shutout,
      nhlTeam: { abbreviation: (winnerIsHome ? game.homeTeam?.abbrev : game.awayTeam?.abbrev) || "NHL", logo: winnerIsHome ? game.homeTeam?.logo : game.awayTeam?.logo },
      awayTeam: { abbreviation: game.awayTeam?.abbrev || "AWAY", score: game.awayTeam?.score || 0, logo: game.awayTeam?.logo },
      homeTeam: { abbreviation: game.homeTeam?.abbrev || "HOME", score: game.homeTeam?.score || 0, logo: game.homeTeam?.logo },
      sortValue: latestPlay + 1,
    } satisfies GoalieFeedEvent];
  });
  const nightlyStars = [...fantasyPlayers.keys()].map((playerId) => {
    const game = playByPlay.find(({ data }) => data?.rosterSpots?.some((spot) => String(spot.playerId) === playerId));
    return game ? playerForGame(game.data, Number(playerId)) : null;
  }).filter((player): player is GoalFeedPlayer => player?.tonightPoints != null && player.tonightPoints > 0)
    .sort((a, b) => (b.tonightPoints || 0) - (a.tonightPoints || 0) || a.name.localeCompare(b.name));
  const recordInsightsPromise = (async () => {
    try {
      const recordBook = await fetchDatedRecordBook(date);
      const feedPlayers = new Map<string, GoalFeedPlayer>();
      const metricSortValues = new Map<string, number>();
      const noteMetric = (player: GoalFeedPlayer, abbreviation: RecordMovement["abbreviation"], sortValue: number) => {
        feedPlayers.set(player.playerId, player);
        const key = `${player.playerId}:${abbreviation}`;
        metricSortValues.set(key, Math.max(metricSortValues.get(key) || 0, sortValue));
      };
      events.forEach((event) => {
        noteMetric(event.scorer, "G", event.sortValue);
        noteMetric(event.scorer, "P", event.sortValue);
        noteMetric(event.scorer, "GWG", event.sortValue);
        event.assists.forEach((player) => {
          noteMetric(player, "A", event.sortValue);
          noteMetric(player, "P", event.sortValue);
        });
      });
      goalieEvents.forEach((event) => {
        noteMetric(event.goalie, "W", event.sortValue);
        noteMetric(event.goalie, "SO", event.sortValue);
      });
      const movements = events.length || goalieEvents.length ? buildRecordMovements(
        recordBook.franchiseStatLines,
        dailyStats.skaters as unknown as Record<string, unknown>[],
        dailyStats.goalies as unknown as Record<string, unknown>[],
        feedPlayers,
        metricSortValues,
        new Map([...fantasyPlayers].map(([playerId, value]) => [playerId, value.team?.id || null])),
      ) : [];
      const rosterPlayers = new Map<string, GoalFeedPlayer>();
      fantasyPlayers.forEach((value, playerId) => {
        const prospectRight = getProspectRight(eligibleProspectRights, Number(playerId), value.row.player?.full_name || "");
        rosterPlayers.set(playerId, { playerId, name: value.row.player?.full_name || "Unknown player", fantasyTeam: value.team || prospectRight?.team || null, prospect: ["PROSPECT", "AP"].includes((value.row.position || "").toUpperCase()), tonightPoints: tonightPoints.get(playerId) ?? null });
      });
      feedPlayers.forEach((player, playerId) => rosterPlayers.set(playerId, player));
      return { movements, chases: buildRecordChases(recordBook.franchiseStatLines, rosterPlayers), milestones: buildMilestoneWatch(recordBook.franchiseStatLines, dailyStats.skaters as unknown as Record<string, unknown>[], dailyStats.goalies as unknown as Record<string, unknown>[], rosterPlayers) };
    } catch {
      // Record movement is an enhancement; live scoring should remain available
      // if the historical record book cannot be loaded.
      return { movements: [] as RecordMovementEvent[], chases: [] as RecordChase[], milestones: [] as MilestoneWatchItem[] };
    }
  })();
  const recordEventsPromise = recordInsightsPromise.then((result) => result.movements);
  const recordChasesPromise = recordInsightsPromise.then((result) => result.chases);
  const milestoneWatchPromise = recordInsightsPromise.then((result) => result.milestones);
  const skaterScores = new Map(seasonStats?.skaters.map((record) => [String(record.playerId), getSkaterScore(record)]) ?? []);
  const goalieScores = new Map(seasonStats?.goalies.map((record) => [String(record.playerId), getGoalieScore(record)]) ?? []);
  const dailySkaterScores = new Map(dailyStats.skaters.map((record) => [String(record.playerId), getSkaterScore(record)]));
  const dailyGoalieScores = new Map(dailyStats.goalies.map((record) => [String(record.playerId), getGoalieScore(record)]));
  const baselineSkaterScores = new Map([...skaterScores].map(([playerId, score]) => [playerId, score - (dailySkaterScores.get(playerId) || 0)]));
  const baselineGoalieScores = new Map([...goalieScores].map(([playerId, score]) => [playerId, score - (dailyGoalieScores.get(playerId) || 0)]));
  const slotCounts: Record<string, number> = { C: 3, LW: 3, RW: 3, D: 6, G: 2 };
  const rankTeams = (skaters: Map<string, number>, goalies: Map<string, number>) => teams.filter((team) => team.active).map((team) => {
    const players = roster.filter((row) => row.fantasy_team_id === team.id);
    const points = Object.entries(slotCounts).reduce((total, [position, count]) => {
      const source = position === "G" ? goalies : skaters;
      const scores = players.filter((row) => (row.position || "").toUpperCase() === position).map((row) => source.get(row.player?.player_api_id || "") || 0).sort((a, b) => b - a).slice(0, count);
      return total + scores.reduce((sum, score) => sum + score, 0);
    }, 0);
    return { team, rank: 0, points };
  }).sort((a, b) => b.points - a.points || a.team.id - b.team.id).map((row, index) => ({ ...row, rank: index + 1 }));
  const standings = seasonStats ? rankTeams(skaterScores, goalieScores) : [];
  const baselineStandings = seasonStats ? rankTeams(baselineSkaterScores, baselineGoalieScores) : [];
  return { events, goalieEvents, nightlyStars, recordEventsPromise, recordChasesPromise, milestoneWatchPromise, standings, baselineStandings, games: games.length, live: games.some((game) => ["LIVE", "CRIT"].includes(game.gameState)), teams };
}
