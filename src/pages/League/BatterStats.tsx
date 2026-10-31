import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchMlbStats, formatStatValue, type MlbStatRecord } from "../../lib/mlb";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { daysUntilProspectAgeOut, fetchAllMlbProspectOwners, findMlbProspectOwner, type MlbProspectOwner } from "../../lib/mlbFarmSystems";
import {
  fetchPlayerSeasonsBySeason,
  type PlayerSeasonWithRelations,
} from "../../lib/fantasyPlayers";

const SEASON_YEAR = 2026;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function getBatterScore(record: MlbStatRecord) {
  return (
    Number(record.stats.runs ?? 0) * 1 +
    Number(record.stats.hits ?? 0) * 1 +
    Number(record.stats.doubles ?? 0) * 1 +
    Number(record.stats.triples ?? 0) * 2 +
    Number(record.stats.homeRuns ?? 0) * 3 +
    Number(record.stats.rbi ?? 0) * 1 +
    Number(record.stats.stolenBases ?? 0) * 2
  );
}

function getBatterPpg(record: MlbStatRecord) {
  const gamesPlayed = Number(record.stats.gamesPlayed ?? 0);
  const score = getBatterScore(record);

  if (!gamesPlayed) {
    return null;
  }

  return score / gamesPlayed;
}

function formatSalary(salary: number | null | undefined) {
  return salary === null || salary === undefined
    ? "No salary"
    : currencyFormatter.format(salary);
}

