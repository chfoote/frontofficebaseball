import { supabase } from "./supabase";
import { applyTeamBranding, fetchFantasyTeams, fetchTeamBrandingHistory, type FantasyTeam } from "./fantasyTeams";
import { fetchPlayerSeasons, fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "./fantasyPlayers";
import { fetchLeagueTransactions } from "./transactions";
import { fetchPlayerAwards } from "./awards";
import { fetchNhlGoalieStats, fetchNhlGoalieStatsForPeriod, fetchNhlSkaterStats, fetchNhlSkaterStatsForPeriod, getGoalieScore, getNhlStatsDate, getSkaterScore, type NhlGoalieRecord, type NhlSkaterRecord } from "./nhl";
import { fetchSeasonLeadership } from "./teamLeadership";

export type RecordBookEntry = {
  key: string;
  category: "Team Performance" | "Player Performance" | "Awards & Leadership";
  label: string;
  value: number;
  formattedValue: string;
  holder: string;
  team: FantasyTeam | null;
  playerId?: string;
  dateLabel?: string;
  verification: "verified" | "backfilled" | "live";
};

export type ContractRecord = {
  key: string;
  playerId: string;
  playerName: string;
  position: "C" | "LW" | "RW" | "D" | "G";
  aav: number;
  years: number;
  startSeason: number;
  endSeason: number;
  totalValue: number;
  signingTeam: FantasyTeam | null;
  currentTeam: FantasyTeam | null;
};

export type ScoringLeader = {
  key: string;
  playerId: string;
  playerName: string;
  position: "C" | "LW" | "RW" | "D" | "G";
  gamesPlayed: number;
  fantasyPoints: number;
  seasons: number[];
  team: FantasyTeam | null;
  currentTeam: FantasyTeam | null;
};

export type FranchiseStatLine = {
  key: string;
  playerId: string;
  playerName: string;
  position: ScoringLeader["position"];
  seasons: number[];
  team: FantasyTeam | null;
  currentTeam: FantasyTeam | null;
  skater: {
    gamesPlayed: number; goals: number; assists: number; points: number; plusMinus: number; penaltyMinutes: number; shots: number;
    ppGoals: number; ppAssists: number; shGoals: number; shAssists: number; gameWinningGoals: number;
    blockedShots: number; hits: number; faceoffWins: number; fantasyPoints: number; pointsPerGame: number;
  } | null;
  goalie: {
    gamesPlayed: number; gamesStarted: number; wins: number; losses: number; otLosses: number; goalsAgainst: number;
    saves: number; shutouts: number; penaltyMinutes: number; goals: number; assists: number; savePct: number;
    goalsAgainstAverage: number; fantasyPoints: number; pointsPerGame: number;
  } | null;
};

export type DailyPlayerPerformance = {
  id: number; performance_date: string; season_year: number; player_id: number; player_season_id: number | null; fantasy_team_id: number | null;
  player_name: string; position: string | null; leadership_role: "C" | "A" | null; games_played: number; goals: number; assists: number;
  wins: number; saves: number; shutouts: number; fantasy_points: number; verification_status: string;
};

export type DailyTeamPerformance = {
  id: number; performance_date: string; season_year: number; fantasy_team_id: number; fantasy_points: number; active_players: number; verification_status: string;
};

export type RecordHistoryEvent = {
  id: number; record_key: string; scope: "league" | "franchise"; fantasy_team_id: number | null; season_year: number | null;
  holder_type: "team" | "player" | "manager"; holder_name: string; record_value: number; previous_value: number | null;
  period_start: string | null; period_end: string | null; verification_status: string; achieved_at: string;
};

const number = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 });
const activePositions = new Set(["C", "LW", "RW", "D", "G"]);
const prospectPositions = new Set(["PROSPECT", "AP"]);

function playerName(row: PlayerSeasonWithRelations) {
  return row.player?.full_name || [row.player?.first_name, row.player?.last_name].filter(Boolean).join(" ") || "Unknown player";
}

function fantasySeasonForDate(date: string) {
  const [year, month] = date.split("-").map(Number);
  return month >= 9 ? year + 1 : year;
}

function nhlSeasonId(year: number) { return (year - 1) * 10000 + year; }

