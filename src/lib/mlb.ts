export type MlbStatRecord = {
  playerId?: number;
  playerName: string;
  position: string;
  teamName: string;
  teamAbbreviation: string;
  teamLogoUrl?: string;
  stats: Record<string, string | number | null>;
};

type MlbTeam = {
  id: number;
  name: string;
  abbreviation: string;
  logo?: string;
  logos?: {
    href: string;
  }[];
};

export type MlbPlayerProfile = {
  playerId: number;
  playerName: string;
  position: string;
  primaryPosition?: string;
  teamName?: string;
  teamAbbreviation?: string;
  teamLogoUrl?: string;
  batSide?: string | null;
  pitchHand?: string | null;
  height?: string | null;
  weight?: number | null;
  birthCity?: string | null;
  birthCountry?: string | null;
  debutDate?: string | null;
  birthDate?: string | null;
  currentAge?: number | null;
  draftYear?: string | number | null;
  draftRound?: string | number | null;
  draftPick?: string | number | null;
  draftTeam?: string | null;
  draftSchool?: string | null;
  draftHome?: string | null;
  draftSigningBonus?: string | number | null;
  draftRank?: string | number | null;
  hittingStats?: Record<string, string | number | null> | null;
  pitchingStats?: Record<string, string | number | null> | null;
};

export type MlbGameTeam = {
  id: number;
  name: string;
  abbreviation: string;
  logoUrl: string;
  score: number | null;
  probablePitcherId: number | null;
  probablePitcher: string | null;
  wins: number | null;
  losses: number | null;
};

export type MlbGameStatus = "live" | "upcoming" | "final";

export type MlbGame = {
  gamePk: number;
  gameDate: string;
  status: MlbGameStatus;
  detailedState: string;
  abstractState: string;
  inning: string | null;
  venue: string | null;
  away: MlbGameTeam;
  home: MlbGameTeam;
};

export type MlbBoxScorePlayerStats = Record<string, string | number | null>;

export type MlbBoxScorePlayer = {
  playerId: number;
  playerName: string;
  position: string;
  teamSide: "away" | "home";
  teamName: string;
  teamAbbreviation: string;
  teamLogoUrl?: string;
  battingOrder: number | null;
  pitchingOrder: number | null;
  battingStats: MlbBoxScorePlayerStats | null;
  pitchingStats: MlbBoxScorePlayerStats | null;
};

export type MlbBoxScore = {
  gamePk: number;
  awayTeamName: string;
  awayTeamAbbreviation: string;
  homeTeamName: string;
  homeTeamAbbreviation: string;
  players: MlbBoxScorePlayer[];
};

function getTeamLogoUrl(teamId: number | undefined) {
  return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : "";
}

function getGameStatus(game: any): MlbGameStatus {
  const abstractState = game?.status?.abstractGameState;
  const statusCode = game?.status?.codedGameState;

  if (abstractState === "Live" || ["I", "M", "N"].includes(statusCode)) {
    return "live";
  }

  if (abstractState === "Final" || ["F", "O"].includes(statusCode)) {
    return "final";
  }

  return "upcoming";
}

function formatInning(linescore: any) {
  const inning = linescore?.currentInningOrdinal;
  const inningState = linescore?.inningState;

  if (!inning) return null;
  if (!inningState) return inning;

  return `${inningState} ${inning}`;
}

function mapScheduleTeam(team: any): MlbGameTeam {
  const teamInfo = team?.team ?? {};

  return {
    id: teamInfo.id,
    name: teamInfo.name ?? "Unknown Team",
    abbreviation: teamInfo.abbreviation ?? teamInfo.teamCode ?? "—",
    logoUrl: getTeamLogoUrl(teamInfo.id),
    score: typeof team?.score === "number" ? team.score : null,
    probablePitcherId: team?.probablePitcher?.id ?? null,
    probablePitcher: team?.probablePitcher?.fullName ?? null,
    wins: team?.leagueRecord?.wins ?? null,
    losses: team?.leagueRecord?.losses ?? null,
  };
}

function formatMlbScheduleDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export async function fetchMlbGames(date = new Date()): Promise<MlbGame[]> {
  const dateString = formatMlbScheduleDate(date);
  const response = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateString}&hydrate=team,linescore,probablePitcher`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch MLB games");
  }

  const data = await response.json();
  const games = (data?.dates ?? []).flatMap((entry: any) => entry?.games ?? []);

  return games.map((game: any) => ({
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    status: getGameStatus(game),
    detailedState: game?.status?.detailedState ?? "Scheduled",
    abstractState: game?.status?.abstractGameState ?? "Preview",
    inning: formatInning(game?.linescore),
    venue: game?.venue?.name ?? null,
    away: mapScheduleTeam(game?.teams?.away),
    home: mapScheduleTeam(game?.teams?.home),
  }));
}

function hasBoxScoreStats(stats: MlbBoxScorePlayerStats | null) {
  return Boolean(stats && Object.keys(stats).length);
}

function hasOffensiveEvent(stats: MlbBoxScorePlayerStats | null) {
  if (!stats) return false;

  const offensiveKeys = [
    "plateAppearances",
    "atBats",
    "runs",
    "hits",
    "doubles",
    "triples",
    "homeRuns",
    "rbi",
    "baseOnBalls",
    "strikeOuts",
    "stolenBases",
    "caughtStealing",
  ];

  return offensiveKeys.some((key) => Number(stats[key] ?? 0) > 0);
}

function mapBoxScorePlayers(team: any, teamSide: "away" | "home") {
  const teamInfo = team?.team ?? {};
  const playersById = team?.players ?? {};
  const batterIds = (team?.batters ?? []) as number[];
  const pitcherIds = (team?.pitchers ?? []) as number[];
  const pitcherOrderMap = new Map(
    pitcherIds.map((playerId, index) => [playerId, index + 1]),
  );
  const usedPlayerIds = [...new Set([...batterIds, ...pitcherIds])];

  return usedPlayerIds
    .map((playerId) => {
      const entry = playersById[`ID${playerId}`];
      const battingOrder = Number(entry?.battingOrder);
      const hasBattingOrder = Number.isFinite(battingOrder);
      const rawBattingStats = entry?.stats?.batting ?? null;
      const battingStats = hasBattingOrder || hasOffensiveEvent(rawBattingStats)
        ? entry?.stats?.batting ?? null
        : null;
      const pitchingStats = pitcherOrderMap.has(playerId)
        ? entry?.stats?.pitching ?? null
        : null;

      return {
        playerId,
        playerName: entry?.person?.fullName ?? "Unknown Player",
        position:
          entry?.position?.abbreviation ??
          entry?.position?.name ??
          entry?.person?.primaryPosition?.abbreviation ??
          "—",
        teamSide,
        teamName: teamInfo.name ?? "Unknown Team",
        teamAbbreviation: teamInfo.abbreviation ?? teamInfo.teamCode ?? "—",
        teamLogoUrl: getTeamLogoUrl(teamInfo.id),
        battingOrder: hasBattingOrder ? battingOrder : null,
        pitchingOrder: pitcherOrderMap.get(playerId) ?? null,
        battingStats,
        pitchingStats,
      } as MlbBoxScorePlayer;
    })
    .filter((player) => {
      const hasBattingAppearance =
        hasBoxScoreStats(player.battingStats) &&
        (player.battingOrder !== null || hasOffensiveEvent(player.battingStats));
      const hasPitchingAppearance =
        pitcherOrderMap.has(player.playerId) && hasBoxScoreStats(player.pitchingStats);

      return hasBattingAppearance || hasPitchingAppearance;
    });
}

export async function fetchMlbBoxScore(gamePk: number): Promise<MlbBoxScore> {
  const response = await fetch(
    `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch MLB box score");
  }

  const data = await response.json();
  const awayTeam = data?.teams?.away ?? {};
  const homeTeam = data?.teams?.home ?? {};

  return {
    gamePk,
    awayTeamName: awayTeam?.team?.name ?? "Away",
    awayTeamAbbreviation: awayTeam?.team?.abbreviation ?? awayTeam?.team?.teamCode ?? "—",
    homeTeamName: homeTeam?.team?.name ?? "Home",
    homeTeamAbbreviation: homeTeam?.team?.abbreviation ?? homeTeam?.team?.teamCode ?? "—",
    players: [
      ...mapBoxScorePlayers(awayTeam, "away"),
      ...mapBoxScorePlayers(homeTeam, "home"),
    ],
  };
}

