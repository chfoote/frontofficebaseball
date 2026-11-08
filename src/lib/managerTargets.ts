export function validTargetEstimate(salary: number, term: number) {
  return Number.isSafeInteger(salary) && salary >= 250000 && salary <= 2147483647
    && Number.isInteger(term) && term >= 1 && term <= 5;
}

type RosterEntry = {
  season_year: number;
  fantasy_team_id: number | null;
  player: { player_api_id: string } | null;
};

// Use MLB identity: lab-generated contracts can have different database player IDs.
export function availableLabFreeAgents<T extends RosterEntry>(candidates: T[], rows: RosterEntry[], year: number) {
  const ownedIds = new Set(rows.filter((row) => row.season_year === year && row.fantasy_team_id != null)
    .map((row) => row.player?.player_api_id).filter(Boolean));
  return candidates.filter((row) => row.player?.player_api_id && !ownedIds.has(row.player.player_api_id));
}
