import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  fetchNhlGoalieStats,
  fetchNhlLiveSeasonStats,
  formatFantasyPoints,
  formatNhlStat,
  getGoalieScore,
  type NhlGoalieRecord,
} from "../../lib/nhl";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import NhlPlayerCell from "./NhlPlayerCell";
import { fetchPlayerAwards, mapAwardsByPlayer, type PlayerAward } from "../../lib/awards";
import { applyTeamBranding, fetchFantasyTeams, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import StatsRightsFilters, { type PlayerTypeFilter, type RightsFilter } from "./StatsRightsFilters";
import { fetchProspectRights, getProspectRight, removeAgedOutProspectRights, type ProspectRight } from "../../lib/prospectRights";
import { fetchTradeBlockListings } from "../../lib/tradeMarket";
import TradeBlockBadge from "./TradeBlockBadge";
import PlayerInterestButton from "./PlayerInterestButton";
import { usePlayerTradeInterest } from "../../hooks/usePlayerTradeInterest";
import { fetchSeasonLeadership } from "../../lib/teamLeadership";
import PositionBadge from "../../components/hockey/PositionBadge";
import { CURRENT_LEAGUE_SEASON, playedAndCurrentSeasons } from "../../lib/leagueSeasons";

const statsSeasons = playedAndCurrentSeasons;
function nhlSeasonId(year: number) { return (year - 1) * 10000 + year; }

type GoalieSortKey = "player" | "position" | "gamesPlayed" | "gamesStarted" | "wins" | "losses" | "otLosses" | "goalsAgainst" | "saves" | "shutouts" | "penaltyMinutes" | "goals" | "assists" | "savePct" | "goalsAgainstAverage" | "score" | "fantasyPointsPerGame";
type SortDirection = "asc" | "desc";

const goalieColumns: { label: string; key: GoalieSortKey }[] = [
  { label: "PLAYER", key: "player" }, { label: "POS", key: "position" }, { label: "GP", key: "gamesPlayed" },
  { label: "GS", key: "gamesStarted" }, { label: "W", key: "wins" },
  { label: "L", key: "losses" }, { label: "OTL", key: "otLosses" },
  { label: "GA", key: "goalsAgainst" }, { label: "SV", key: "saves" },
  { label: "SO", key: "shutouts" }, { label: "PIM", key: "penaltyMinutes" },
  { label: "G", key: "goals" }, { label: "A", key: "assists" },
  { label: "SV%", key: "savePct" }, { label: "GAA", key: "goalsAgainstAverage" },
  { label: "SCORE", key: "score" }, { label: "FPPG", key: "fantasyPointsPerGame" },
];

function goalieSortValue(record: NhlGoalieRecord, key: GoalieSortKey) {
  if (key === "player") return record.goalieFullName;
  if (key === "position") return "G";
  if (key === "score") return getGoalieScore(record);
  if (key === "fantasyPointsPerGame") return record.gamesPlayed ? getGoalieScore(record) / record.gamesPlayed : 0;
  return record[key] ?? Number.NEGATIVE_INFINITY;
}

export default function GoalieStats() {
  const [records, setRecords] = useState<NhlGoalieRecord[]>([]);
  const [fantasySeasons, setFantasySeasons] = useState<Map<string, PlayerSeasonWithRelations>>(new Map());
  const [prospectRights, setProspectRights] = useState<Map<string, ProspectRight>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awardsByPlayer, setAwardsByPlayer] = useState<Map<number, PlayerAward[]>>(new Map());
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [rightsFilter, setRightsFilter] = useState<RightsFilter>("all");
  const [playerTypeFilter, setPlayerTypeFilter] = useState<PlayerTypeFilter>("all");
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number>>(new Set());
  const [selectedSeason, setSelectedSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [tradeBlockIds, setTradeBlockIds] = useState<Set<number>>(new Set());
  const [leadershipByPlayerSeason, setLeadershipByPlayerSeason] = useState<Map<number, "C" | "A">>(new Map());
  const [sort, setSort] = useState<{ key: GoalieSortKey; direction: SortDirection }>({ key: "score", direction: "desc" });
  const tradeInterest = usePlayerTradeInterest(selectedSeason);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setProspectRights(new Map());
    const statsRequest = selectedSeason === CURRENT_LEAGUE_SEASON
      ? fetchNhlLiveSeasonStats(selectedSeason).then((stats) => stats.goalies)
      : fetchNhlGoalieStats(nhlSeasonId(selectedSeason));
    statsRequest
      .then((data) => {
        if (!active) return;
        setRecords(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load goalie stats");
      })
      .finally(() => { if (active) setLoading(false); });

    Promise.all([
      statsRequest,
      fetchProspectRights(selectedSeason),
    ])
      .then(async ([data, rights]) => removeAgedOutProspectRights(rights, data.map((record) => ({
        playerId: record.playerId,
        playerName: record.goalieFullName,
        birthDate: record.birthDate,
      }))))
      .then((eligibleRights) => { if (active) setProspectRights(eligibleRights); })
      .catch(() => { if (active) setProspectRights(new Map()); });

    fetchPlayerSeasonsBySeason(selectedSeason)
      .then((seasonRows) => {
        if (!active) return;
        setFantasySeasons(new Map(seasonRows.filter((season) => season.player?.player_api_id).map((season) => [season.player!.player_api_id, season])));
      })
      .catch(() => {
        // NHL stats should remain usable when optional fantasy roster metadata fails.
      });

    fetchTradeBlockListings(selectedSeason)
      .then((rows) => { if (active) setTradeBlockIds(new Set(rows.map((row) => row.player_season_id))); })
      .catch(() => { if (active) setTradeBlockIds(new Set()); });

    fetchSeasonLeadership(selectedSeason)
      .then((rows) => { if (active) setLeadershipByPlayerSeason(new Map(rows.map((row) => [row.player_season_id, row.slot === "C" ? "C" as const : "A" as const]))); })
      .catch(() => { if (active) setLeadershipByPlayerSeason(new Map()); });

    fetchPlayerAwards(undefined, false)
      .then((rows) => { if (active) setAwardsByPlayer(mapAwardsByPlayer(rows)); })
      .catch(() => {});
    Promise.all([fetchFantasyTeams(), fetchTeamBrandingHistory()])
      .then(([teamRows, branding]) => { if (active) setTeams(teamRows.map((team) => applyTeamBranding(team, branding, selectedSeason))); })
      .catch(() => {});
    return () => { active = false; };
  }, [selectedSeason]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    const fantasySeason = fantasySeasons.get(String(record.playerId));
    const prospectRight = getProspectRight(prospectRights, record.playerId, record.goalieFullName);
    const prospectPosition = ["PROSPECT", "AP"].includes((fantasySeason?.position || "").toUpperCase());
    const rostered = Boolean(fantasySeason?.fantasy_team_id && !prospectPosition);
    const prospect = Boolean(prospectRight && !rostered);
    const owned = Boolean(fantasySeason?.fantasy_team_id || prospectRight);
    const ownerTeamId = fantasySeason?.fantasy_team_id || prospectRight?.team.id;
    if (playerSearch.trim() && !record.goalieFullName.toLocaleLowerCase().includes(playerSearch.trim().toLocaleLowerCase())) return false;
    if (rightsFilter === "owned" && !owned) return false;
    if (rightsFilter === "unowned" && owned) return false;
    if (playerTypeFilter === "rostered" && !rostered) return false;
    if (playerTypeFilter === "prospects" && !prospect) return false;
    if (selectedTeamIds.size && (!ownerTeamId || !selectedTeamIds.has(ownerTeamId))) return false;
    return true;
  }), [records, fantasySeasons, prospectRights, playerSearch, rightsFilter, playerTypeFilter, selectedTeamIds]);

  const sortedRecords = useMemo(() => [...filteredRecords].sort((a, b) => {
    const aValue = goalieSortValue(a, sort.key);
    const bValue = goalieSortValue(b, sort.key);
    const comparison = typeof aValue === "string"
      ? aValue.localeCompare(String(bValue), undefined, { sensitivity: "base" })
      : aValue - Number(bValue);
    return sort.direction === "asc" ? comparison : -comparison;
  }), [filteredRecords, sort]);

  const changeSort = (key: GoalieSortKey) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
  }));

  return (
    <div>
      <PageMeta title="Great Lakes Dynasty Hockey League" description="NHL goalie fantasy statistics for GLDHL" />
      <PageBreadcrumb pageTitle="Goalie Stats" />
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><h3 className="mb-2 font-semibold text-gray-800 text-theme-xl dark:text-white/90 sm:text-2xl">Goalie Stats</h3><p className="text-sm text-gray-500 dark:text-gray-400 sm:text-base">NHL regular-season scoring and GLDHL ownership for Season {selectedSeason}.</p><p className="mt-1 text-xs font-semibold text-brand-500">Goalie offense: 3 fantasy points per goal · 2 per assist</p></div>
          <div className="w-full sm:w-40"><label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Season</label><select value={selectedSeason} onChange={(event) => { setSelectedSeason(Number(event.target.value)); setSelectedTeamIds(new Set()); }} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">{statsSeasons.map((season) => <option key={season}>{season}</option>)}</select></div>
        </div>
        <StatsRightsFilters
          search={playerSearch}
          onSearchChange={setPlayerSearch}
          rights={rightsFilter}
          onRightsChange={setRightsFilter}
          playerType={playerTypeFilter}
          onPlayerTypeChange={setPlayerTypeFilter}
          teams={teams}
          selectedTeamIds={selectedTeamIds}
          onToggleTeam={(teamId) => setSelectedTeamIds((current) => { const next = new Set(current); if (next.has(teamId)) next.delete(teamId); else next.add(teamId); return next; })}
          onClear={() => { setPlayerSearch(""); setRightsFilter("all"); setPlayerTypeFilter("all"); setSelectedTeamIds(new Set()); }}
        />
        {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading goalie stats…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!loading && !error && <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.03]"><tr>
              {goalieColumns.map((column) => <th key={column.key} aria-sort={sort.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap p-0 text-center font-semibold text-gray-700 dark:text-gray-200"><button type="button" onClick={() => changeSort(column.key)} className="w-full cursor-pointer px-3 py-3 font-inherit" title={`Sort by ${column.label}`}>{column.label}</button></th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedRecords.map((record) => {
                const score = getGoalieScore(record);
                return <tr key={record.playerId} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="px-3 py-3"><NhlPlayerCell playerName={record.goalieFullName} playerId={record.playerId} teamAbbreviation={record.teamAbbrevs} birthDate={record.birthDate} fantasySeason={fantasySeasons.get(String(record.playerId))} prospectRight={getProspectRight(prospectRights, record.playerId, record.goalieFullName)} awards={fantasySeasons.get(String(record.playerId))?.player?.id ? awardsByPlayer.get(fantasySeasons.get(String(record.playerId))!.player!.id) || [] : []} leadershipRole={fantasySeasons.get(String(record.playerId))?.id ? leadershipByPlayerSeason.get(fantasySeasons.get(String(record.playerId))!.id) : undefined} leadingAction={tradeInterest.canExpressInterest(fantasySeasons.get(String(record.playerId))) ? <PlayerInterestButton interested={tradeInterest.isInterested(fantasySeasons.get(String(record.playerId))!.id)} busy={tradeInterest.busyPlayerSeasonId === fantasySeasons.get(String(record.playerId))!.id} onClick={() => void tradeInterest.toggleInterest(fantasySeasons.get(String(record.playerId))!)} /> : undefined} />{fantasySeasons.get(String(record.playerId))?.id && tradeBlockIds.has(fantasySeasons.get(String(record.playerId))!.id) && <TradeBlockBadge className="mt-1" />}</td>
                  <td className="px-3 py-3 text-center"><PositionBadge position="G" /></td>
                  {[record.gamesPlayed,record.gamesStarted,record.wins,record.losses,record.otLosses,record.goalsAgainst,record.saves,record.shutouts,record.penaltyMinutes,record.goals,record.assists].map((value, index) => <td key={index} className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatNhlStat(value)}</td>)}
                  <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{record.savePct === null ? '—' : record.savePct.toFixed(3)}</td>
                  <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{formatNhlStat(record.goalsAgainstAverage, 2)}</td>
                  <td className="px-3 py-3 text-center font-semibold text-gray-800 dark:text-white/90">{formatFantasyPoints(score)}</td>
                  <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{record.gamesPlayed ? formatFantasyPoints(score / record.gamesPlayed) : '—'}</td>
                </tr>;
              })}
              {!sortedRecords.length && <tr><td colSpan={goalieColumns.length} className="px-4 py-12 text-center text-sm font-medium text-gray-500 dark:text-gray-400">No goalies match your search and filters.</td></tr>}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}
