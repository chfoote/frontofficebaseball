// Gameplay activation is separate from access to a league’s core setup.
// Resolve the league from the URL and verify access in the database.
export const POOLSTERS_LEAGUE_ID = "00000000-0000-4000-8000-000000000001";
export const POOLSTERS = {
  id: POOLSTERS_LEAGUE_ID,
  slug: "poolsters",
  name: "Poolsters",
  current_season: 2027,
  first_recorded_season: 2026,
} as const;

export function requireSupportedLeague(leagueId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leagueId)) throw new Error("A valid league identity is required.");
  return leagueId;
}

export function leagueUrl(slug: string, path = "/front-office") {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid league URL name.");
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid league path.");
  if (path.includes("\\") || path.split(/[?#]/)[0].split("/").some(segment => [".",".."].includes(decodeURIComponent(segment)))) throw new Error("Invalid league path.");
  return `/leagues/${slug}${path === "/" ? "" : path}`;
}

export function leagueRouteScope(pathname: string) {
  if (!pathname.startsWith("/leagues/")) return { basename: "/", slug: null };
  const slug = pathname.split("/")[2];
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid league URL name.");
  return { basename: `/leagues/${slug}`, slug };
}

export function isCoreLeaguePath(path: string) {
  return path === "/" || path === "/front-office" || path === "/contracts" || path === "/teams" || /^\/teams\/[A-Za-z0-9_-]+$/.test(path);
}

export function leagueStorageKey(feature: string, leagueId: string, userId: string | null) {
  requireSupportedLeague(leagueId);
  return `front-office-baseball:${feature}:${leagueId}:${userId || "guest"}`;
}

// Only the legacy Poolsters scenario can be inherited from the old user-only key.
export function restoreLeagueScenario(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, leagueId: string, userId: string | null) {
  const key = leagueStorageKey("roster-lab", leagueId, userId);
  const current = storage.getItem(key);
  if (current !== null) return current;
  if (leagueId !== POOLSTERS_LEAGUE_ID) return null;
  const legacyKey = `front-office-baseball:roster-lab:${userId || "guest"}`;
  const legacy = storage.getItem(legacyKey);
  if (legacy !== null) {
    storage.setItem(key, legacy);
    storage.removeItem(legacyKey);
  }
  return legacy;
}

export function isPlatformPage(basename: string, pathname: string) {
  return basename === "/" && ["/", "/profile", "/admin/leagues", "/admin/users"].includes(pathname);
}
