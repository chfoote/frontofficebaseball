export const MLB_ELIGIBLE_POSITIONS = ["C", "1B", "2B", "SS", "3B", "OF", "DH", "SP", "RP"] as const;
export type MlbEligiblePosition = typeof MLB_ELIGIBLE_POSITIONS[number];

export type AppearanceSplit = {
  season: string;
  player?: { id: number };
  team?: { id: number };
  position?: { abbreviation: string };
  game?: { gamePk: number };
  stat: {
    position?: { abbreviation: string };
    gamesPlayed?: number;
    games?: number;
    gamesStarted?: number;
  };
};

const outfield = new Set(["LF", "CF", "RF", "OF"]);
const positionOf = (split: AppearanceSplit) => split.position?.abbreviation || split.stat.position?.abbreviation || "";
const gamesOf = (split: AppearanceSplit) => Number(split.stat.gamesPlayed ?? split.stat.games ?? 0);

// A total split replaces team splits for a traded player; team-only splits add up.
function positionTotals(splits: AppearanceSplit[]) {
  const grouped = new Map<string, AppearanceSplit[]>();
  for (const split of splits) {
    const position = positionOf(split);
    grouped.set(position, [...(grouped.get(position) || []), split]);
  }
  return new Map([...grouped].map(([position, rows]) => {
    const total = rows.find((row) => !row.team);
    const uniqueTeams = [...new Map(rows.map((row) => [row.team?.id, row])).values()];
    return [position, (total ? [total] : uniqueTeams).reduce((sum, row) => sum + gamesOf(row), 0)];
  }));
}

export function countOutfieldGames(gameLog: AppearanceSplit[]) {
  return new Set(gameLog.filter((split) => outfield.has(positionOf(split)) && gamesOf(split) > 0)
    .map((split) => split.game?.gamePk).filter((id): id is number => id !== undefined)).size;
}

export function needsOutfieldGameLog(splits: AppearanceSplit[]) {
  const games = [...positionTotals(splits)].filter(([position]) => outfield.has(position)).map(([, count]) => count);
  // Only borderline totals need game logs to avoid counting a position switch twice.
  return games.reduce((sum, count) => sum + count, 0) >= 5 && !games.some((count) => count >= 5);
}

export function determineMlbEligibility(
  season: number,
  fielding: AppearanceSplit[],
  pitching: AppearanceSplit[],
  outfieldGamesBySeason: Map<number, number> = new Map(),
): MlbEligiblePosition[] {
  const eligible = new Set<MlbEligiblePosition>();
  for (const year of [season, season - 1]) {
    const yearlyFielding = fielding.filter((split) => Number(split.season) === year);
    const totals = positionTotals(yearlyFielding);
    for (const position of MLB_ELIGIBLE_POSITIONS) {
      if (["OF", "SP", "RP"].includes(position)) continue;
      if ((totals.get(position) || 0) >= (position === "DH" ? 10 : 5)) eligible.add(position);
    }
    const ofCounts = [...totals].filter(([position]) => outfield.has(position)).map(([, count]) => count);
    if (ofCounts.some((count) => count >= 5) || (outfieldGamesBySeason.get(year) || 0) >= 5) eligible.add("OF");

    const yearlyPitching = pitching.filter((split) => Number(split.season) === year);
    const total = yearlyPitching.find((split) => !split.team);
    const teams = [...new Map(yearlyPitching.map((split) => [split.team?.id, split])).values()];
    const rows = total ? [total] : teams;
    const starts = rows.reduce((sum, split) => sum + Number(split.stat.gamesStarted || 0), 0);
    const games = rows.reduce((sum, split) => sum + gamesOf(split), 0);
    if (starts >= 5) eligible.add("SP");
    if (games - starts >= 5) eligible.add("RP");
  }
  return MLB_ELIGIBLE_POSITIONS.filter((position) => eligible.has(position));
}

type StatResponse = { stats?: { splits?: AppearanceSplit[]; totalSplits?: number }[] };
const API = "https://statsapi.mlb.com/api/v1";
const cache = new Map<number, { expires: number; promise: Promise<Map<number, MlbEligiblePosition[]>> }>();

async function fetchSplits(group: "fielding" | "pitching", season: number) {
  const splits: AppearanceSplit[] = [];
  const limit = 10000;
  for (let offset = 0; ; offset += limit) {
    const response = await fetch(`${API}/stats?stats=season&group=${group}&season=${season}&gameType=R&sportIds=1&playerPool=ALL&limit=${limit}&offset=${offset}`);
    if (!response.ok) throw new Error(`Unable to load ${season} MLB position appearances.`);
    const data: StatResponse = await response.json();
    const block = data.stats?.[0];
    const page = block?.splits || [];
    splits.push(...page);
    if (!page.length || splits.length >= (block?.totalSplits ?? page.length) || page.length < limit) break;
  }
  return splits;
}

export function fetchMlbEligibility(season: number): Promise<Map<number, MlbEligiblePosition[]>> {
  const existing = cache.get(season);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = (async () => {
    const years = [season, season - 1];
    const data = await Promise.all(years.map(async (year) => {
      const [fielding, pitching] = await Promise.all([fetchSplits("fielding", year), fetchSplits("pitching", year)]);
      return { year, fielding, pitching };
    }));
    const byPlayer = new Map<number, { fielding: AppearanceSplit[]; pitching: AppearanceSplit[]; ofGames: Map<number, number> }>();
    for (const { fielding, pitching } of data) {
      for (const [group, splits] of [["fielding", fielding], ["pitching", pitching]] as const) {
        for (const split of splits) {
          const id = split.player?.id;
          if (!id) continue;
          if (!byPlayer.has(id)) byPlayer.set(id, { fielding: [], pitching: [], ofGames: new Map() });
          byPlayer.get(id)![group].push(split);
        }
      }
    }
    const borderline = [...byPlayer].flatMap(([id, rows]) => years
      .filter((year) => needsOutfieldGameLog(rows.fielding.filter((split) => Number(split.season) === year)))
      .map((year) => ({ id, year, rows })));
    // Bound requests for the few players whose LF/CF/RF totals overlap near five games.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, borderline.length) }, async () => {
      while (next < borderline.length) {
        const { id, year, rows } = borderline[next++];
        const response = await fetch(`${API}/people/${id}/stats?stats=gameLog&group=fielding&season=${year}&gameType=R`);
        if (!response.ok) throw new Error(`Unable to verify ${year} outfield appearances.`);
        const log: StatResponse = await response.json();
        rows.ofGames.set(year, countOutfieldGames(log.stats?.flatMap((block) => block.splits || []) || []));
      }
    }));
    return new Map([...byPlayer].map(([id, rows]) => [id, determineMlbEligibility(season, rows.fielding, rows.pitching, rows.ofGames)]));
  })();
  cache.set(season, { expires: Date.now() + 5 * 60_000, promise });
  promise.catch(() => { if (cache.get(season)?.promise === promise) cache.delete(season); });
  return promise;
}
