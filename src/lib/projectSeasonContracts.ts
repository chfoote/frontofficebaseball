type SeasonContract = {
  id: number;
  league_id?: string;
  player_id: number;
  season_year: number;
  fantasy_team_id: number | null;
  salary: number | null;
  position: string | null;
  term_end_year: number | null;
};

export function projectSeasonContracts<T extends SeasonContract>(rows: T[], season: number, leagueId?: string): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    if (row.season_year > season || (leagueId !== undefined && row.league_id !== leagueId)) continue;
    const key = `${row.league_id || "legacy"}:${row.player_id}`;
    const previous = latest.get(key);
    if (!previous || row.season_year > previous.season_year || (row.season_year === previous.season_year && row.id > previous.id)) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].flatMap((row) => {
    // A newer season row wins within its league, including trades, releases and RFA rights.
    // Never resurrect an older contract after a newer record has replaced it.
    if (row.season_year === season) return [row];
    if (!row.fantasy_team_id || row.salary === null || (row.term_end_year ?? row.season_year) < season) return [];
    if (["RFA", "PROSPECT", "AP", "BUYOUT", "RETENTION"].includes((row.position || "").toUpperCase())) return [];
    return [{ ...row, season_year: season }];
  });
}
