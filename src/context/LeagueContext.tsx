import { Fragment } from "react";
import { useLeagueRoute } from "./LeagueRouteContext";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { fetchLeague, fetchLeagueBySlug, fetchLeagueMembership, type League, type LeagueMembership } from "../lib/leagues";

const LeagueContext = createContext<{ league: League; membership: LeagueMembership | null } | null>(null);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const { slug } = useLeagueRoute();
  const [state, setState] = useState<{ league: League; membership: LeagueMembership | null; userId?: string; slug: string | null } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setState(null); setError("");
    (async () => {
      const league = await (slug ? fetchLeagueBySlug(slug) : fetchLeague());
      const membership = userId ? await fetchLeagueMembership(userId,league.id) : null;
      if (active) setState({league,membership,userId,slug});
    })().catch(() => { if (active) setError("This league could not be opened. Check the link and your membership, then try again."); });
    return () => { active = false; };
  }, [userId, authLoading, slug, attempt]);
  if (error) return <div role="alert" className="mx-auto max-w-lg p-8 text-center text-gray-600 dark:text-gray-300"><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }} className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Retry</button><p className="mt-4 text-sm"><a href="/" className="text-brand-500 underline">My Leagues</a>{!user && <> · <a href="/signin" className="text-brand-500 underline">Sign in</a></>}</p></div>;
  if (authLoading || !state || state.userId !== userId || state.slug !== slug) return <p role="status" className="p-8 text-center text-sm text-gray-500">Loading league…</p>;
  return <LeagueContext.Provider value={state}><Fragment key={`${state.league.id}:${userId || "guest"}`}>{children}</Fragment></LeagueContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLeague() {
  const context = useContext(LeagueContext);
  if (!context) throw new Error("useLeague requires a LeagueProvider");
  return context;
}
