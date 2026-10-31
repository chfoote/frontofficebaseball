import { useEffect, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import PositionBadge from "../../components/hockey/PositionBadge";
import { fetchAwards, fetchPlayerAwards, type Award, type PlayerAward } from "../../lib/awards";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { fetchNhlGoalieStats, fetchNhlPlayerLanding, fetchNhlSkaterStats, formatFantasyPoints, getGoalieScore, getSkaterScore, type NhlGoalieRecord, type NhlSkaterRecord } from "../../lib/nhl";
import {
  applyTeamBranding,
  fetchAllTeamFinishes,
  fetchFantasyTeams,
  fetchTeamBrandingHistory,
  type FantasyTeam,
  type FantasyTeamBranding,
  type FantasyTeamFinish,
} from "../../lib/fantasyTeams";
import MonthlyHonours from "./MonthlyHonours";

const categories = ["MVP", "Rookie of the Year", "Top C", "Top LW", "Top RW", "Top D", "Top G"] as const;
type PlayerScore = { total: number; perGame: number | null };
const headshotCacheKey = "award-headshots-v1";
const headshotCacheAge = 24 * 60 * 60 * 1000;
type CachedHeadshot = { url: string; savedAt: number };

function readHeadshotCache(): Record<string, CachedHeadshot> {
  try {
    return JSON.parse(localStorage.getItem(headshotCacheKey) || "{}") as Record<string, CachedHeadshot>;
  } catch {
    return {};
  }
}

function nhlSeasonId(year: number) {
  return (year - 1) * 10000 + year;
}

function playerName(assignment: PlayerAward) {
  const player = assignment.player;
  return player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Unknown player";
}

function normalizedName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function AwardImage({ award, size = "h-12 w-12" }: { award?: Award | null; size?: string }) {
  return award?.image_url
    ? <img src={award.image_url} alt="" className={`${size} shrink-0 object-contain`} />
    : <span aria-hidden="true" className="text-3xl">🏆</span>;
}

export default function Awards() {
  const [view, setView] = useState<"season" | "monthly">("season");
  const [assignments, setAssignments] = useState<PlayerAward[]>([]);
  const [definitions, setDefinitions] = useState<Award[]>([]);
  const [finishes, setFinishes] = useState<FantasyTeamFinish[]>([]);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [branding, setBranding] = useState<FantasyTeamBranding[]>([]);
  const [playerSeasons, setPlayerSeasons] = useState<Map<string, PlayerSeasonWithRelations>>(new Map());
  const [headshots, setHeadshots] = useState<Map<string, string>>(new Map());
  const [scores, setScores] = useState<Map<string, PlayerScore>>(new Map());
  const [selectedSeason, setSelectedSeason] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [loadingRosters, setLoadingRosters] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchPlayerAwards(undefined, false),
      fetchAwards(true),
      fetchAllTeamFinishes(),
      fetchFantasyTeams(true),
      fetchTeamBrandingHistory(),
    ]).then(([awardRows, awardDefinitions, finishRows, teamRows, brandingRows]) => {
      if (!active) return;
      setAssignments(awardRows);
      setDefinitions(awardDefinitions);
      setFinishes(finishRows);
      setTeams(teamRows);
      setBranding(brandingRows);
      setLoading(false);
      const years = [...new Set(awardRows.map((row) => row.season_year))];
      const ids = [...new Set(awardRows.map((row) => row.player?.player_api_id).filter((id): id is string => Boolean(id)))];
      const cache = readHeadshotCache();
      const cachedUrls = ids.filter((id) => cache[id]?.url && Date.now() - cache[id].savedAt < headshotCacheAge).map((id) => [id, cache[id].url] as const);
      if (cachedUrls.length) setHeadshots(new Map(cachedUrls));
      for (const id of ids) {
        if (cache[id]?.url && Date.now() - cache[id].savedAt < headshotCacheAge) continue;
        void fetchNhlPlayerLanding(Number(id)).then((landing) => {
          if (!active || !landing.headshot) return;
          setHeadshots((current) => new Map(current).set(id, landing.headshot!));
          try {
            const latest = readHeadshotCache();
            latest[id] = { url: landing.headshot, savedAt: Date.now() };
            localStorage.setItem(headshotCacheKey, JSON.stringify(latest));
          } catch { /* Images still appear if browser storage is unavailable. */ }
        }).catch(() => {});
      }
      void Promise.all(years.map(async (year) => ({ year, rows: await fetchPlayerSeasonsBySeason(year).catch(() => [] as PlayerSeasonWithRelations[]) })))
        .then((results) => {
          if (active) {
            setPlayerSeasons(new Map(results.flatMap(({ year, rows }) => rows.map((row) => [`${year}:${row.player_id}`, row] as const))));
            setLoadingRosters(false);
          }
        });
      void Promise.all(years.map(async (year) => {
          const [skaters, goalies] = await Promise.all([
            fetchNhlSkaterStats(nhlSeasonId(year)).catch(() => [] as NhlSkaterRecord[]),
            fetchNhlGoalieStats(nhlSeasonId(year)).catch(() => [] as NhlGoalieRecord[]),
          ]);
          return { year, skaters, goalies };
        })).then((statResults) => {
      if (!active) return;
      const scoreRows: [string, PlayerScore][] = [];
      for (const { year, skaters, goalies } of statResults) {
        for (const record of skaters) {
          const total = getSkaterScore(record);
          scoreRows.push([`${year}:${record.playerId}`, { total, perGame: record.gamesPlayed ? total / record.gamesPlayed : null }]);
        }
        for (const record of goalies) {
          const total = getGoalieScore(record);
          scoreRows.push([`${year}:${record.playerId}`, { total, perGame: record.gamesPlayed ? total / record.gamesPlayed : null }]);
        }
      }
      setScores(new Map(scoreRows));
      });
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to load awards.");
    }).finally(() => { if (active) { setLoading(false); setLoadingRosters(false); } });
    return () => { active = false; };
  }, []);

  const seasonOptions = [...new Set([...finishes.map((finish) => finish.season_year), ...assignments.map((assignment) => assignment.season_year)])].sort((a, b) => b - a);
  const teamOptions = [...teams].sort((a, b) => a.id - b.id);
  const repeatWins = new Map<string, number>();
  for (const assignment of assignments) {
    const key = `${assignment.award_id}:${assignment.player_id}`;
    repeatWins.set(key, (repeatWins.get(key) || 0) + 1);
  }
  const matchesSeason = (year: number) => !selectedSeason || year === Number(selectedSeason);
  const matchesTeam = (teamId: number | null | undefined) => !selectedTeam || teamId === Number(selectedTeam);
  const champions = finishes.filter((finish) => finish.placement === 1 && matchesSeason(finish.season_year) && matchesTeam(finish.fantasy_team_id));
  const matchingAssignments = assignments.filter((assignment) => matchesSeason(assignment.season_year) && matchesTeam(playerSeasons.get(`${assignment.season_year}:${assignment.player_id}`)?.fantasy_team_id));
  const hasMatches = champions.length > 0 || matchingAssignments.some((assignment) => categories.some((category) => normalizedName(assignment.award?.name || "") === normalizedName(category)));
  const championshipAward = definitions.find((award) => normalizedName(award.name) === "championship");

  return <div>
    <PageMeta title="Awards & Honours | Front Office Baseball League" description="League champions and player award winners by season" />
    <PageBreadcrumb pageTitle="Awards & Honours" />
    <div className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-transparent sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">League history</p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">Awards & Champions</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Every recorded champion and individual award winner, season by season.</p>
    </div>

    <div className="mb-6 inline-flex rounded-xl border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900"><button type="button" onClick={() => setView("season")} className={`rounded-lg px-5 py-2.5 text-sm font-bold ${view === "season" ? "bg-amber-500 text-white" : "text-gray-600 dark:text-gray-300"}`}>Season Awards</button><button type="button" onClick={() => setView("monthly")} className={`rounded-lg px-5 py-2.5 text-sm font-bold ${view === "monthly" ? "bg-amber-500 text-white" : "text-gray-600 dark:text-gray-300"}`}>Monthly Honours</button></div>

    {view === "monthly" && <MonthlyHonours />}

    {view === "season" && loading && <p role="status" className="text-sm text-gray-500 dark:text-gray-400">Loading awards…</p>}
    {view === "season" && error && <p role="alert" className="rounded-lg bg-error-50 p-4 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p>}
    {view === "season" && !loading && !error && <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5">
        <label className="flex min-w-40 flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Season
          <select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
            <option value="">All seasons</option>{seasonOptions.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label className="flex min-w-52 flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Fantasy team
          <select value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)} disabled={loadingRosters} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-gray-800 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
            <option value="">All teams</option>{teamOptions.map((team) => <option key={team.id} value={team.id}>{team.team_name}</option>)}
          </select>
        </label>
        {(selectedSeason || selectedTeam) && <button type="button" onClick={() => { setSelectedSeason(""); setSelectedTeam(""); }} className="h-11 rounded-lg px-3 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10">Clear filters</button>}
        {loadingRosters && <span role="status" className="text-xs text-gray-500 dark:text-gray-400">Loading team history…</span>}
      </div>
      {!loadingRosters && !hasMatches && (selectedSeason || selectedTeam) && <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No award winners match these filters.</p>}
      {(!selectedTeam || champions.length > 0) && <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="flex items-center gap-3">
          <AwardImage award={championshipAward} />
          <div><h2 className="text-xl font-semibold text-gray-900 dark:text-white">Champions</h2><p className="text-sm text-gray-500 dark:text-gray-400">League title winners</p></div>
        </div>
        {champions.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {champions.map((finish) => {
            const original = teams.find((team) => team.id === finish.fantasy_team_id);
            const team = original ? applyTeamBranding(original, branding, finish.season_year) : null;
            return <article key={finish.id} className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
              {team?.logo ? <img src={team.logo} alt="" className="h-12 w-12 shrink-0 object-contain" /> : <AwardImage award={championshipAward} />}
              <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">{finish.season_year}</p>
                {team ? <Link to={`/teams/${team.id}`} className="font-semibold text-gray-900 hover:text-brand-500 dark:text-white">{team.team_name}</Link> : <p className="font-semibold text-gray-900 dark:text-white">Unknown team</p>}
              </div>
            </article>;
          })}
        </div> : <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">No champions have been recorded yet.</p>}
      </section>}

      <div className="grid gap-6 lg:grid-cols-2">
        {categories.map((category) => {
          const winners = matchingAssignments.filter((assignment) => normalizedName(assignment.award?.name || "") === normalizedName(category));
          const definition = definitions.find((award) => normalizedName(award.name) === normalizedName(category));
          if (selectedTeam && !winners.length) return null;
          return <section key={category} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
            <div className="flex items-center gap-3"><AwardImage award={definition} /><h2 className="text-xl font-semibold text-gray-900 dark:text-white">{category}</h2></div>
            {winners.length ? <ol className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">
              {winners.map((assignment) => {
                const season = playerSeasons.get(`${assignment.season_year}:${assignment.player_id}`);
                const team = season?.fantasy_team ? applyTeamBranding(season.fantasy_team, branding, assignment.season_year) : null;
                const apiId = assignment.player?.player_api_id;
                const headshot = apiId ? headshots.get(apiId) : null;
                const score = apiId ? scores.get(`${assignment.season_year}:${apiId}`) : null;
                const wins = repeatWins.get(`${assignment.award_id}:${assignment.player_id}`) || 0;
                return <li key={assignment.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0 sm:flex-nowrap">
                  <span className="w-12 shrink-0 text-sm font-bold text-amber-700 dark:text-amber-300">{assignment.season_year}</span>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    {headshot ? <img src={headshot} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true" className="text-xl text-gray-400">●</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {apiId ? <Link to={`/player-profile?playerId=${apiId}`} className="font-semibold text-gray-800 hover:text-brand-500 dark:text-white/90">{playerName(assignment)}</Link> : <span className="font-semibold text-gray-800 dark:text-white/90">{playerName(assignment)}</span>}
                      {season?.position && <PositionBadge position={season.position} />}
                      {wins > 1 && <span title={`${wins} ${category} wins across all seasons`} className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">{wins}× winner</span>}
                    </div>
                    {team && <Link to={`/teams/${team.id}`} className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-500 dark:text-gray-400">
                      {team.logo && <img src={team.logo} alt="" className="h-5 w-5 object-contain" loading="lazy" />}{team.team_name}
                    </Link>}
                  </div>
                  {score && <div className="ml-auto flex shrink-0 gap-3 text-right sm:ml-0">
                    <div><p className="text-sm font-bold text-gray-900 dark:text-white">{formatFantasyPoints(score.total)}</p><p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Score</p></div>
                    <div><p className="text-sm font-bold text-gray-900 dark:text-white">{score.perGame === null ? "—" : formatFantasyPoints(score.perGame)}</p><p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Per game</p></div>
                  </div>}
                </li>;
              })}
            </ol> : <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">{selectedSeason ? "No winner has been recorded for this season." : "No winner has been recorded yet."}</p>}
          </section>;
        })}
      </div>
    </div>}
  </div>;
}
