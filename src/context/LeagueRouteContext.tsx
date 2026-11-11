import { createContext, useContext } from "react";
export const LeagueRouteContext = createContext<{ basename: string; slug: string | null }>({ basename: "/", slug: null });
export function useLeagueRoute() { return useContext(LeagueRouteContext); }
