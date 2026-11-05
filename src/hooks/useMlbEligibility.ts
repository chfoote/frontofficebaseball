import { useEffect, useState } from "react";
import { fetchMlbEligibility, type MlbEligiblePosition } from "../lib/mlbEligibility";

export function useMlbEligibility(season: number) {
  const [state, setState] = useState({ season, positions: new Map<number, MlbEligiblePosition[]>(), loading: true, error: "" });
  useEffect(() => {
    let active = true;
    setState({ season, positions: new Map(), loading: true, error: "" });
    fetchMlbEligibility(season).then((positions) => {
      if (active) setState({ season, positions, loading: false, error: "" });
    }).catch((reason) => {
      if (active) setState({ season, positions: new Map(), loading: false, error: reason instanceof Error ? reason.message : "Unable to load position eligibility." });
    });
    return () => { active = false; };
  }, [season]);
  return state.season === season ? state : { season, positions: new Map<number, MlbEligiblePosition[]>(), loading: true, error: "" };
}
