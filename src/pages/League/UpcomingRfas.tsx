import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { fetchMlbStats, type MlbStatRecord } from "../../lib/mlb";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 });

type RfaRow = {
  current: PlayerSeasonWithRelations;
  previous: PlayerSeasonWithRelations;
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

function PlayerTable({ title, subtitle, rows, pitcher }: { title: string; subtitle: string; rows: RfaRow[]; pitcher: boolean }) {
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">2026 contracts expired</p><h2 className="text-xl font-black text-gray-900 dark:text-white">{title}</h2><p className="mt-1 text-xs text-gray-500">{subtitle}</p></div>
    <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 dark:bg-gray-900"><tr><th className="px-4 py-3 text-left">Rights team</th><th className="px-4 py-3 text-left">Player</th><th className="px-3 py-3">Pos</th><th className="px-3 py-3">2026 Stats</th><th className="px-3 py-3">Score</th><th className="px-3 py-3">PPG</th><th className="px-4 py-3 text-right">Previous contract</th></tr></thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows.map((item) => { const team = item.current.fantasy_team || item.previous.fantasy_team; const apiId = item.current.player?.player_api_id; return <tr key={item.current.id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.025]"><td className="px-4 py-3"><div className="flex min-w-36 items-center gap-2">{team?.logo ? <img src={team.logo} alt="" className="h-9 w-9 object-contain" /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-[9px] font-black">{team?.abbreviation || "—"}</span>}<span className="text-xs font-bold text-gray-700 dark:text-gray-200">{team?.team_name || "Unassigned"}</span></div></td><td className="px-4 py-3">{apiId ? <Link to={`/baseball-player-profile?playerId=${apiId}&type=${pitcher ? "pitching" : "hitting"}`} className="font-black text-gray-900 hover:text-brand-600 dark:text-white">{name(item.current)}</Link> : <span className="font-black">{name(item.current)}</span>}</td><td className="px-3 py-3 text-center font-black">{item.previous.position || item.stats?.position || "—"}</td><td className="whitespace-nowrap px-3 py-3 text-center text-xs text-gray-600 dark:text-gray-300">{pitcher ? `${stat(item.stats, "wins")} W · ${stat(item.stats, "strikeOuts")} K · ${stat(item.stats, "saves")} SV · ${stat(item.stats, "era")} ERA` : `${stat(item.stats, "homeRuns")} HR · ${stat(item.stats, "rbi")} RBI · ${stat(item.stats, "stolenBases")} SB · ${stat(item.stats, "hits")} H`}</td><td className="px-3 py-3 text-center font-black text-brand-600 dark:text-brand-300">{number.format(item.score)}</td><td className="px-3 py-3 text-center font-bold">{number.format(item.games ? item.score / item.games : 0)}</td><td className="px-4 py-3 text-right"><p className="font-black">{money.format(item.previous.salary || 0)}</p><p className="text-[10px] text-gray-500">expired after 2026</p></td></tr>; })}{!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No {title.toLowerCase()} found.</td></tr>}</tbody>
    </table></div>
  </section>;
}

export default function UpcomingRfas() {
  const season = CURRENT_LEAGUE_SEASON;
  const previousYear = season - 1;
  const [currentRows, setCurrentRows] = useState<PlayerSeasonWithRelations[]>([]);
  const [previousRows, setPreviousRows] = useState<PlayerSeasonWithRelations[]>([]);
  const [hitters, setHitters] = useState<MlbStatRecord[]>([]);
  const [pitchers, setPitchers] = useState<MlbStatRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { let active = true; setLoading(true); Promise.all([fetchPlayerSeasonsBySeason(season), fetchPlayerSeasonsBySeason(previousYear), fetchMlbStats("hitting", previousYear), fetchMlbStats("pitching", previousYear)]).then(([current, previous, hitting, pitching]) => { if (!active) return; setCurrentRows(current); setPreviousRows(previous); setHitters(hitting); setPitchers(pitching); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load upcoming RFAs."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [previousYear, season]);

  const rows = useMemo(() => {
    const hittingById = new Map(hitters.filter((row) => row.playerId).map((row) => [String(row.playerId), row]));
    const pitchingById = new Map(pitchers.filter((row) => row.playerId).map((row) => [String(row.playerId), row]));
    const hittingByName = new Map(hitters.map((row) => [normalize(row.playerName), row]));
    const pitchingByName = new Map(pitchers.map((row) => [normalize(row.playerName), row]));
    return currentRows.filter((row) => (row.position || "").toUpperCase() === "RFA" && row.fantasy_team_id).flatMap((current) => {
      const previous = previousRows.find((row) => row.player_id === current.player_id && row.term_end_year === previousYear);
      if (!previous) return [];
      const playerId = current.player?.player_api_id || "";
      const playerName = normalize(name(current));
      const previousPosition = (previous.position || "").toUpperCase();
      const pitcherRecord = pitchingById.get(playerId) || pitchingByName.get(playerName) || null;
      const hitterRecord = hittingById.get(playerId) || hittingByName.get(playerName) || null;
      const isPitcher = ["SP", "RP", "P"].includes(previousPosition) || Boolean(pitcherRecord && !hitterRecord);
      const stats = isPitcher ? pitcherRecord : hitterRecord;
      const score = stats ? (isPitcher ? pitcherScore(stats) : batterScore(stats)) : 0;
      return [{ current, previous, stats, score, games: Number(stats?.stats.gamesPlayed ?? 0), pitcher: isPitcher }];
    }).sort((a, b) => b.score - a.score || name(a.current).localeCompare(name(b.current)));
  }, [currentRows, hitters, pitchers, previousRows, previousYear]);

  const batters = rows.filter((row) => !row.pitcher);
  const pitching = rows.filter((row) => row.pitcher);
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />;
  if (error) return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-error-700">{error}</div>;
  return <div className="space-y-6"><PageMeta title={`Upcoming RFAs | Season ${season}`} description={`Players entering restricted free agency for ${season}`} />
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-slate-950 to-brand-950 p-6 text-white shadow-xl sm:p-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">{season} Offseason</p><h1 className="mt-2 text-3xl font-black">Upcoming Restricted Free Agents</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">Players whose contracts expired after the {previousYear} season and whose RFA rights are currently held by a franchise.</p><div className="mt-5 flex gap-3"><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{batters.length} batters</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{pitching.length} pitchers</span></div></section>
    <PlayerTable title="RFA Batters" subtitle="Ranked by 2026 fantasy score." rows={batters} pitcher={false} />
    <PlayerTable title="RFA Pitchers" subtitle="Ranked by 2026 fantasy score." rows={pitching} pitcher />
  </div>;
}