function mapBoxScoreStatRecord({
  player,
  stats,
  group,
}: {
  player: MlbBoxScorePlayer;
  stats: MlbBoxScorePlayerStats;
  group: "hitting" | "pitching";
}): MlbStatRecord {
  return {
    playerId: player.playerId,
    playerName: player.playerName,
    position: player.position,
    teamName: player.teamName,
    teamAbbreviation: player.teamAbbreviation,
    teamLogoUrl: player.teamLogoUrl,
    stats: {
      ...stats,
      gamesPlayed: 1,
      gamesStarted:
        group === "pitching" && player.pitchingOrder === 1
          ? 1
          : stats.gamesStarted ?? 0,
    },
  };
}

export async function fetchMlbDailyStats(
  group: "hitting" | "pitching",
  date = new Date(),
): Promise<MlbStatRecord[]> {
  const games = await fetchMlbGames(date);
  const playedGames = games.filter((game) => game.status !== "upcoming");

  if (!playedGames.length) {
    return [];
  }

  const boxScores = await Promise.all(
    playedGames.map((game) => fetchMlbBoxScore(game.gamePk)),
  );

  return boxScores.flatMap((boxScore) =>
    boxScore.players
      .map((player) => {
        const stats =
          group === "hitting" ? player.battingStats : player.pitchingStats;

        if (!stats || !Object.keys(stats).length) {
          return null;
        }

        return mapBoxScoreStatRecord({ player, stats, group });
      })
      .filter((record): record is MlbStatRecord => record !== null),
  );
}

