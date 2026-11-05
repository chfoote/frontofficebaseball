type SeasonContract = {
  id: number;
  player_id: number;
  season_year: number;
  fantasy_team_id: number | null;
  salary: number | null;
  position: string | null;
  term_end_year: number | null;
};

export function projectSeasonContracts<T extends SeasonContract>(rows: T[], season: number): T[] {
  const latest = new Map<number, T>();
  for (const row of rows) {
    if (row.season_year > season) continue;
    const previous = latest.get(row.player_id);
    if (!previous || row.season_year > previous.season_year || (row.season_year === previous.season_year && row.id > previous.id)) {
      latest.set(row.player_id, row);
    }
  }
  return [...latest.values()].flatMap((row) => {
    // A newer season row wins globally, including trades, releases and RFA rights.
    // Never resurrect an older contract after a newer record has replaced it.
    if (row.season_year === season) return [row];
    if (!row.fantasy_team_id || row.salary === null || (row.term_end_year ?? row.season_year) < season) return [];
    if (["RFA", "PROSPECT", "AP", "BUYOUT", "RETENTION"].includes((row.position || "").toUpperCase())) return [];
    return [{ ...row, season_year: season }];
  });
}
