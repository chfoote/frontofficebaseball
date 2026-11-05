type ScoredTeam = { id: number; points: number };

export async function findAvailableStandingsOrder(
  season: number,
  firstSeason: number,
  latestSeason: number,
  loadSeason: (year: number) => Promise<ScoredTeam[]>,
) {
  let rows: ScoredTeam[] = [];
  // Future roster dashboards use the most recent season with actual scores.
  for (let year = Math.min(season, latestSeason); year >= firstSeason; year--) {
    rows = await loadSeason(year);
    if (rows.some((row) => row.points !== 0)) break;
  }
  return rows.map((row) => row.id);
}
