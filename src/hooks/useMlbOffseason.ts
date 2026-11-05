import { useEffect, useState } from "react";
import { fetchMlbOffseasonWindow, isInMlbOffseason } from "../lib/mlbOffseason";

export function useMlbOffseason(completedSeason: number) {
  const [offseason, setOffseason] = useState(false);
  useEffect(() => {
    let active = true;
    setOffseason(false);
    fetchMlbOffseasonWindow(completedSeason).then((window) => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (active) setOffseason(isInMlbOffseason(today, window));
    }).catch(() => { /* Omit the optional indicator when season dates cannot be verified. */ });
    return () => { active = false; };
  }, [completedSeason]);
  return offseason;
}