export async function fetchRecordBookData(teamId?: number | null, seasonYear?: number | null, asOfDate?: string) {
  let teamQuery = supabase.from("daily_team_performances").select("*");
  let playerQuery = supabase.from("daily_player_performances").select("*");
  let historyQuery = supabase.from("record_history").select("*").order("achieved_at", { ascending: false }).limit(50);
  if (teamId) { teamQuery = teamQuery.eq("fantasy_team_id", teamId); playerQuery = playerQuery.eq("fantasy_team_id", teamId); }
  if (teamId) historyQuery = historyQuery.eq("scope", "franchise").eq("fantasy_team_id", teamId); else historyQuery = historyQuery.eq("scope", "league");
  if (seasonYear) { teamQuery = teamQuery.eq("season_year", seasonYear); playerQuery = playerQuery.eq("season_year", seasonYear); }
  if (seasonYear) historyQuery = historyQuery.eq("season_year", seasonYear);

  const performanceSeason = seasonYear || (asOfDate ? fantasySeasonForDate(asOfDate) : 2026);
  const useDatedStats = Boolean(asOfDate && asOfDate < getNhlStatsDate());
  const seasonStart = `${performanceSeason - 1}-07-01`;
  const performanceSkaters = useDatedStats ? fetchNhlSkaterStatsForPeriod(nhlSeasonId(performanceSeason), seasonStart, asOfDate!) : fetchNhlSkaterStats(nhlSeasonId(performanceSeason));
  const performanceGoalies = useDatedStats ? fetchNhlGoalieStatsForPeriod(nhlSeasonId(performanceSeason), seasonStart, asOfDate!) : fetchNhlGoalieStats(nhlSeasonId(performanceSeason));
  const [{ data: teamDays, error: teamError }, { data: playerDays, error: playerError }, { data: history, error: historyError }, { data: rookies, error: rookieError }, teams, brandingHistory, allSeasons, transactions, awards, seasonSkaters, seasonGoalies] = await Promise.all([
    teamQuery, playerQuery, historyQuery, supabase.from("rookie_eligibility").select("season_year,player_id").eq("season_year", performanceSeason), fetchFantasyTeams(true), fetchTeamBrandingHistory(), fetchPlayerSeasons(), fetchLeagueTransactions(), fetchPlayerAwards(seasonYear || undefined, false),
    performanceSkaters, performanceGoalies,
  ]);
  if (teamError) throw teamError;
  if (playerError) throw playerError;
  if (historyError) throw historyError;
  if (rookieError) throw rookieError;
  const dailyTeams = (teamDays || []) as DailyTeamPerformance[];
  const dailyPlayers = (playerDays || []) as DailyPlayerPerformance[];
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const entries: RecordBookEntry[] = [];
  const seasons = seasonYear ? allSeasons.filter((row) => row.season_year === seasonYear) : allSeasons;
  const eligibleSeasons = teamId ? seasons.filter((row) => row.fantasy_team_id === teamId) : seasons.filter((row) => row.fantasy_team_id);

  const teamRecordHistory = ((history || []) as RecordHistoryEvent[]).filter((event) => ["highest-scoring-team", "lowest-scoring-team"].includes(event.record_key));
  const storedTeamRecords = [
    [...teamRecordHistory].filter((event) => event.record_key === "highest-scoring-team").sort((a, b) => Number(b.record_value) - Number(a.record_value))[0],
    [...teamRecordHistory].filter((event) => event.record_key === "lowest-scoring-team").sort((a, b) => Number(a.record_value) - Number(b.record_value))[0],
  ].filter((event): event is RecordHistoryEvent => Boolean(event));
  storedTeamRecords.forEach((event) => entries.push({
    key: event.record_key,
    category: "Team Performance",
    label: event.record_key === "highest-scoring-team" ? "Highest-Scoring Team" : "Lowest-Scoring Team",
    value: Number(event.record_value),
    formattedValue: `${number.format(Number(event.record_value))} FPTS`,
    holder: event.holder_name,
    team: event.fantasy_team_id ? teamMap.get(event.fantasy_team_id) || null : null,
    dateLabel: `Season ${event.season_year}`,
    verification: event.verification_status === "backfilled" ? "backfilled" : "verified",
  }));

  const rookieIds = new Set([
    ...(rookies || []).map((row) => Number(row.player_id)),
    ...eligibleSeasons
      .filter((row) => row.season_year === performanceSeason && row.salary === 500_000 && row.term_end_year === performanceSeason + 2)
      .map((row) => row.player_id),
  ]);
  const skaterMap = new Map(seasonSkaters.map((row) => [String(row.playerId), row]));
  const goalieMap = new Map(seasonGoalies.map((row) => [String(row.playerId), row]));
  const positionRows = eligibleSeasons.filter((row) => row.season_year === performanceSeason && activePositions.has((row.position || "").toUpperCase())).map((row) => {
    const apiId = row.player?.player_api_id || "";
    const goalie = goalieMap.get(apiId);
    const skater = skaterMap.get(apiId);
    const nhlPosition = skater?.positionCode === "L" ? "LW" : skater?.positionCode === "R" ? "RW" : skater?.positionCode;
    const code = goalie ? "G" : (nhlPosition || row.position || "").toUpperCase();
    return { row, code, gamesPlayed: goalie?.gamesPlayed || skater?.gamesPlayed || 0, score: goalie ? getGoalieScore(goalie) : skater ? getSkaterScore(skater) : 0 };
  });
  (["C", "LW", "RW", "D", "G"] as const).forEach((positionCode) => {
    const played = positionRows.filter((item) => item.code === positionCode && item.gamesPlayed > 0);
    const top = [...played].sort((a, b) => b.score - a.score)[0];
    const lowest = [...played].sort((a, b) => a.score - b.score)[0];
    const rookie = [...played].filter((item) => rookieIds.has(item.row.player_id)).sort((a, b) => b.score - a.score)[0];
    const addSeasonPlayer = (item: typeof top, key: string, label: string) => {
      if (!item) return;
      entries.push({ key, category: "Player Performance", label, value: item.score, formattedValue: `${number.format(item.score)} FPTS`, holder: playerName(item.row), team: item.row.fantasy_team_id ? teamMap.get(item.row.fantasy_team_id) || null : null, playerId: item.row.player?.player_api_id || undefined, dateLabel: `${item.gamesPlayed} GP · Season ${performanceSeason}`, verification: "verified" });
    };
    addSeasonPlayer(top, `top-scoring-${positionCode.toLowerCase()}`, `Top-Scoring ${positionCode}`);
    addSeasonPlayer(lowest, `lowest-scoring-${positionCode.toLowerCase()}`, `Lowest-Scoring ${positionCode}`);
    addSeasonPlayer(rookie, `top-rookie-${positionCode.toLowerCase()}`, `Top-Scoring Rookie ${positionCode}`);
  });

  const contractGroups = new Map<string, PlayerSeasonWithRelations[]>();
  allSeasons.filter((row) => row.salary != null && row.term_end_year != null && row.player?.player_api_id).forEach((row) => {
    const key = `${row.player_id}:${row.salary}:${row.term_end_year}`;
    contractGroups.set(key, [...(contractGroups.get(key) || []), row]);
  });
  const contracts: ContractRecord[] = [...contractGroups.entries()].map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => a.season_year - b.season_year);
    const first = sorted[0];
    const current = sorted[sorted.length - 1];
    const signing = transactions.filter((tx) => tx.player_id === first.player_id && tx.transaction_type !== "trade" && tx.salary === first.salary && tx.term_end_year === first.term_end_year).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))[0];
    const startSeason = signing?.season_year || first.season_year;
    const years = Math.max((first.term_end_year || startSeason) - startSeason + 1, 1);
    const apiId = first.player?.player_api_id || "";
    const skater = skaterMap.get(apiId);
    const goalie = goalieMap.get(apiId);
    const nhlPosition = skater?.positionCode === "L" ? "LW" : skater?.positionCode === "R" ? "RW" : skater?.positionCode;
    const position = (goalie ? "G" : nhlPosition || first.position || "C") as ContractRecord["position"];
    return { key, playerId: apiId, playerName: playerName(first), position, aav: first.salary || 0, years, startSeason, endSeason: first.term_end_year || startSeason, totalValue: (first.salary || 0) * years, signingTeam: signing?.fantasy_team || (first.fantasy_team_id ? teamMap.get(first.fantasy_team_id) || null : null), currentTeam: current.fantasy_team_id ? teamMap.get(current.fantasy_team_id) || null : null };
  }).filter((contract) => (!seasonYear || contract.startSeason === seasonYear) && (!teamId || contract.signingTeam?.id === teamId));
  const topContracts = (["C", "LW", "RW", "D", "G"] as const).flatMap((position) => contracts.filter((contract) => contract.position === position).sort((a, b) => b.totalValue - a.totalValue || b.aav - a.aav).slice(0, 5));

  const leaderYears = [...new Set(allSeasons.map((row) => row.season_year))].filter((year) => (!seasonYear || year === seasonYear) && (!asOfDate || year <= performanceSeason)).sort((a, b) => a - b);
  const leaderStats = await Promise.all(leaderYears.map(async (year) => {
    if (year === performanceSeason) return { year, skaters: seasonSkaters, goalies: seasonGoalies };
    const [skaters, goalies] = await Promise.all([fetchNhlSkaterStats(nhlSeasonId(year)), fetchNhlGoalieStats(nhlSeasonId(year))]);
    return { year, skaters, goalies };
  }));
  const callUpDateBySeasonPlayer = new Map<string, string>();
  transactions.filter((transaction) => transaction.action === "called_up" && transaction.player_id).forEach((transaction) => {
    const key = `${transaction.season_year}:${transaction.player_id}`;
    const current = callUpDateBySeasonPlayer.get(key);
    if (!current || transaction.transaction_date < current) callUpDateBySeasonPlayer.set(key, transaction.transaction_date);
  });
  const leaderRows = leaderYears.flatMap((year) => {
    const yearStats = leaderStats.find((item) => item.year === year);
    const yearSkaters = new Map((yearStats?.skaters || []).map((row) => [String(row.playerId), row]));
    const yearGoalies = new Map((yearStats?.goalies || []).map((row) => [String(row.playerId), row]));
    return allSeasons.filter((row) => row.season_year === year && row.player?.player_api_id && row.fantasy_team_id)
      .filter((row) => !prospectPositions.has((row.position || "").toUpperCase()) || callUpDateBySeasonPlayer.has(`${year}:${row.player_id}`))
      .map((row) => {
      const playerId = row.player!.player_api_id;
      const skater = yearSkaters.get(playerId);
      const goalie = yearGoalies.get(playerId);
      const nhlPosition = skater?.positionCode === "L" ? "LW" : skater?.positionCode === "R" ? "RW" : skater?.positionCode;
      const position = (goalie ? "G" : nhlPosition || row.position || "C").toUpperCase() as ScoringLeader["position"];
      return { row, playerId, position, skater: skater || null, goalie: goalie || null, gamesPlayed: goalie?.gamesPlayed || skater?.gamesPlayed || 0, fantasyPoints: goalie ? getGoalieScore(goalie) : skater ? getSkaterScore(skater) : 0 };
    }).filter((item) => activePositions.has(item.position) && item.gamesPlayed > 0);
  });
  const tradeMoves = transactions.flatMap((transaction) => transaction.transaction_type === "trade" && transaction.trade_offer
    ? transaction.trade_offer.trade_offer_players.map((move) => ({ playerId: move.player_season?.player_id, fromTeamId: move.from_team_id, toTeamId: move.to_team_id, date: transaction.transaction_date }))
    : []).filter((move): move is { playerId: number; fromTeamId: number; toTeamId: number; date: string } => move.playerId != null);
  const ownerOnDate = (playerId: number, currentTeamId: number | null, date: string) => {
    let ownerId = currentTeamId;
    tradeMoves.filter((move) => move.playerId === playerId && move.date > date).sort((a, b) => b.date.localeCompare(a.date)).forEach((move) => {
      if (ownerId === move.toTeamId) ownerId = move.fromTeamId;
    });
    return ownerId;
  };
  const previousDate = (date: string) => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  };
  const franchiseLeaderRows = (await Promise.all(leaderYears.map(async (year) => {
    const seasonStart = `${year - 1}-07-01`;
    const seasonEnd = asOfDate && year === performanceSeason && asOfDate < `${year}-06-30` ? asOfDate : `${year}-06-30`;
    const yearRows = leaderRows.filter((item) => item.row.season_year === year);
    const playerIds = new Set(yearRows.map((item) => item.row.player_id));
    const tradeDates = [...new Set(tradeMoves.filter((move) => playerIds.has(move.playerId) && move.date >= seasonStart && move.date <= seasonEnd).map((move) => move.date))].sort();
    const callUpDates = [...new Set(yearRows.map((item) => callUpDateBySeasonPlayer.get(`${year}:${item.row.player_id}`)).filter((date): date is string => Boolean(date) && date! >= seasonStart && date! <= seasonEnd))];
    const boundaryDates = [...new Set([...tradeDates, ...callUpDates])].sort();
    if (!boundaryDates.length) return yearRows.map((item) => ({ ...item, row: { ...item.row, fantasy_team_id: ownerOnDate(item.row.player_id, item.row.fantasy_team_id, seasonEnd) } })).filter((item) => item.row.fantasy_team_id);
    const starts = [seasonStart, ...boundaryDates];
    const periods = starts.map((start, index) => ({ start, end: index + 1 < starts.length ? previousDate(starts[index + 1]) : seasonEnd })).filter((period) => period.start <= period.end);
    const periodStats = await Promise.all(periods.map(async (period) => {
      const [skaters, goalies] = await Promise.all([fetchNhlSkaterStatsForPeriod(nhlSeasonId(year), period.start, period.end), fetchNhlGoalieStatsForPeriod(nhlSeasonId(year), period.start, period.end)]);
      return { ...period, skaters: new Map(skaters.map((row) => [String(row.playerId), row])), goalies: new Map(goalies.map((row) => [String(row.playerId), row])) };
    }));
    return periodStats.flatMap((period) => yearRows.map((item) => {
      const skater = period.skaters.get(item.playerId);
      const goalie = period.goalies.get(item.playerId);
      const gamesPlayed = goalie?.gamesPlayed || skater?.gamesPlayed || 0;
      const callUpDate = callUpDateBySeasonPlayer.get(`${year}:${item.row.player_id}`);
      const fantasyTeamId = ownerOnDate(item.row.player_id, item.row.fantasy_team_id, period.start);
      return { ...item, row: { ...item.row, fantasy_team_id: fantasyTeamId }, skater: skater || null, goalie: goalie || null, gamesPlayed, fantasyPoints: goalie ? getGoalieScore(goalie) : skater ? getSkaterScore(skater) : 0, eligible: !callUpDate || period.start >= callUpDate };
    }).filter((item) => item.eligible && item.gamesPlayed > 0 && item.row.fantasy_team_id));
  }))).flat();
  const buildLeaders = (byFranchise: boolean, limitPerPosition = true) => {
    const sourceRows = byFranchise ? franchiseLeaderRows : leaderRows;
    const groups = new Map<string, typeof leaderRows>();
    sourceRows.filter((item) => !teamId || item.row.fantasy_team_id === teamId).forEach((item) => {
      const key = byFranchise ? `${item.playerId}:${item.row.fantasy_team_id}` : item.playerId;
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    const leaders: ScoringLeader[] = [...groups.entries()].map(([key, rows]) => {
      const latest = [...rows].sort((a, b) => b.row.season_year - a.row.season_year)[0];
      const currentSeason = allSeasons.filter((row) => row.player_id === latest.row.player_id && row.fantasy_team_id).sort((a, b) => b.season_year - a.season_year)[0];
      const creditedTeam = latest.row.fantasy_team_id ? teamMap.get(latest.row.fantasy_team_id) || null : null;
      return { key, playerId: latest.playerId, playerName: playerName(latest.row), position: latest.position, gamesPlayed: rows.reduce((sum, item) => sum + item.gamesPlayed, 0), fantasyPoints: rows.reduce((sum, item) => sum + item.fantasyPoints, 0), seasons: [...new Set(rows.map((item) => item.row.season_year))].sort((a, b) => a - b), team: creditedTeam ? applyTeamBranding(creditedTeam, brandingHistory, latest.row.season_year) : null, currentTeam: currentSeason?.fantasy_team_id ? teamMap.get(currentSeason.fantasy_team_id) || null : null };
    });
    return (["C", "LW", "RW", "D", "G"] as const).flatMap((position) => {
      const sorted = leaders.filter((leader) => leader.position === position).sort((a, b) => b.fantasyPoints - a.fantasyPoints || b.gamesPlayed - a.gamesPlayed);
      return limitPerPosition ? sorted.slice(0, 5) : sorted;
    });
  };
  const positionLeaders = buildLeaders(false);
  const franchisePositionLeaders = buildLeaders(true, false);
  const franchiseGroups = new Map<string, typeof franchiseLeaderRows>();
  franchiseLeaderRows.filter((item) => !teamId || item.row.fantasy_team_id === teamId).forEach((item) => {
    const key = `${item.playerId}:${item.row.fantasy_team_id}`;
    franchiseGroups.set(key, [...(franchiseGroups.get(key) || []), item]);
  });
  const sumSkater = (rows: NhlSkaterRecord[], field: keyof NhlSkaterRecord) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
  const sumGoalie = (rows: NhlGoalieRecord[], field: keyof NhlGoalieRecord) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
  const franchiseStatLines: FranchiseStatLine[] = [...franchiseGroups.entries()].map(([key, rows]) => {
    const latest = [...rows].sort((a, b) => b.row.season_year - a.row.season_year)[0];
    const currentSeason = allSeasons.filter((row) => row.player_id === latest.row.player_id && row.fantasy_team_id).sort((a, b) => b.season_year - a.season_year)[0];
    const skaters = rows.map((item) => item.skater).filter((row): row is NhlSkaterRecord => Boolean(row));
    const goalies = rows.map((item) => item.goalie).filter((row): row is NhlGoalieRecord => Boolean(row));
    const fantasyPoints = rows.reduce((sum, item) => sum + item.fantasyPoints, 0);
    const gamesPlayed = rows.reduce((sum, item) => sum + item.gamesPlayed, 0);
    const saves = sumGoalie(goalies, "saves");
    const goalsAgainst = sumGoalie(goalies, "goalsAgainst");
    const gaaWeight = goalies.reduce((sum, row) => sum + (row.goalsAgainstAverage == null ? 0 : row.gamesPlayed), 0);
    const creditedTeam = latest.row.fantasy_team_id ? teamMap.get(latest.row.fantasy_team_id) || null : null;
    return {
      key, playerId: latest.playerId, playerName: playerName(latest.row), position: latest.position,
      seasons: [...new Set(rows.map((item) => item.row.season_year))].sort((a, b) => a - b),
      team: creditedTeam ? applyTeamBranding(creditedTeam, brandingHistory, latest.row.season_year) : null,
      currentTeam: currentSeason?.fantasy_team_id ? teamMap.get(currentSeason.fantasy_team_id) || null : null,
      skater: skaters.length ? {
        gamesPlayed, goals: sumSkater(skaters, "goals"), assists: sumSkater(skaters, "assists"),
        points: sumSkater(skaters, "goals") + sumSkater(skaters, "assists"), plusMinus: sumSkater(skaters, "plusMinus"),
        penaltyMinutes: sumSkater(skaters, "penaltyMinutes"), shots: sumSkater(skaters, "shots"), ppGoals: sumSkater(skaters, "ppGoals"),
        ppAssists: sumSkater(skaters, "ppPoints") - sumSkater(skaters, "ppGoals"), shGoals: sumSkater(skaters, "shGoals"),
        shAssists: sumSkater(skaters, "shPoints") - sumSkater(skaters, "shGoals"), gameWinningGoals: sumSkater(skaters, "gameWinningGoals"),
        blockedShots: sumSkater(skaters, "blockedShots"), hits: sumSkater(skaters, "hits"), faceoffWins: sumSkater(skaters, "totalFaceoffWins"),
        fantasyPoints, pointsPerGame: gamesPlayed ? fantasyPoints / gamesPlayed : 0,
      } : null,
      goalie: goalies.length ? {
        gamesPlayed, gamesStarted: sumGoalie(goalies, "gamesStarted"), wins: sumGoalie(goalies, "wins"), losses: sumGoalie(goalies, "losses"),
        otLosses: sumGoalie(goalies, "otLosses"), goalsAgainst, saves, shutouts: sumGoalie(goalies, "shutouts"),
        penaltyMinutes: sumGoalie(goalies, "penaltyMinutes"), goals: sumGoalie(goalies, "goals"), assists: sumGoalie(goalies, "assists"),
        savePct: saves + goalsAgainst ? saves / (saves + goalsAgainst) : 0,
        goalsAgainstAverage: gaaWeight ? goalies.reduce((sum, row) => sum + Number(row.goalsAgainstAverage || 0) * row.gamesPlayed, 0) / gaaWeight : 0,
        fantasyPoints, pointsPerGame: gamesPlayed ? fantasyPoints / gamesPlayed : 0,
      } : null,
    };
  });

  const monthly = awards.filter((award) => award.is_monthly && (!teamId || award.fantasy_team_id === teamId));
  const honourCounts = new Map<number, number>(); monthly.forEach((award) => honourCounts.set(award.player_id, (honourCounts.get(award.player_id) || 0) + 1));
  const mostHonours = [...honourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (mostHonours) { const winner = monthly.find((award) => award.player_id === mostHonours[0]); entries.push({ key: "most-monthly-honours", category: "Awards & Leadership", label: "Most Monthly Honours", value: mostHonours[1], formattedValue: `${mostHonours[1]} honours`, holder: winner?.player?.full_name || "Unknown player", team: winner?.fantasy_team_id ? teamMap.get(winner.fantasy_team_id) || null : null, playerId: winner?.player?.player_api_id || undefined, verification: "verified" }); }

  return { entries, contracts: topContracts, positionLeaders, franchisePositionLeaders, franchiseStatLines, dailyTeams, dailyPlayers, history: (history || []) as RecordHistoryEvent[], teams };
}

export async function syncDailyRecordSnapshot(date: string) {
  const seasonYear = fantasySeasonForDate(date);
  const [skaters, goalies, roster, leadership, transactions, teams] = await Promise.all([
    fetchNhlSkaterStatsForPeriod(nhlSeasonId(seasonYear), date, date), fetchNhlGoalieStatsForPeriod(nhlSeasonId(seasonYear), date, date),
    fetchPlayerSeasonsBySeason(seasonYear), fetchSeasonLeadership(seasonYear), fetchLeagueTransactions(), fetchFantasyTeams(true),
  ]);
  const leadershipMap = new Map(leadership.map((row) => [row.player_season_id, row.slot === "C" ? "C" : "A"]));
  const skaterMap = new Map(skaters.map((row) => [String(row.playerId), row]));
  const goalieMap = new Map(goalies.map((row) => [String(row.playerId), row]));
  const historicalTeamId = (row: PlayerSeasonWithRelations) => {
    let id = row.fantasy_team_id;
    transactions.filter((tx) => tx.season_year === seasonYear && tx.transaction_type === "trade" && tx.transaction_date > date)
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)).forEach((tx) => { const move = tx.trade_offer?.trade_offer_players.find((candidate) => candidate.player_season?.player_id === row.player_id); if (move) id = move.from_team_id; });
    return id;
  };
  const rows = roster.filter((row) => activePositions.has((row.position || "").toUpperCase()) && row.player?.player_api_id).map((row) => {
    const id = row.player!.player_api_id; const skater = skaterMap.get(id); const goalie = goalieMap.get(id); const teamId = historicalTeamId(row);
    if (!skater && !goalie) return null;
    return { performance_date: date, season_year: seasonYear, player_id: row.player_id, player_season_id: row.id, fantasy_team_id: teamId, player_name: playerName(row), position: row.position, leadership_role: leadershipMap.get(row.id) || null, games_played: goalie?.gamesPlayed || skater?.gamesPlayed || 0, goals: goalie?.goals || skater?.goals || 0, assists: goalie?.assists || skater?.assists || 0, wins: goalie?.wins || 0, saves: goalie?.saves || 0, shutouts: goalie?.shutouts || 0, fantasy_points: goalie ? getGoalieScore(goalie) : getSkaterScore(skater!), stat_payload: goalie || skater, verification_status: "verified" };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row?.fantasy_team_id));

  const [{ data: previousTeamDays }, { data: previousPlayerDays }] = await Promise.all([
    supabase.from("daily_team_performances").select("fantasy_team_id,fantasy_points").neq("performance_date", date),
    supabase.from("daily_player_performances").select("fantasy_points").neq("performance_date", date).order("fantasy_points", { ascending: false }).limit(1),
  ]);

  const { error: playerError } = await supabase.from("daily_player_performances").upsert(rows, { onConflict: "performance_date,player_id,fantasy_team_id" });
  if (playerError) throw playerError;
  const totals = new Map<number, { points: number; players: number }>(); rows.forEach((row) => { const teamId = row.fantasy_team_id!; const current = totals.get(teamId) || { points: 0, players: 0 }; current.points += row.fantasy_points; current.players += row.games_played > 0 ? 1 : 0; totals.set(teamId, current); });
  const teamRows = [...totals].map(([fantasy_team_id, total]) => ({ performance_date: date, season_year: seasonYear, fantasy_team_id, fantasy_points: total.points, active_players: total.players, verification_status: "verified" }));
  const { error: teamError } = await supabase.from("daily_team_performances").upsert(teamRows, { onConflict: "performance_date,fantasy_team_id" });
  if (teamError) throw teamError;

  const best = [...teamRows].sort((a, b) => b.fantasy_points - a.fantasy_points)[0];
  const bestPlayer = [...rows].sort((a, b) => b.fantasy_points - a.fantasy_points)[0];
  const previousLeagueTeamRecord = Math.max(0, ...((previousTeamDays || []) as Array<{ fantasy_points: number }>).map((row) => Number(row.fantasy_points)));
  const previousPlayerRecord = Number((previousPlayerDays?.[0] as { fantasy_points?: number } | undefined)?.fantasy_points || 0);
  if (best) {
    const team = teams.find((candidate) => candidate.id === best.fantasy_team_id);
    await supabase.from("milestone_events").upsert({ event_key: `daily-leader:${date}:${best.fantasy_team_id}`, event_type: "daily_team_leader", season_year: seasonYear, fantasy_team_id: best.fantasy_team_id, title: "Daily scoring leader", body: `${team?.team_name || "A team"} led the GLDHL with ${number.format(best.fantasy_points)} fantasy points.`, event_date: date, status: "published", metadata: { fantasy_points: best.fantasy_points } }, { onConflict: "event_key" });
    if (best.fantasy_points > previousLeagueTeamRecord) {
      await supabase.from("record_history").upsert({ record_key: "highest-daily-team-score", scope: "league", fantasy_team_id: best.fantasy_team_id, season_year: seasonYear, holder_type: "team", holder_name: team?.team_name || "Unknown team", record_value: best.fantasy_points, previous_value: previousLeagueTeamRecord || null, period_start: date, period_end: date, verification_status: "verified" }, { onConflict: "record_key,scope,fantasy_team_id,holder_type,holder_name,record_value,period_start,period_end" });
      await supabase.from("milestone_events").upsert({ event_key: `league-record:daily-team:${date}:${best.fantasy_team_id}`, event_type: "league_record", season_year: seasonYear, fantasy_team_id: best.fantasy_team_id, title: "New league record", body: `${team?.team_name || "A team"} set a new single-day scoring record with ${number.format(best.fantasy_points)} fantasy points.`, event_date: date, status: "published", metadata: { record_key: "highest-daily-team-score", value: best.fantasy_points, previous_value: previousLeagueTeamRecord || null } }, { onConflict: "event_key" });
    }
  }
  if (bestPlayer && bestPlayer.fantasy_points > previousPlayerRecord) {
    await supabase.from("record_history").upsert({ record_key: "best-daily-player-score", scope: "league", fantasy_team_id: bestPlayer.fantasy_team_id, season_year: seasonYear, holder_type: "player", player_id: bestPlayer.player_id, holder_name: bestPlayer.player_name, record_value: bestPlayer.fantasy_points, previous_value: previousPlayerRecord || null, period_start: date, period_end: date, verification_status: "verified" }, { onConflict: "record_key,scope,fantasy_team_id,holder_type,holder_name,record_value,period_start,period_end" });
  }
  for (const teamDay of teamRows) {
    const previous = Math.max(0, ...((previousTeamDays || []) as Array<{ fantasy_team_id: number; fantasy_points: number }>).filter((row) => row.fantasy_team_id === teamDay.fantasy_team_id).map((row) => Number(row.fantasy_points)));
    if (teamDay.fantasy_points <= previous) continue;
    const team = teams.find((candidate) => candidate.id === teamDay.fantasy_team_id);
    await supabase.from("record_history").upsert({ record_key: "highest-daily-team-score", scope: "franchise", fantasy_team_id: teamDay.fantasy_team_id, season_year: seasonYear, holder_type: "team", holder_name: team?.team_name || "Unknown team", record_value: teamDay.fantasy_points, previous_value: previous || null, period_start: date, period_end: date, verification_status: "verified" }, { onConflict: "record_key,scope,fantasy_team_id,holder_type,holder_name,record_value,period_start,period_end" });
  }
  return { players: rows.length, teams: teamRows.length, seasonYear };
}
