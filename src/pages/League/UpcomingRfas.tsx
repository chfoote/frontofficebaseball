import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { fetchMlbStats, type MlbStatRecord } from "../../lib/mlb";
import { useAuth } from "../../context/AuthContext";
import { fetchLatestUserTeamAssignment, fetchUserTeamAssignment } from "../../lib/teamUserAssignments";
import { fetchAllMlbProspectOwners, findMlbProspectOwner, type MlbProspectOwner } from "../../lib/mlbFarmSystems";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 });

type RfaRow = {
  current: PlayerSeasonWithRelations | null;
  previous: PlayerSeasonWithRelations | null;
  playerId?: number;
  playerName: string;
  stats: MlbStatRecord | null;
  score: number;
  games: number;
  pitcher: boolean;
};

function name(row: PlayerSeasonWithRelations) { return row.player?.full_name || [row.player?.first_name, row.player?.last_name].filter(Boolean).join(" ") || "Unknown player"; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function batterScore(record: MlbStatRecord) { return Number(record.stats.runs ?? 0) + Number(record.stats.hits ?? 0) + Number(record.stats.doubles ?? 0) + Number(record.stats.triples ?? 0) * 2 + Number(record.stats.homeRuns ?? 0) * 3 + Number(record.stats.rbi ?? 0) + Number(record.stats.stolenBases ?? 0) * 2; }
function pitcherScore(record: MlbStatRecord) { return Number(record.stats.wins ?? 0) * 8 + Number(record.stats.strikeOuts ?? 0) + Number(record.stats.saves ?? 0) * 6 + Number(record.stats.completeGames ?? 0) * 5 + Number(record.stats.shutouts ?? 0) * 5; }
function stat(record: MlbStatRecord | null, key: string) { return record?.stats[key] ?? 0; }
function pitcherRole(record: MlbStatRecord | null) { const games = Number(record?.stats.gamesPlayed ?? 0); const starts = Number(record?.stats.gamesStarted ?? 0); if (starts >= 5) return "SP"; if (games - starts >= 5) return "RP"; return "P"; }
function batterPosition(value: string) { const code = value.toUpperCase(); return ["LF", "CF", "RF"].includes(code) ? "OF" : code; }
function displayPosition(item: RfaRow) { return item.pitcher ? pitcherRole(item.stats) : batterPosition(item.previous?.position || item.stats?.position || "—"); }

function PlayerList({ title, subtitle, rows, pitcher, needs, contractYear, expired }: { title: string; subtitle: string; rows: RfaRow[]; pitcher: boolean; needs: Set<string>; contractYear: number; expired: boolean }) {
  const [positionFilter, setPositionFilter] = useState("ALL");
  const options = pitcher ? ["SP", "RP"] : ["C", "1B", "2B", "SS", "3B", "OF", "DH"];
  const filteredRows = positionFilter === "ALL" ? rows : rows.filter((item) => displayPosition(item) === positionFilter);
  const unownedPool = rows.length > 0 && rows.every((item) => !item.current && !item.previous);
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">{unownedPool ? "Unowned · no prospect rights" : `${contractYear} contracts ${expired ? "expired" : "expiring"}`}</p><h2 className="text-xl font-black text-gray-900 dark:text-white">{title}</h2><p className="mt-1 text-xs text-gray-500">{subtitle}</p></div><select aria-label={`Filter ${title} by position`} value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-xs font-bold dark:border-gray-700 dark:bg-gray-900"><option value="ALL">All</option>{options.map((position) => <option key={position} value={position}>{position}</option>)}</select></div></div>
    <div className="space-y-2 p-3 sm:p-4">{filteredRows.map((item) => { const team = item.current?.fantasy_team || item.previous?.fantasy_team; const apiId = item.playerId; const ppg = item.games ? item.score / item.games : 0; const playerPosition = displayPosition(item); const goodFit = needs.has(playerPosition); return <article key={`${pitcher ? "p" : "b"}-${apiId || item.playerName}`} className={`rounded-xl border p-3 transition hover:shadow-sm dark:bg-gray-950/40 ${goodFit ? "border-emerald-300 bg-emerald-50/60 hover:border-emerald-400 dark:border-emerald-500/40 dark:bg-emerald-500/[0.07]" : "border-gray-200 hover:border-violet-300 dark:border-gray-800"}`}>
      <div className="flex items-start gap-3">{team?.logo ? <img src={team.logo} alt="" className="h-11 w-11 shrink-0 object-contain" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[9px] font-black dark:bg-gray-800">FA</span>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0">{apiId ? <Link to={`/baseball-player-profile?playerId=${apiId}&type=${pitcher ? "pitching" : "hitting"}`} className="block truncate font-black text-gray-900 hover:text-brand-600 dark:text-white">{item.playerName}</Link> : <p className="truncate font-black">{item.playerName}</p>}<p className="truncate text-[10px] font-bold text-gray-500">{team?.team_name || item.stats?.teamAbbreviation || "Free Agent"} · {playerPosition}</p>{goodFit && <span className="mt-1 inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">Good fit · team need</span>}</div><div className="shrink-0 text-right"><p className="font-black text-brand-600 dark:text-brand-300">{number.format(item.score)}</p><p className="text-[9px] font-bold uppercase text-gray-400">{number.format(ppg)} PPG</p></div></div>
        <p className="mt-2 text-xs font-semibold text-gray-600 dark:text-gray-300">{pitcher ? `${stat(item.stats, "wins")} W · ${stat(item.stats, "strikeOuts")} K · ${stat(item.stats, "saves")} SV · ${stat(item.stats, "era")} ERA` : `${stat(item.stats, "homeRuns")} HR · ${stat(item.stats, "rbi")} RBI · ${stat(item.stats, "stolenBases")} SB · ${stat(item.stats, "hits")} H`}</p>
        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-[10px] dark:border-gray-800"><span className="font-bold text-gray-400">{item.previous?.salary == null ? "Contract" : expired ? "Previous contract" : "Current contract"}</span><span className="font-black text-gray-700 dark:text-gray-200">{item.previous?.salary == null ? "No salary · unowned" : `${money.format(item.previous.salary)} · ${expired ? "expired" : "expires"} ${contractYear}`}</span></div></div></div>
    </article>; })}{!filteredRows.length && <p className="px-4 py-10 text-center text-sm text-gray-500">No {positionFilter === "ALL" ? title.toLowerCase() : positionFilter} found.</p>}</div>
  </section>;
}

export function FreeAgentTracker({ kind }: { kind: "RFA" | "UFA" }) {
  const { user } = useAuth();
  const season = CURRENT_LEAGUE_SEASON;
  const previousYear = season - 1;
  const [currentRows, setCurrentRows] = useState<PlayerSeasonWithRelations[]>([]);
  const [previousRows, setPreviousRows] = useState<PlayerSeasonWithRelations[]>([]);
  const [hitters, setHitters] = useState<MlbStatRecord[]>([]);
  const [pitchers, setPitchers] = useState<MlbStatRecord[]>([]);
  const [prospectOwners, setProspectOwners] = useState<Map<string, MlbProspectOwner>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerTeamId, setViewerTeamId] = useState<number | null>(null);

  useEffect(() => { let active = true; setLoading(true); Promise.all([fetchPlayerSeasonsBySeason(season), fetchPlayerSeasonsBySeason(previousYear), fetchMlbStats("hitting", previousYear), fetchMlbStats("pitching", previousYear), fetchAllMlbProspectOwners(season), user ? fetchUserTeamAssignment(user.id, season).then((assignment) => assignment || fetchLatestUserTeamAssignment(user.id)).catch(() => null) : Promise.resolve(null)]).then(([current, previous, hitting, pitching, owners, assignment]) => { if (!active) return; setCurrentRows(current); setPreviousRows(previous); setHitters(hitting); setPitchers(pitching); setProspectOwners(owners); setViewerTeamId(assignment?.fantasy_team_id ?? null); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : `Unable to load upcoming ${kind}s.`); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [kind, previousYear, season, user]);

  const rows = useMemo(() => {
    const hittingById = new Map(hitters.filter((row) => row.playerId).map((row) => [String(row.playerId), row]));
    const pitchingById = new Map(pitchers.filter((row) => row.playerId).map((row) => [String(row.playerId), row]));
    const hittingByName = new Map(hitters.map((row) => [normalize(row.playerName), row]));
    const pitchingByName = new Map(pitchers.map((row) => [normalize(row.playerName), row]));
    if (kind === "UFA") {
      const isOwned = (record: MlbStatRecord) => currentRows.some((row) => row.fantasy_team_id && ((record.playerId && row.player?.player_api_id === String(record.playerId)) || normalize(name(row)) === normalize(record.playerName)));
      const freeAgent = (record: MlbStatRecord) => !isOwned(record) && !findMlbProspectOwner(record, prospectOwners);
      const batterRows: RfaRow[] = hitters.filter(freeAgent).map((stats) => ({ current: null, previous: null, playerId: stats.playerId, playerName: stats.playerName, stats, score: batterScore(stats), games: Number(stats.stats.gamesPlayed ?? 0), pitcher: false }));
      const pitcherRows: RfaRow[] = pitchers.filter(freeAgent).map((stats) => ({ current: null, previous: null, playerId: stats.playerId, playerName: stats.playerName, stats, score: pitcherScore(stats), games: Number(stats.stats.gamesPlayed ?? 0), pitcher: true }));
      return [...batterRows, ...pitcherRows].sort((a, b) => b.score - a.score || a.playerName.localeCompare(b.playerName));
    }
    const candidates = previousRows.filter((previous) => previous.term_end_year === previousYear && previous.fantasy_team_id).flatMap((previous) => { const current = currentRows.find((row) => row.player_id === previous.player_id); return current?.fantasy_team_id && (current.position || "").toUpperCase() === "RFA" ? [{ current, previous }] : []; });
    return candidates.flatMap(({ current, previous }) => {
      const displayCurrent = current;
      const playerId = displayCurrent.player?.player_api_id || "";
      const playerName = normalize(name(displayCurrent));
      const previousPosition = (previous.position || "").toUpperCase();
      const pitcherRecord = pitchingById.get(playerId) || pitchingByName.get(playerName) || null;
      const hitterRecord = hittingById.get(playerId) || hittingByName.get(playerName) || null;
      const isPitcher = ["SP", "RP", "P"].includes(previousPosition) || Boolean(pitcherRecord && !hitterRecord);
      const stats = isPitcher ? pitcherRecord : hitterRecord;
      const score = stats ? (isPitcher ? pitcherScore(stats) : batterScore(stats)) : 0;
      return [{ current: displayCurrent, previous, playerId: displayCurrent.player?.player_api_id ? Number(displayCurrent.player.player_api_id) : undefined, playerName: name(displayCurrent), stats, score, games: Number(stats?.stats.gamesPlayed ?? 0), pitcher: isPitcher }];
    }).sort((a, b) => b.score - a.score || a.playerName.localeCompare(b.playerName));
  }, [currentRows, hitters, kind, pitchers, previousRows, previousYear, prospectOwners]);

  const needs = useMemo(() => {
    if (!viewerTeamId) return new Set<string>();
    const minimums: Record<string, number> = { C: 1, "1B": 1, "2B": 1, SS: 1, "3B": 1, OF: 3, DH: 1, SP: 5, RP: 1 };
    const counts: Record<string, number> = {};
    currentRows.filter((row) => row.fantasy_team_id === viewerTeamId).forEach((row) => { const position = (row.position || "").toUpperCase(); if (position in minimums) counts[position] = (counts[position] || 0) + 1; });
    return new Set(Object.entries(minimums).filter(([position, minimum]) => (counts[position] || 0) < minimum).map(([position]) => position));
  }, [currentRows, viewerTeamId]);

  const batters = rows.filter((row) => !row.pitcher);
  const pitching = rows.filter((row) => row.pitcher);
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />;
  if (error) return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-error-700">{error}</div>;
  const fullName = kind === "RFA" ? "Restricted Free Agents" : "Unrestricted Free Agents";
  return <div className="space-y-6"><PageMeta title={`Upcoming ${kind}s | Season ${season}`} description={`Players entering ${fullName.toLowerCase()} for ${season}`} />
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-slate-950 to-brand-950 p-6 text-white shadow-xl sm:p-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">{season} Offseason</p><h1 className="mt-2 text-3xl font-black">Upcoming {fullName}</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">{kind === "RFA" ? `Players whose contracts expired after the ${previousYear} season and whose RFA rights are currently held by a franchise.` : "The current free-agent pool: players who are not on a fantasy roster and do not have active farm-system or acquired-prospect rights."}</p><div className="mt-5 flex flex-wrap gap-3"><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{batters.length} batters</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{pitching.length} pitchers</span>{needs.size > 0 && <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-200">Your needs: {[...needs].join(", ")}</span>}</div></section>
    <div className="grid items-start gap-6 xl:grid-cols-2"><PlayerList title={`${kind} Batters`} subtitle={`Ranked by ${previousYear} fantasy score.`} rows={batters} pitcher={false} needs={needs} contractYear={kind === "RFA" ? previousYear : season} expired={kind === "RFA"} /><PlayerList title={`${kind} Pitchers`} subtitle={`Ranked by ${previousYear} fantasy score.`} rows={pitching} pitcher needs={needs} contractYear={kind === "RFA" ? previousYear : season} expired={kind === "RFA"} /></div>
  </div>;
}

export default function UpcomingRfas() { return <FreeAgentTracker kind="RFA" />; }
