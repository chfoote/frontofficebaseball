import { POOLSTERS } from "./leagueIdentity";

// Transitional exports for features awaiting per-league settings conversion.
export const CURRENT_LEAGUE_SEASON: number = POOLSTERS.current_season;
export const FIRST_LEAGUE_SEASON: number = POOLSTERS.first_recorded_season;

export const playedAndCurrentSeasons = Array.from(
  { length: CURRENT_LEAGUE_SEASON - FIRST_LEAGUE_SEASON + 1 },
  (_, index) => CURRENT_LEAGUE_SEASON - index,
);

export const dashboardSeasons = [
  CURRENT_LEAGUE_SEASON + 1,
  ...playedAndCurrentSeasons,
];
