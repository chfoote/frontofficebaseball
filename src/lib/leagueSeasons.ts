export const CURRENT_LEAGUE_SEASON = 2027;
export const FIRST_LEAGUE_SEASON = 2026;

export const playedAndCurrentSeasons = Array.from(
  { length: CURRENT_LEAGUE_SEASON - FIRST_LEAGUE_SEASON + 1 },
  (_, index) => CURRENT_LEAGUE_SEASON - index,
);

export const dashboardSeasons = [
  CURRENT_LEAGUE_SEASON + 1,
  ...playedAndCurrentSeasons,
];