function batterPosition(record: MlbStatRecord) {
  const value = (record.position || "").toUpperCase();
  return ["LF", "CF", "RF", "OF"].includes(value) ? "OF" : value;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

type BatterSortKey = "player" | "position" | "age" | "gamesPlayed" | "atBats" | "runs" | "hits" | "doubles" | "triples" | "homeRuns" | "rbi" | "baseOnBalls" | "strikeOuts" | "stolenBases" | "caughtStealing" | "score" | "ppg";

function batterSortValue(record: MlbStatRecord, key: BatterSortKey) {
  if (key === "player") return record.playerName.toLowerCase();
  if (key === "position") return batterPosition(record);
  if (key === "score") return getBatterScore(record);
  if (key === "ppg") return getBatterPpg(record) ?? -1;
  return Number(record.stats[key] ?? 0);
}

function SortHeader({ label, sortKey, activeKey, direction, onSort }: { label: string; sortKey: BatterSortKey; activeKey: BatterSortKey; direction: "asc" | "desc"; onSort: (key: BatterSortKey) => void }) {
  return <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-200"><button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-brand-500">{label}<span className="text-[10px] text-gray-400">{activeKey === sortKey ? direction === "desc" ? "▼" : "▲" : "↕"}</span></button></th>;
}

function PlayerCell({
  record,
  fantasySeason,
  prospectOwner,
  promotionLabel,
}: {
  record: MlbStatRecord;
  fantasySeason?: PlayerSeasonWithRelations;
  prospectOwner?: MlbProspectOwner;
  promotionLabel?: string;
}) {
  const fantasyTeam = fantasySeason?.fantasy_team || prospectOwner?.team;
  const isProspect = ["AP", "PROSPECT"].includes((fantasySeason?.position || "").toUpperCase()) || Boolean(!fantasySeason?.fantasy_team_id && prospectOwner);
  const ageOutDays = isProspect ? daysUntilProspectAgeOut(prospectOwner?.birthDate) : null;
  const name = record.playerId ? (
    <Link
      to={`/baseball-player-profile?playerId=${record.playerId}&type=hitting`}
      className="font-medium text-brand-500 transition hover:text-brand-600 hover:underline"
    >
      {record.playerName}
    </Link>
  ) : (
    <span className="font-medium text-gray-800 dark:text-white/90">
      {record.playerName}
    </span>
  );

  return (
    <div className="flex min-w-44 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-800 dark:bg-gray-900">
        {fantasyTeam?.logo ? (
          <img
            src={fantasyTeam.logo}
            alt={`${fantasyTeam.team_name} logo`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-[10px] font-semibold text-gray-500">
            {fantasyTeam?.abbreviation || "FA"}
          </span>
        )}
      </div>
      <div className="text-left">
        <div className="flex flex-wrap items-center gap-1.5">{name}{promotionLabel && <span title={promotionLabel} aria-label={promotionLabel} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-50 text-[10px] font-black text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">▲</span>}{ageOutDays !== null && ageOutDays <= 90 && <span title={`Prospect rights expire in ${ageOutDays} day${ageOutDays === 1 ? "" : "s"} when the player turns 27.`} className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ring-1 ${ageOutDays <= 30 ? "bg-red-50 text-red-600 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30" : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"}`}>Ages out &lt;{ageOutDays <= 30 ? "30" : "90"}d</span>}</div>
        <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
          {isProspect && fantasyTeam ? `${fantasyTeam.abbreviation} Prospect` : [record.teamAbbreviation, formatSalary(fantasySeason?.salary), fantasySeason?.term_end_year]
            .filter(Boolean)
            .join(" | ")}
        </p>
      </div>
    </div>
  );
}

export default function BatterStats() {
  const [records, setRecords] = useState<MlbStatRecord[]>([]);
  const [fantasySeasons, setFantasySeasons] = useState<
    Map<string, PlayerSeasonWithRelations>
  >(new Map());
  const [benchmarkSeasons, setBenchmarkSeasons] = useState<Map<string, PlayerSeasonWithRelations>>(new Map());
  const [prospectOwners, setProspectOwners] = useState<Map<string, MlbProspectOwner>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [minimumAge, setMinimumAge] = useState("");
  const [maximumAge, setMaximumAge] = useState("");
  const [sortKey, setSortKey] = useState<BatterSortKey>("score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const [data, seasonRows, benchmarkRows, prospectRows] = await Promise.all([
          fetchMlbStats("hitting", SEASON_YEAR),
          fetchPlayerSeasonsBySeason(CURRENT_LEAGUE_SEASON),
          fetchPlayerSeasonsBySeason(SEASON_YEAR),
          fetchAllMlbProspectOwners(CURRENT_LEAGUE_SEASON),
        ]);
        if (active) {
          setRecords(data);
          setFantasySeasons(
            new Map(
              seasonRows
                .filter((season) => season.player?.player_api_id)
                .map((season) => [season.player!.player_api_id, season]),
            ),
          );
          setBenchmarkSeasons(new Map(benchmarkRows.filter((season) => season.player?.player_api_id).map((season) => [season.player!.player_api_id, season])));
          setProspectOwners(prospectRows);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load batter stats");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const fantasyTeams = useMemo(() => {
    const teams = new Map<string, string>();
    fantasySeasons.forEach((season) => {
      if (season.fantasy_team_id && season.fantasy_team) {
        teams.set(String(season.fantasy_team_id), season.fantasy_team.team_name);
      }
    });
    prospectOwners.forEach((owner) => teams.set(String(owner.team.id), owner.team.team_name));
    return [...teams].sort((a, b) => a[1].localeCompare(b[1]));
  }, [fantasySeasons, prospectOwners]);

  const positions = useMemo(() => [...new Set(records.map(batterPosition).filter(Boolean))].sort(), [records]);
  const ageBounds = useMemo(() => { const ages = records.map((record) => Number(record.stats.age)).filter((age) => Number.isFinite(age) && age > 0); return { youngest: ages.length ? Math.min(...ages) : 0, oldest: ages.length ? Math.max(...ages) : 0 }; }, [records]);
  const promotionBenchmarks = useMemo(() => {
    const scoresByPositionTeam = new Map<string, Map<number, number[]>>([["C", new Map()], ["1B", new Map()], ["2B", new Map()], ["SS", new Map()], ["3B", new Map()]]);
    const outfieldByTeam = new Map<number, number[]>();
    records.forEach((record) => {
      if (!record.playerId) return;
      const season = benchmarkSeasons.get(String(record.playerId));
      if (!season?.fantasy_team_id || ["AP", "PROSPECT", "RFA"].includes((season.position || "").toUpperCase())) return;
      const position = (season.position || batterPosition(record)).toUpperCase();
      const score = getBatterScore(record);
      if (scoresByPositionTeam.has(position)) {
        const byTeam = scoresByPositionTeam.get(position)!;
        byTeam.set(season.fantasy_team_id, [...(byTeam.get(season.fantasy_team_id) || []), score]);
      }
      if (position === "OF") outfieldByTeam.set(season.fantasy_team_id, [...(outfieldByTeam.get(season.fantasy_team_id) || []), score]);
    });
    const result = new Map<string, number>();
    scoresByPositionTeam.forEach((byTeam, position) => { const value = median([...byTeam.values()].map((values) => Math.max(...values))); if (value !== null) result.set(position, Math.ceil(value)); });
    const of3 = median([...outfieldByTeam.values()].filter((values) => values.length >= 3).map((values) => [...values].sort((a, b) => b - a)[2]));
    if (of3 !== null) result.set("OF", Math.ceil(of3));
    return result;
  }, [records, benchmarkSeasons]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    const season = record.playerId ? fantasySeasons.get(String(record.playerId)) : undefined;
    const prospect = findMlbProspectOwner(record, prospectOwners);
    const ownerId = season?.fantasy_team_id || prospect?.team.id;
    const activeRoster = Boolean(season?.fantasy_team_id && !["AP", "PROSPECT"].includes((season.position || "").toUpperCase()));
    const prospectOnly = Boolean(prospect && !activeRoster);
    if (teamFilter !== "all" && String(ownerId || "") !== teamFilter) return false;
    if (positionFilter !== "all" && batterPosition(record) !== positionFilter) return false;
    const age = Number(record.stats.age);
    if (minimumAge !== "" && (!Number.isFinite(age) || age < Number(minimumAge))) return false;
    if (maximumAge !== "" && (!Number.isFinite(age) || age > Number(maximumAge))) return false;
    if (ownershipFilter === "owned" && !ownerId) return false;
    if (ownershipFilter === "unowned" && ownerId) return false;
    if (ownershipFilter === "prospect" && !prospectOnly) return false;
    return true;
  }).sort((a, b) => {
    const aValue = batterSortValue(a, sortKey);
    const bValue = batterSortValue(b, sortKey);
    const comparison = typeof aValue === "string" ? aValue.localeCompare(String(bValue)) : aValue - Number(bValue);
    return sortDirection === "asc" ? comparison : -comparison;
  }), [records, fantasySeasons, prospectOwners, teamFilter, positionFilter, ownershipFilter, minimumAge, maximumAge, sortKey, sortDirection]);

  function handleSort(key: BatterSortKey) {
    if (key === sortKey) setSortDirection((current) => current === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDirection("desc"); }
  }

  return (
    <div>
      <PageMeta title="Batter Stats | Front Office Baseball League" description="MLB batter statistics and Front Office Baseball ownership" />
      <PageBreadcrumb pageTitle="Batter Stats" />
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="mb-6">
          <h3 className="mb-2 font-semibold text-gray-800 text-theme-xl dark:text-white/90 sm:text-2xl">
            Batter Stats
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 sm:text-base">
            Live MLB hitting data from the official stats API.
          </p>
          <p className="mt-2 text-xs text-gray-400"><span className="mr-1 text-amber-500">▲</span>Prospect score meets the active-roster promotion benchmark for that position.</p>
        </div>

        {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading batter stats…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && <div className="mb-5 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold uppercase text-gray-500">Fantasy Team<select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium normal-case text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="all">All teams</option>{fantasyTeams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase text-gray-500">Position<select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium normal-case text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="all">All positions</option>{positions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase text-gray-500">Ownership<select value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium normal-case text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="all">All players</option><option value="owned">Owned</option><option value="prospect">Prospects only</option><option value="unowned">Unowned</option></select></label>
          <fieldset><legend className="text-xs font-semibold uppercase text-gray-500">Age Range</legend><div className="mt-1.5 grid grid-cols-2 gap-2"><input type="number" min={ageBounds.youngest || undefined} max={maximumAge || ageBounds.oldest || undefined} value={minimumAge} onChange={(event) => setMinimumAge(event.target.value)} placeholder={ageBounds.youngest ? `Min ${ageBounds.youngest}` : "Min"} aria-label="Minimum batter age" className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /><input type="number" min={minimumAge || ageBounds.youngest || undefined} max={ageBounds.oldest || undefined} value={maximumAge} onChange={(event) => setMaximumAge(event.target.value)} placeholder={ageBounds.oldest ? `Max ${ageBounds.oldest}` : "Max"} aria-label="Maximum batter age" className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></div></fieldset>
        </div>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.03]">
                <tr>
                  <SortHeader label="PLAYER" sortKey="player" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="POSITION" sortKey="position" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="AGE" sortKey="age" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  {([['G','gamesPlayed'],['AB','atBats'],['R','runs'],['H','hits'],['2B','doubles'],['3B','triples'],['HR','homeRuns'],['RBI','rbi'],['BB','baseOnBalls'],['SO','strikeOuts'],['SB','stolenBases'],['CS','caughtStealing'],['SCORE','score'],['PPG','ppg']] as [string, BatterSortKey][]).map(([label, key]) => <SortHeader key={key} label={label} sortKey={key} activeKey={sortKey} direction={sortDirection} onSort={handleSort} />)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredRecords.map((record) => (
                  <tr key={`${record.playerName}-${record.teamName}`} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                    <td className="px-3 py-3">
                      <PlayerCell
                        record={record}
                        fantasySeason={
                          record.playerId
                            ? fantasySeasons.get(String(record.playerId))
                            : undefined
                        }
                        prospectOwner={findMlbProspectOwner(record, prospectOwners)}
                        promotionLabel={(() => { const season = record.playerId ? fantasySeasons.get(String(record.playerId)) : undefined; const prospect = findMlbProspectOwner(record, prospectOwners); const activeRoster = Boolean(season?.fantasy_team_id && !["AP", "PROSPECT"].includes((season.position || "").toUpperCase())); const benchmark = promotionBenchmarks.get(batterPosition(record)); return prospect && !activeRoster && benchmark !== undefined && getBatterScore(record) >= benchmark ? `Promotion review: ${getBatterScore(record)} points meets the ${batterPosition(record) === "OF" ? "OF3" : batterPosition(record)} benchmark of ${benchmark.toFixed(1)}.` : undefined; })()}
                      />
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{batterPosition(record)}</td>
                    <td className="px-3 py-3 text-center tabular-nums text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.age)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.gamesPlayed)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.atBats)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.runs)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.hits)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.doubles)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.triples)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.homeRuns)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.rbi)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.baseOnBalls)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.strikeOuts)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.stolenBases)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatStatValue(record.stats.caughtStealing)}</td>
                    <td className="px-3 py-3 text-center font-semibold text-gray-800 dark:text-white/90">{getBatterScore(record)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">
                      {getBatterPpg(record) === null ? "—" : getBatterPpg(record)!.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && <tr><td colSpan={17} className="px-3 py-10 text-center text-sm text-gray-500">No batters match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
