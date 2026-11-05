type SeasonDates = { regularSeasonStartDate?: string; seasonEndDate?: string };
type OffseasonWindow = { endOfSeason: string; nextOpeningDay: string };
const windows = new Map<number, Promise<OffseasonWindow>>();

export function isInMlbOffseason(date: string, window: OffseasonWindow) {
  return date > window.endOfSeason && date < window.nextOpeningDay;
}

export function fetchMlbOffseasonWindow(completedSeason: number): Promise<OffseasonWindow> {
  const existing = windows.get(completedSeason);
  if (existing) return existing;
  const promise = Promise.all([completedSeason, completedSeason + 1].map(async (season) => {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/seasons/${season}?sportId=1`);
    if (!response.ok) throw new Error("Unable to load MLB season dates.");
    const data: { seasons?: SeasonDates[] } = await response.json();
    return data.seasons?.[0];
  })).then(([previous, next]) => {
    if (!previous?.seasonEndDate || !next?.regularSeasonStartDate) throw new Error("MLB season dates are unavailable.");
    return { endOfSeason: previous.seasonEndDate, nextOpeningDay: next.regularSeasonStartDate };
  });
  windows.set(completedSeason, promise);
  promise.catch(() => { windows.delete(completedSeason); });
  return promise;
}
