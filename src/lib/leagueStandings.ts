import { fetchFantasyTeams } from "./fantasyTeams";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "./fantasyPlayers";
import { CURRENT_LEAGUE_SEASON, FIRST_LEAGUE_SEASON } from "./leagueSeasons";
import { fetchMlbStats, type MlbStatRecord } from "./mlb";
import { findAvailableStandingsOrder } from "./standingsOrder";

const scoringSlots = [
  ...["C", "1B", "2B", "SS", "3B", "DH"].map((position) => ({ position, index: 0 })),
  ...Array.from({ length: 3 }, (_, index) => ({ position: "OF", index })),
  ...Array.from({ length: 5 }, (_, index) => ({ position: "SP", index })),
  { position: "RP", index: 0 },
];

function position(row: PlayerSeasonWithRelations) {
  return (row.position || "").toUpperCase();
}

function batterScore(record: MlbStatRecord) {
  return Number(record.stats.runs ?? 0) + Number(record.stats.hits ?? 0)
    + Number(record.stats.doubles ?? 0) + Number(record.stats.triples ?? 0) * 2
    + Number(record.stats.homeRuns ?? 0) * 3 + Number(record.stats.rbi ?? 0)
    + Number(record.stats.stolenBases ?? 0) * 2;
}

function pitcherScore(record: MlbStatRecord) {
  return Number(record.stats.wins ?? 0) * 8 + Number(record.stats.strikeOuts ?? 0)
    + Number(record.stats.saves ?? 0) * 6 + Number(record.stats.completeGames ?? 0) * 5
    + Number(record.stats.shutouts ?? 0) * 5;
}

function teamPoints(
  players: PlayerSeasonWithRelations[],
  hitters: Map<string, MlbStatRecord>,
  pitchers: Map<string, MlbStatRecord>,
) {
  return scoringSlots.reduce((total, slot) => {
    const stats = slot.position === "SP" || slot.position === "RP" ? pitchers : hitters;
    const score = slot.position === "SP" || slot.position === "RP" ? pitcherScore : batterScore;
    const slotScore = players
      .filter((player) => position(player) === slot.position)
      .map((player) => stats.get(String(player.player?.player_api_id || "")))
      .filter((record): record is MlbStatRecord => Boolean(record))
      .map(score)
      .sort((a, b) => b - a)[slot.index] || 0;
    return total + slotScore;
  }, 0);
}

async function fetchSeasonOrder(season: number) {
  const [teams, players, [hitters, pitchers]] = await Promise.all([
    fetchFantasyTeams(),
    fetchPlayerSeasonsBySeason(season),
    // MLB statistics only determine display order. Missing future-season data
    // must not prevent the league's roster and payroll dashboard from loading.
    Promise.all([fetchMlbStats("hitting", season), fetchMlbStats("pitching", season)])
      .catch(() => [[], []] as [MlbStatRecord[], MlbStatRecord[]]),
  ]);
  const hitterMap = new Map(hitters.map((record) => [String(record.playerId), record]));
  const pitcherMap = new Map(pitchers.map((record) => [String(record.playerId), record]));
  const rows = teams.map((team, originalIndex) => ({
    id: team.id,
    originalIndex,
    points: teamPoints(players.filter((player) => player.fantasy_team_id === team.id), hitterMap, pitcherMap),
  }));
  rows.sort((a, b) => b.points - a.points || a.originalIndex - b.originalIndex);
  return rows;
}

export async function fetchStandingsTeamOrder(season: number) {
  return findAvailableStandingsOrder(season, FIRST_LEAGUE_SEASON, CURRENT_LEAGUE_SEASON, fetchSeasonOrder);
}