export async function fetchMlbStats(
  group: "hitting" | "pitching",
  season = 2026
): Promise<MlbStatRecord[]> {
  const [teamsResponse] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/teams?season=${season}&sportIds=1`),
  ]);

  if (!teamsResponse.ok) {
    throw new Error(`Failed to fetch MLB team metadata`);
  }

  const teamsData = await teamsResponse.json();
  const teamMap = new Map<number, MlbTeam>(
    (teamsData?.teams ?? []).map((team: MlbTeam) => [team.id, team])
  );

  const allSplits: any[] = [];
  const pageSize = 100;
  const seenPlayerIds = new Set<number>();
  let offset = 0;

  const appendSplits = (splits: any[]) => {
    splits.forEach((split) => {
      const playerId = split?.player?.id;
      if (playerId && seenPlayerIds.has(playerId)) {
        return;
      }

      if (playerId) {
        seenPlayerIds.add(playerId);
      }

      allSplits.push(split);
    });
  };

  const initialStatsResponse = await fetch(
    `https://statsapi.mlb.com/api/v1/stats?stats=season&group=${group}&season=${season}&gameType=R&sportIds=1&playerPool=ALL&limit=10000`
  );

  if (!initialStatsResponse.ok) {
    throw new Error(`Failed to fetch MLB ${group} stats`);
  }

  const initialData = await initialStatsResponse.json();
  appendSplits(initialData?.stats?.[0]?.splits ?? []);

  while (true) {
    const statsResponse = await fetch(
      `https://statsapi.mlb.com/api/v1/stats?stats=season&group=${group}&season=${season}&gameType=R&sportIds=1&playerPool=ALL&limit=${pageSize}&offset=${offset}`
    );

    if (!statsResponse.ok) {
      throw new Error(`Failed to fetch MLB ${group} stats`);
    }

    const data = await statsResponse.json();
    const splits = data?.stats?.[0]?.splits ?? [];

    if (!splits.length) {
      break;
    }

    appendSplits(splits);

    if (splits.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return allSplits.map((split: any) => {
    const team = split.team;
    const teamInfo = team ? teamMap.get(team.id) : null;
    const teamId = team?.id;
    const fallbackLogoUrl = teamId
      ? `https://www.mlbstatic.com/team-logos/${teamId}.svg`
      : undefined;

    return {
      playerId: split.player?.id,
      playerName: split.player?.fullName ?? "Unknown Player",
      position:
        split.player?.primaryPosition?.abbreviation ??
        split.player?.primaryPosition?.name ??
        split.position?.abbreviation ??
        "—",
      teamName: teamInfo?.name ?? team?.name ?? "Unknown Team",
      teamAbbreviation: teamInfo?.abbreviation ?? team?.abbreviation ?? "UNK",
      teamLogoUrl:
        teamInfo?.logos?.[0]?.href ??
        teamInfo?.logo ??
        fallbackLogoUrl,
      stats: split.stat ?? {},
    };
  });
}

async function fetchMlbDraftInfo(playerId: number, draftYear: string | number | null) {
  if (!draftYear) {
    return null;
  }

  try {
    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/draft/${draftYear}?playerId=${playerId}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const rounds = data?.drafts?.rounds ?? [];
    const pick = rounds
      .flatMap((round: any) => round?.picks ?? [])
      .find((entry: any) => entry?.person?.id === playerId || entry?.bisPlayerId === playerId);

    return pick ?? null;
  } catch {
    return null;
  }
}

export async function fetchMlbPlayerProfile(
  playerId: number,
  season = 2026
): Promise<MlbPlayerProfile> {
  const [playerResponse, teamsResponse] = await Promise.all([
    fetch(
      `https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=currentTeam,stats(group=[hitting,pitching],type=[season],season=${season})`
    ),
    fetch(`https://statsapi.mlb.com/api/v1/teams?season=${season}&sportIds=1`),
  ]);

  if (!playerResponse.ok) {
    throw new Error("Failed to fetch MLB player profile");
  }

  if (!teamsResponse.ok) {
    throw new Error("Failed to fetch MLB team metadata");
  }

  const playerData = await playerResponse.json();
  const teamsData = await teamsResponse.json();
  const person = playerData?.people?.[0];
  const stats = person?.stats ?? [];
  const hittingSplit = stats.find(
    (entry: any) => entry?.group?.displayName === "hitting"
  )?.splits?.find((split: any) => split?.season === String(season));
  const pitchingSplit = stats.find(
    (entry: any) => entry?.group?.displayName === "pitching"
  )?.splits?.find((split: any) => split?.season === String(season));
  const team = hittingSplit?.team ?? pitchingSplit?.team ?? person?.currentTeam ?? null;
  const teamMap = new Map<number, MlbTeam>(
    (teamsData?.teams ?? []).map((teamItem: MlbTeam) => [teamItem.id, teamItem])
  );
  const teamInfo = team ? teamMap.get(team.id) : null;
  const fallbackLogoUrl = team?.id
    ? `https://www.mlbstatic.com/team-logos/${team.id}.svg`
    : undefined;
  const draftInfo = await fetchMlbDraftInfo(playerId, person?.draftYear ?? null);
  const draftHome = draftInfo?.home
    ? [draftInfo.home.city, draftInfo.home.state, draftInfo.home.country]
        .filter(Boolean)
        .join(", ")
    : null;

  return {
    playerId: person?.id ?? playerId,
    playerName: person?.fullName ?? "Unknown Player",
    position:
      person?.primaryPosition?.abbreviation ??
      person?.primaryPosition?.name ??
      "—",
    primaryPosition: person?.primaryPosition?.name ?? undefined,
    teamName: teamInfo?.name ?? team?.name ?? "Unknown Team",
    teamAbbreviation: teamInfo?.abbreviation ?? team?.abbreviation ?? "UNK",
    teamLogoUrl:
      teamInfo?.logos?.[0]?.href ?? teamInfo?.logo ?? fallbackLogoUrl,
    batSide: person?.batSide?.description ?? null,
    pitchHand: person?.pitchHand?.description ?? null,
    height: person?.height ?? null,
    weight: person?.weight ?? null,
    birthCity: person?.birthCity ?? null,
    birthCountry: person?.birthCountry ?? null,
    debutDate: person?.mlbDebutDate ?? null,
    birthDate: person?.birthDate ?? null,
    currentAge: person?.currentAge ?? null,
    draftYear: person?.draftYear ?? draftInfo?.year ?? null,
    draftRound: draftInfo?.pickRound ?? person?.draftRound ?? null,
    draftPick: draftInfo?.pickNumber ?? person?.draftPick ?? null,
    draftTeam: draftInfo?.team?.name ?? person?.draftTeam?.name ?? null,
    draftSchool: draftInfo?.school?.name ?? null,
    draftHome,
    draftSigningBonus: draftInfo?.signingBonus ?? null,
    draftRank: draftInfo?.rank ?? null,
    hittingStats: hittingSplit?.stat ?? null,
    pitchingStats: pitchingSplit?.stat ?? null,
  };
}

export function formatStatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return value.toString();
    }

    return value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  return value;
}
