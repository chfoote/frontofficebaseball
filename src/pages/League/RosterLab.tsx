import PlayerPositionEligibility from "../../components/hockey/PlayerPositionEligibility";
import { Link } from "react-router";
import { availableLabFreeAgents, validTargetEstimate } from "../../lib/managerTargets";
import TargetsPanel from "../../components/targets/TargetsPanel";
import TargetButton from "../../components/targets/TargetButton";
import { useManagerTargets, type ManagerTarget } from "../../hooks/useManagerTargets";
import { useMlbEligibility } from "../../hooks/useMlbEligibility";
import MlbEligibilityBadges from "../../components/hockey/MlbEligibilityBadges";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { fetchBuyoutPenalties } from "../../lib/buyouts";
import { fetchFantasyTeams, type FantasyTeam } from "../../lib/fantasyTeams";
import { fetchPlayerSeasons, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { fetchRetentionAdjustments } from "../../lib/retentions";
import { fetchProspectRights } from "../../lib/prospectRights";
import { formatFantasyPoints } from "../../lib/nhl";
import { fetchMlbStats, type MlbStatRecord } from "../../lib/mlb";
import { fetchLatestUserTeamAssignment, fetchUserTeamAssignment } from "../../lib/teamUserAssignments";
import { fetchAllMlbProspectOwners, findMlbProspectOwner, type MlbProspectOwner } from "../../lib/mlbFarmSystems";

const rosterLimit = 27;
const activePositions = ["C", "1B", "2B", "SS", "3B", "OF", "DH", "SP", "RP"] as const;
const activeSet = new Set<string>(activePositions);
const capSet = new Set<string>([...activePositions, "W", "IR", "RETENTION"]);
const positionOrder = ["C", "1B", "2B", "SS", "3B", "OF", "DH", "SP", "RP", "W", "IR", "LTIR", "RFA", "PROSPECT", "AP"];
const minimums: Record<string, number> = { C: 1, "1B": 1, "2B": 1, SS: 1, "3B": 1, OF: 3, DH: 1, SP: 5, RP: 1 };
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const years = Array.from({ length: 5 }, (_, index) => CURRENT_LEAGUE_SEASON + index);

type LabRow = PlayerSeasonWithRelations & { labKey: string };
type Adjustment = { key: string; teamId: number; year: number; amount: number; label: string; kind: "retention" | "buyout" };
type Snapshot = { rows: LabRow[]; adjustments: Adjustment[]; label: string };
type ActionMode = "status" | "trade" | "buyout" | "callup" | "signing" | "rfa";
type Production = { points: number; gamesPlayed: number; position: string };
type SavedLab = { rows: LabRow[]; adjustments: Adjustment[]; focusTeamId: number | null; year: number };

function position(row: PlayerSeasonWithRelations) { return (row.position || "").toUpperCase(); }
function playerName(row: PlayerSeasonWithRelations) { return row.player?.full_name || [row.player?.first_name, row.player?.last_name].filter(Boolean).join(" ") || "Unknown player"; }
function normalizedName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
const salaryCap = 47_000_000;
function cloneRows(rows: LabRow[]) { return rows.map((row) => ({ ...row, player: row.player ? { ...row.player } : null, fantasy_team: row.fantasy_team ? { ...row.fantasy_team } : null })); }
function getBatterScore(record: MlbStatRecord) { return Number(record.stats.runs ?? 0) + Number(record.stats.hits ?? 0) + Number(record.stats.doubles ?? 0) + Number(record.stats.triples ?? 0) * 2 + Number(record.stats.homeRuns ?? 0) * 3 + Number(record.stats.rbi ?? 0) + Number(record.stats.stolenBases ?? 0) * 2; }
function getPitcherScore(record: MlbStatRecord) { return Number(record.stats.wins ?? 0) * 8 + Number(record.stats.strikeOuts ?? 0) + Number(record.stats.saves ?? 0) * 6 + Number(record.stats.completeGames ?? 0) * 5 + Number(record.stats.shutouts ?? 0) * 5; }
function hitterPosition(value: string) { const code = value.toUpperCase(); return ["LF", "CF", "RF"].includes(code) ? "OF" : code; }
function pitcherPosition(record: MlbStatRecord) { const games = Number(record.stats.gamesPlayed ?? 0); const starts = Number(record.stats.gamesStarted ?? 0); return starts >= 5 ? "SP" : games - starts >= 5 ? "RP" : "RP"; }

function SummaryMetric({ label, value, detail, danger }: { label: string; value: string; detail: string; danger?: boolean }) {
  return <div className={`rounded-xl border p-4 ${danger ? "border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10" : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p><p className={`mt-1 text-xl font-black ${danger ? "text-error-600 dark:text-error-300" : "text-gray-900 dark:text-white"}`}>{value}</p><p className="mt-1 text-[10px] font-medium text-gray-400">{detail}</p></div>;
}

export default function RosterLab() {
  const { user } = useAuth();
  const targets = useManagerTargets();
  const [pendingTarget, setPendingTarget] = useState<ManagerTarget | null>(null);
  const userId = user?.id || null;
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [baseRows, setBaseRows] = useState<LabRow[]>([]);
  const [rows, setRows] = useState<LabRow[]>([]);
  const [baseAdjustments, setBaseAdjustments] = useState<Adjustment[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [rightsProspects, setRightsProspects] = useState<LabRow[]>([]);
  const [production, setProduction] = useState<Map<string, Production>>(new Map());
  const [productionByName, setProductionByName] = useState<Map<string, Production>>(new Map());
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [focusTeamId, setFocusTeamId] = useState<number | null>(null);
  const [year, setYear] = useState(CURRENT_LEAGUE_SEASON);
  const eligibility = useMlbEligibility(year);
  const [mode, setMode] = useState<ActionMode>("status");
  const [signingClass, setSigningClass] = useState<"ALL" | "UFA" | "RFA">("ALL");
  const [playerKey, setPlayerKey] = useState("");
  const [tradeSourceTeamId, setTradeSourceTeamId] = useState<number | null>(null);
  const [destinationTeamId, setDestinationTeamId] = useState<number | null>(null);
  const [newStatus, setNewStatus] = useState("IR");
  const [newPosition, setNewPosition] = useState("C");
  const [retentionPercent, setRetentionPercent] = useState(0);
  const [salary, setSalary] = useState(250_000);
  const [term, setTerm] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ufaRows, setUfaRows] = useState<LabRow[]>([]);
  const [scenarioDirty, setScenarioDirty] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const storageKey = `front-office-baseball:roster-lab:${userId || "guest"}`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetchFantasyTeams(),
      fetchPlayerSeasons(),
      fetchProspectRights(CURRENT_LEAGUE_SEASON).catch(() => new Map()),
      Promise.all([fetchMlbStats("hitting", CURRENT_LEAGUE_SEASON - 1), fetchMlbStats("pitching", CURRENT_LEAGUE_SEASON - 1)]).catch(() => [[], []] as [MlbStatRecord[], MlbStatRecord[]]),
      Promise.all(years.map(async (seasonYear) => ({ seasonYear, buyouts: await fetchBuyoutPenalties(seasonYear).catch(() => []), retentions: await fetchRetentionAdjustments(seasonYear).catch(() => []) }))),
      userId ? fetchUserTeamAssignment(userId, CURRENT_LEAGUE_SEASON).then((assignment) => assignment || fetchLatestUserTeamAssignment(userId)).catch(() => null) : Promise.resolve(null),
      fetchAllMlbProspectOwners(CURRENT_LEAGUE_SEASON).catch(() => new Map<string, MlbProspectOwner>()),
    ]).then(([teamRows, seasonRows, prospectRights, mlbStats, financialRows, assignment, mlbProspectOwners]) => {
      if (!active) return;
      // Keep historical rows in the sandbox as well: prospect rights are often
      // recorded before the first projected contract season.
      const labRows = seasonRows.map((row) => ({ ...row, labKey: `base:${row.id}` }));
      const financialAdjustments: Adjustment[] = financialRows.flatMap(({ seasonYear, buyouts, retentions }) => [
        ...buyouts.map((item) => ({ key: `buyout:${item.id}`, teamId: item.fantasy_team_id, year: seasonYear, amount: item.amount, label: item.player?.full_name || "Buyout penalty", kind: "buyout" as const })),
        ...retentions.map((item) => ({ key: `retention:${item.id}`, teamId: item.fantasy_team_id, year: seasonYear, amount: item.amount, label: item.player?.full_name || "Salary retention", kind: "retention" as const })),
      ]);
      const uniqueRights = [...prospectRights.values()].filter((right, index, all) => {
        const key = `${right.team.id}:${right.playerApiId || right.playerName || ""}`;
        return Boolean(right.playerApiId || right.playerName) && all.findIndex((candidate) => `${candidate.team.id}:${candidate.playerApiId || candidate.playerName || ""}` === key) === index;
      });
      const rightRows: LabRow[] = uniqueRights.map((right, index) => {
        const existing = seasonRows.find((row) => right.playerApiId && row.player?.player_api_id === right.playerApiId)
          || seasonRows.find((row) => right.playerName && playerName(row).localeCompare(right.playerName, undefined, { sensitivity: "base" }) === 0);
        const syntheticId = -1_000_000 - index;
        return {
          id: syntheticId, player_id: existing?.player_id || syntheticId, season_year: CURRENT_LEAGUE_SEASON,
          fantasy_team_id: right.team.id, salary: 0, position: "PROSPECT", term_end_year: null,
          contract_group: right.positionCode || "PROSPECT_RIGHTS", notes: right.source, created_at: "", updated_at: "",
          player: existing?.player || { id: syntheticId, player_api_id: right.playerApiId || "", first_name: null, last_name: null, full_name: right.playerName || "Unknown prospect", on_trade_block: false, notes: null, created_at: "", updated_at: "" },
          fantasy_team: right.team, labKey: `right:${right.team.id}:${right.playerApiId || right.playerName || index}`,
        };
      });
      setTeams(teamRows); setBaseRows(labRows); setBaseAdjustments(financialAdjustments);
      setRightsProspects(rightRows);
      const liveProduction = new Map<string, Production>();
      const namedProduction = new Map<string, Production>();
      const [hitters, pitchers] = mlbStats;
      hitters.forEach((record) => { const item = { points: getBatterScore(record), gamesPlayed: Number(record.stats.gamesPlayed ?? 0), position: hitterPosition(record.position || "DH") }; if (record.playerId) liveProduction.set(String(record.playerId), item); namedProduction.set(normalizedName(record.playerName), item); });
      pitchers.forEach((record) => { const item = { points: getPitcherScore(record), gamesPlayed: Number(record.stats.gamesPlayed ?? 0), position: pitcherPosition(record) }; if (record.playerId) liveProduction.set(String(record.playerId), item); namedProduction.set(normalizedName(record.playerName), item); });
      setProduction(liveProduction);
      setProductionByName(namedProduction);
      const currentRows = seasonRows.filter((row) => row.season_year === CURRENT_LEAGUE_SEASON);
      const isOwned = (record: MlbStatRecord) => currentRows.some((row) => row.fantasy_team_id && ((record.playerId && row.player?.player_api_id === String(record.playerId)) || normalizedName(playerName(row)) === normalizedName(record.playerName)));
      const freeAgentRecords = [...hitters, ...pitchers].filter((record, index, all) => Boolean(record.playerId) && all.findIndex((candidate) => candidate.playerId === record.playerId) === index && !isOwned(record) && !findMlbProspectOwner(record, mlbProspectOwners));
      setUfaRows(freeAgentRecords.map((record, index) => {
        const syntheticId = -2_000_000 - Number(record.playerId || index);
        const resolvedPosition = pitchers.includes(record) ? pitcherPosition(record) : hitterPosition(record.position || "DH");
        return {
          id: syntheticId, player_id: syntheticId, season_year: CURRENT_LEAGUE_SEASON,
          fantasy_team_id: null, salary: null, position: resolvedPosition, term_end_year: null,
          contract_group: "UFA", notes: "Upcoming UFA pool", created_at: "", updated_at: "",
          player: { id: syntheticId, player_api_id: String(record.playerId || ""), first_name: null, last_name: null, full_name: record.playerName, on_trade_block: false, notes: null, created_at: "", updated_at: "" },
          fantasy_team: null, labKey: `ufa:${record.playerId || normalizedName(record.playerName)}`,
        };
      }));
      const preferred = assignment?.fantasy_team_id || teamRows[0]?.id || null;
      let saved: SavedLab | null = null;
      try { saved = JSON.parse(window.localStorage.getItem(`front-office-baseball:roster-lab:${userId || "guest"}`) || "null") as SavedLab | null; } catch { saved = null; }
      setRows(saved?.rows?.length ? cloneRows(saved.rows) : cloneRows(labRows));
      setAdjustments(saved?.adjustments?.length ? saved.adjustments.map((item) => ({ ...item })) : financialAdjustments);
      const restoredTeam = saved?.focusTeamId && teamRows.some((team) => team.id === saved?.focusTeamId) ? saved.focusTeamId : preferred;
      setFocusTeamId(restoredTeam); setYear(saved?.year && years.includes(saved.year) ? saved.year : CURRENT_LEAGUE_SEASON); setScenarioDirty(Boolean(saved));
      setTradeSourceTeamId(restoredTeam); setDestinationTeamId(teamRows.find((team) => team.id !== restoredTeam)?.id || null);
      setStorageReady(true);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to open the Roster Lab."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!storageReady) return;
    if (!scenarioDirty) { window.localStorage.removeItem(storageKey); return; }
    const saved: SavedLab = { rows, adjustments, focusTeamId, year };
    try { window.localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* Keep the active in-memory scenario if browser storage is unavailable. */ }
  }, [adjustments, focusTeamId, rows, scenarioDirty, storageKey, storageReady, year]);

  const playerProduction = useCallback((row: PlayerSeasonWithRelations) => production.get(row.player?.player_api_id || "") || productionByName.get(normalizedName(playerName(row))) || { points: 0, gamesPlayed: 0, position: "" }, [production, productionByName]);
  const playerPosition = useCallback((row: PlayerSeasonWithRelations) => { const code = position(row); return ["PROSPECT", "AP"].includes(code) ? playerProduction(row).position || (row.contract_group && row.contract_group !== "PROSPECT_RIGHTS" ? row.contract_group : code) : code; }, [playerProduction]);
  const comparePlayers = useCallback((a: PlayerSeasonWithRelations, b: PlayerSeasonWithRelations) => { const positionDifference = positionOrder.indexOf(playerPosition(a)) - positionOrder.indexOf(playerPosition(b)); return positionDifference || playerProduction(b).points - playerProduction(a).points || playerName(a).localeCompare(playerName(b)); }, [playerPosition, playerProduction]);
  const focusRows = useMemo(() => rows.filter((row) => row.fantasy_team_id === focusTeamId && row.season_year === year).sort(comparePlayers), [rows, focusTeamId, year, comparePlayers]);
  const signingRows = useMemo(() => {
    const existingUfas = rows.filter((row) => !row.fantasy_team_id && row.season_year === year && row.player && position(row) !== "RFA");
    const externalRfas = rows.filter((row) => row.season_year === year && row.player && position(row) === "RFA" && row.fantasy_team_id !== focusTeamId);
    const combined = [...existingUfas, ...(year === CURRENT_LEAGUE_SEASON ? availableLabFreeAgents(ufaRows, rows, year) : []), ...externalRfas];
    return [...new Map(combined.map((row) => [`${row.player?.player_api_id || normalizedName(playerName(row))}:${position(row) === "RFA" ? "RFA" : "UFA"}`, row])).values()].sort(comparePlayers);
  }, [rows, year, focusTeamId, ufaRows, comparePlayers]);
  const filteredSigningRows = useMemo(() => signingClass === "ALL" ? signingRows : signingRows.filter((row) => signingClass === "RFA" ? position(row) === "RFA" : position(row) !== "RFA"), [signingClass, signingRows]);
  const tradeRows = useMemo(() => rows.filter((row) => row.fantasy_team_id === tradeSourceTeamId && row.season_year === year && row.player && !["RETENTION", "PROSPECT", "AP"].includes(position(row))).sort(comparePlayers), [rows, tradeSourceTeamId, year, comparePlayers]);
  const prospectRows = useMemo(() => {
    const latestByPlayer = new Map<number, LabRow>();
    [...rows, ...rightsProspects].filter((row) => row.player && row.season_year <= year).forEach((row) => {
      const current = latestByPlayer.get(row.player_id);
      if (!current || row.season_year > current.season_year) latestByPlayer.set(row.player_id, row);
    });
    return [...latestByPlayer.values()]
      .filter((row) => row.fantasy_team_id === focusTeamId && ["PROSPECT", "AP"].includes(position(row)))
      .filter((row) => !baseRows.some((season) => season.player_id === row.player_id && season.fantasy_team_id && !["PROSPECT", "AP", "RETENTION"].includes(position(season))))
      .sort(comparePlayers);
  }, [rows, rightsProspects, baseRows, focusTeamId, year, comparePlayers]);
  const rfaRows = useMemo(() => focusRows.filter((row) => position(row) === "RFA"), [focusRows]);
  const selectableRows = mode === "signing" ? filteredSigningRows : mode === "trade" ? tradeRows : mode === "callup" ? prospectRows : mode === "rfa" ? rfaRows : focusRows;
  const selected = selectableRows.find((row) => row.labKey === playerKey) || null;
  const selectedPositions = eligibility.positions.get(Number(selected?.player?.player_api_id)) || [];
  const needsEligiblePosition = ["callup", "signing", "rfa"].includes(mode) || (mode === "status" && !["W", "IR", "LTIR"].includes(newStatus));
  const chosenPosition = mode === "status" ? newStatus : newPosition;
  const validPosition = !needsEligiblePosition || (!eligibility.loading && !eligibility.error && selectedPositions.some((position) => position === chosenPosition));
  const previousRfaRow = selected && mode === "rfa" ? rows.filter((row) => row.player_id === selected.player_id && row.season_year < year && row.salary != null).sort((a, b) => b.season_year - a.season_year)[0] : null;
  const rfaQualifyingSalary = Math.max(Math.round((previousRfaRow?.salary || 0) * 0.5), 250_000);

  useEffect(() => { setPlayerKey(""); }, [mode, focusTeamId, tradeSourceTeamId, year]);

  useEffect(() => {
    if (mode === "callup") { setSalary(250_000); setTerm(3); }
    if (mode === "signing") { setSalary(250_000); setTerm(1); }
    if (mode === "rfa") { setTerm(1); }
  }, [mode]);

  useEffect(() => {
    if (mode !== "rfa" || !selected) return;
    const previous = rows.filter((row) => row.player_id === selected.player_id && row.season_year < year && row.salary != null).sort((a, b) => b.season_year - a.season_year)[0];
    setSalary(Math.max(Math.round((previous?.salary || 0) * 0.5), 250_000));
  }, [mode, selected, rows, year]);

  useEffect(() => {
    const positions = eligibility.positions.get(Number(selected?.player?.player_api_id)) || [];
    setNewPosition((current) => positions.some((position) => position === current) ? current : positions[0] || "");
  }, [eligibility.positions, selected]);

  useEffect(() => {
    setTradeSourceTeamId(focusTeamId);
    setDestinationTeamId(teams.find((team) => team.id !== focusTeamId)?.id || null);
  }, [focusTeamId, teams]);

  useEffect(() => {
    if (!pendingTarget || mode !== "signing") return;
    const row = signingRows.find((row) => row.player?.player_api_id === pendingTarget.player_api_id);
    if (row) {
      setSigningClass("ALL");
      setPlayerKey(row.labKey);
      setSalary(pendingTarget.estimated_salary);
      setTerm(pendingTarget.term);
    }
    setPendingTarget(null);
    document.getElementById("mock-move")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pendingTarget, mode, signingRows]);

  function remember(label: string) { setScenarioDirty(true); setHistory((current) => [...current, { rows: cloneRows(rows), adjustments: adjustments.map((item) => ({ ...item })), label }]); }
  function teamName(id: number | null) { return teams.find((team) => team.id === id)?.team_name || "Team"; }

  function applyAction() {
    if (!selected || !focusTeamId || !validPosition) return;
    if (["signing", "callup", "rfa"].includes(mode) && !validTargetEstimate(salary, term)) return;
    if (mode === "status") {
      remember(`${playerName(selected)} moved to ${newStatus}`);
      setRows((current) => current.map((row) => row.labKey === selected.labKey ? { ...row, position: newStatus } : row));
    } else if (mode === "trade" && tradeSourceTeamId && destinationTeamId && destinationTeamId !== tradeSourceTeamId) {
      const retainedRate = Math.min(Math.max(retentionPercent, 0), 25) / 100;
      remember(`${playerName(selected)} traded to ${teamName(destinationTeamId)}`);
      const affected = rows.filter((row) => row.player_id === selected.player_id && row.fantasy_team_id === tradeSourceTeamId && row.season_year >= year);
      setRows((current) => current.map((row) => affected.some((item) => item.labKey === row.labKey) ? { ...row, fantasy_team_id: destinationTeamId, fantasy_team: teams.find((team) => team.id === destinationTeamId) || null, salary: Math.round((row.salary || 0) * (1 - retainedRate)) } : row));
      if (retainedRate) setAdjustments((current) => [...current, ...affected.map((row) => ({ key: `lab-retention:${row.labKey}`, teamId: tradeSourceTeamId, year: row.season_year, amount: Math.round((row.salary || 0) * retainedRate), label: `${playerName(row)} retained ${retentionPercent}%`, kind: "retention" as const }))]);
    } else if (mode === "buyout") {
      const affected = rows.filter((row) => row.player_id === selected.player_id && row.fantasy_team_id === focusTeamId && row.season_year >= year);
      const remaining = Math.max(affected.length, 1);
      const rate = remaining >= 3 ? 0.5 : remaining === 2 ? 0.4 : 0.3;
      remember(`${playerName(selected)} bought out`);
      setRows((current) => current.filter((row) => !affected.some((item) => item.labKey === row.labKey)));
      setAdjustments((current) => [...current, ...affected.map((row) => ({ key: `lab-buyout:${row.labKey}`, teamId: focusTeamId, year: row.season_year, amount: Math.round((row.salary || 0) * rate), label: `${playerName(row)} mock buyout`, kind: "buyout" as const }))]);
    } else if (mode === "callup") {
      remember(`${playerName(selected)} called up at ${money.format(salary)}`);
      const endYear = year + Math.max(term, 1) - 1;
      setRows((current) => {
        const withoutFutureProspects = current.filter((row) => !(row.player_id === selected.player_id && row.season_year >= year));
        return [...withoutFutureProspects, ...Array.from({ length: Math.max(term, 1) }, (_, index) => ({ ...selected, id: -Date.now() - index, labKey: `lab-callup:${Date.now()}:${index}`, season_year: year + index, position: newPosition, salary, term_end_year: endYear, contract_group: "ROSTER_LAB", notes: "Mock prospect call-up" }))];
      });
    } else if (mode === "signing") {
      remember(`${playerName(selected)} signed by ${teamName(focusTeamId)}`);
      const endYear = year + Math.max(term, 1) - 1;
      setRows((current) => {
        const withoutFuture = current.filter((row) => !(row.player_id === selected.player_id && row.season_year >= year));
        return [...withoutFuture, ...Array.from({ length: Math.max(term, 1) }, (_, index) => ({ ...selected, id: -Date.now() - index, labKey: `lab-signing:${Date.now()}:${index}`, season_year: year + index, fantasy_team_id: focusTeamId, fantasy_team: teams.find((team) => team.id === focusTeamId) || null, position: newPosition, salary, term_end_year: endYear, contract_group: "ROSTER_LAB", notes: "Mock signing" }))];
      });
    } else if (mode === "rfa") {
      remember(`${playerName(selected)} retained for ${term} year${term === 1 ? "" : "s"} at ${money.format(salary)}`);
      const endYear = year + Math.max(term, 1) - 1;
      const stamp = Date.now();
      setRows((current) => {
        const withoutFuture = current.filter((row) => !(row.player_id === selected.player_id && row.season_year >= year));
        return [...withoutFuture, ...Array.from({ length: Math.max(term, 1) }, (_, index) => ({ ...selected, id: -stamp - index, labKey: `lab-rfa:${stamp}:${index}`, season_year: year + index, fantasy_team_id: focusTeamId, fantasy_team: teams.find((team) => team.id === focusTeamId) || null, position: newPosition, salary, term_end_year: endYear, contract_group: "ROSTER_LAB_RFA", notes: "Mock RFA retention" }))];
      });
    }
    setPlayerKey("");
  }

  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setRows(cloneRows(previous.rows)); setAdjustments(previous.adjustments.map((item) => ({ ...item }))); setHistory((current) => current.slice(0, -1));
  }
  function reset() { setRows(cloneRows(baseRows)); setAdjustments(baseAdjustments.map((item) => ({ ...item }))); setHistory([]); setScenarioDirty(false); window.localStorage.removeItem(storageKey); }

  function summary(teamId: number, seasonYear: number) {
    const teamRows = rows.filter((row) => row.fantasy_team_id === teamId && row.season_year === seasonYear);
    const active = teamRows.filter((row) => activeSet.has(position(row)));
    const payroll = teamRows.filter((row) => capSet.has(position(row))).reduce((sum, row) => sum + (row.salary || 0), 0) + adjustments.filter((item) => item.teamId === teamId && item.year === seasonYear).reduce((sum, item) => sum + item.amount, 0);
    const eligibilityReady = !eligibility.loading && !eligibility.error;
    const invalidPositions = eligibilityReady ? active.filter((row) => !eligibility.positions.get(Number(row.player?.player_api_id))?.some((eligible) => eligible === position(row))) : [];
    const qualified = active.filter((row) => !invalidPositions.includes(row));
    const counts = Object.fromEntries(activePositions.map((code) => [code, qualified.filter((row) => position(row) === code).length])) as Record<string, number>;
    const missing = activePositions.filter((code) => counts[code] < minimums[code]).map((code) => `${code} ${counts[code]}/${minimums[code]}`);
    const retentionSlots = adjustments.filter((item) => item.teamId === teamId && item.year === seasonYear && item.kind === "retention").length;
    const buyoutSlots = adjustments.filter((item) => item.teamId === teamId && item.year === seasonYear && item.kind === "buyout").length;
    return { payroll, space: salaryCap - payroll, active: active.length, counts, missing, retentionSlots, buyoutSlots, invalidPositions, eligibilityReady, compliant: eligibilityReady && invalidPositions.length === 0 && payroll <= salaryCap && active.length <= rosterLimit && missing.length === 0 && retentionSlots <= 1 && buyoutSlots <= 2 };
  }
  const current = focusTeamId ? summary(focusTeamId, year) : null;
  const selectedTeam = teams.find((team) => team.id === focusTeamId);
  const standingsTeams = useMemo(() => teams.map((team) => {
    const teamRows = baseRows.filter((row) => row.fantasy_team_id === team.id && row.season_year === CURRENT_LEAGUE_SEASON);
    const points = activePositions.reduce((total, code) => {
      const limit = minimums[code];
      const scores = teamRows.filter((row) => position(row) === code).map((row) => playerProduction(row).points).sort((a, b) => b - a);
      return total + scores.slice(0, limit).reduce((sum, score) => sum + score, 0);
    }, 0);
    return { team, points };
  }).sort((a, b) => b.points - a.points || a.team.id - b.team.id).map((item, index) => ({ ...item, rank: index + 1 })), [teams, baseRows, playerProduction]);
  const makeRosterGroups = (codes: readonly string[]) => codes.map((code) => ({ code, players: focusRows.filter((row) => position(row) === code) })).filter((group) => group.players.length);
  const positionPlayerGroups = makeRosterGroups(["C", "1B", "2B", "SS", "3B", "OF", "DH"]);
  const pitcherGroups = makeRosterGroups(["SP", "RP"]);
  const statusGroups = makeRosterGroups(["W", "IR", "LTIR", "RFA"]);
  const rosterGroups = [...positionPlayerGroups, ...pitcherGroups, ...statusGroups];
  function productionLabel(row: PlayerSeasonWithRelations) { const item = playerProduction(row); return `${formatFantasyPoints(item.points)} FPTS · ${item.gamesPlayed ? formatFantasyPoints(item.points / item.gamesPlayed) : "—"} FPPG`; }
  function changed(row: LabRow) {
    if (row.labKey.startsWith("lab-")) return true;
    const original = baseRows.find((item) => item.labKey === row.labKey);
    return !original || original.fantasy_team_id !== row.fantasy_team_id || original.position !== row.position || original.salary !== row.salary;
  }
  function rosterTable(title: string, groups: { code: string; players: LabRow[] }[], hideHeader = false) {
    const players = groups.flatMap((group) => group.players);
    return <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      {!hideHeader && <div className="flex items-center justify-between bg-gray-50 px-3 py-2 dark:bg-gray-900"><h3 className="text-xs font-bold text-gray-800 dark:text-gray-200">{title}</h3><span className="text-[10px] tabular-nums text-gray-400">{players.length} players</span></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left text-xs"><caption className="sr-only">{title} for {selectedTeam?.team_name} in {year}</caption>
        <thead className="border-y border-gray-200 text-[9px] uppercase tracking-wide text-gray-400 dark:border-gray-800"><tr><th scope="col" className="px-3 py-2 font-semibold">{title === "Position Players" ? "Pos / Eligible" : "Pos"}</th><th scope="col" className="px-3 py-2 font-semibold">Player</th>{["Cap hit", "Thru", "FPTS", "PPG"].map((label) => <th key={label} scope="col" className="px-2 py-2 text-right font-semibold">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{players.map((row) => {
          const item = playerProduction(row);
          const apiId = row.player?.player_api_id;
          const nameClass = "font-semibold text-gray-800 dark:text-gray-100";
          return <tr key={row.labKey} className={changed(row) ? "bg-emerald-50 dark:bg-emerald-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"}>
            <td className="px-3 py-2 text-[10px] font-bold text-gray-500">{title === "Position Players" ? <PlayerPositionEligibility position={position(row)} positions={eligibility.positions.get(Number(apiId))} loading={eligibility.loading} error={eligibility.error} /> : position(row)}</td>
            <td className="whitespace-nowrap px-3 py-2">{apiId ? <Link to={`/baseball-player-profile?playerId=${apiId}&type=${["SP", "RP"].includes(playerPosition(row)) ? "pitching" : "hitting"}`} className={`${nameClass} hover:text-brand-500 hover:underline`}>{playerName(row)}</Link> : <span className={nameClass}>{playerName(row)}</span>}{changed(row) && <span title="Changed in this scenario" className="ml-1 text-emerald-600">●</span>}</td>
            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{money.format(row.salary || 0)}</td>
            <td className="px-2 py-2 text-right tabular-nums text-gray-400">{row.term_end_year ?? "—"}</td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums text-brand-500">{formatFantasyPoints(item.points)}</td>
            <td className="px-2 py-2 text-right tabular-nums text-gray-500">{item.gamesPlayed ? formatFantasyPoints(item.points / item.gamesPlayed) : "—"}</td>
          </tr>;
        })}{!players.length && <tr><td colSpan={6} className="px-3 py-5 text-center text-gray-400">No players</td></tr>}</tbody>
      </table></div>
    </section>;
  }

  if (loading) return <div className="grid gap-4"><div className="h-44 animate-pulse rounded-3xl bg-gray-200 dark:bg-gray-800" /><div className="h-96 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" /></div>;
  return <div>
    <PageMeta title="Roster Lab | Front Office Baseball" description="Private baseball roster and cap move simulator" />
    <PageBreadcrumb pageTitle="Roster Lab" />
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-950 p-6 text-white shadow-xl sm:p-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Private sandbox</p><div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black">Roster Lab</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Experiment with trades, retention, buyouts, roster designations, prospect call-ups and signings. Your scenario is saved in this browser until you reset it.</p></div><div className="flex gap-2"><button type="button" disabled={!history.length} onClick={undo} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold disabled:opacity-40">Undo</button><button type="button" disabled={!history.length && !scenarioDirty} onClick={reset} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">Clear Lab</button></div></div></section>
      {error && <p className="rounded-xl border border-error-200 bg-error-50 p-4 text-error-700">{error}</p>}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-black uppercase text-gray-500">Focus Team<select value={focusTeamId ?? ""} onChange={(event) => setFocusTeamId(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold dark:border-gray-700 dark:bg-gray-900">{teams.map((team) => <option key={team.id} value={team.id}>{team.team_name}</option>)}</select></label><label className="text-xs font-black uppercase text-gray-500">Starting Season<select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold dark:border-gray-700 dark:bg-gray-900">{years.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        {current && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><SummaryMetric label="Payroll" value={money.format(current.payroll)} detail={`${money.format(salaryCap)} cap`} danger={current.space < 0} /><SummaryMetric label={current.space < 0 ? "Over Cap" : "Cap Space"} value={money.format(Math.abs(current.space))} detail={`Season ${year}`} danger={current.space < 0} /><SummaryMetric label="Active Roster" value={`${current.active} / ${rosterLimit}`} detail={current.missing.length ? current.missing.join(" · ") : "Position minimums met"} danger={current.active > rosterLimit || Boolean(current.missing.length)} /><SummaryMetric label="Retention Slots" value={`${current.retentionSlots} / 1`} detail="Active retained contracts" danger={current.retentionSlots > 1} /><SummaryMetric label="Buyout Slots" value={`${current.buyoutSlots} / 2`} detail="Active buyout penalties" danger={current.buyoutSlots > 2} /><SummaryMetric label="Compliance" value={current.compliant ? "PASS" : "CHECK"} detail={current.compliant ? "Cap, size, position eligibility and move limits are legal" : "Review highlighted limits"} danger={!current.compliant} /></div>}
        {current && !current.eligibilityReady && <p className="mt-3 text-xs text-gray-500">{eligibility.loading ? "Checking position eligibility…" : eligibility.error}</p>}
        {current && current.invalidPositions.length > 0 && <p className="mt-3 text-xs text-warning-700 dark:text-warning-300">Position eligibility needs attention: {current.invalidPositions.map((row) => `${playerName(row)} (${position(row)})`).join(" · ")}. Use Mock Move to choose an eligible position.</p>}
      </section>

      <details open className="group overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3"><div><h2 className="text-base font-bold text-gray-900 dark:text-white">{selectedTeam?.team_name || "Team"} · {year} Roster</h2><p className="mt-0.5 text-[10px] text-gray-400">Production from {CURRENT_LEAGUE_SEASON - 1} · Ordered by position, then fantasy points</p></div><span className="text-xs text-gray-400 group-open:hidden">Show roster</span><span className="hidden text-xs text-gray-400 group-open:inline">Collapse</span></summary>
        <div className="border-t border-gray-100 p-3 dark:border-gray-800">{rosterGroups.length ? <><div className="grid items-start gap-3 lg:grid-cols-2">{rosterTable("Position Players", positionPlayerGroups)}{rosterTable("Pitchers", pitcherGroups)}</div>{statusGroups.length > 0 && <details open className="group/inactive mt-3"><summary className="flex cursor-pointer list-none items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-900"><span className="font-bold text-gray-800 dark:text-gray-200">Inactive &amp; Contract Designations <span className="ml-2 font-normal text-gray-400">({statusGroups.reduce((total, group) => total + group.players.length, 0)})</span></span><span className="text-gray-400 group-open/inactive:hidden">Show</span><span className="hidden text-gray-400 group-open/inactive:inline">Collapse</span></summary>{rosterTable("Inactive & Contract Designations", statusGroups, true)}</details>}</> : <p className="py-5 text-center text-sm text-gray-500">No rostered players for this season.</p>}<p className="mt-2 text-[10px] text-gray-400"><span className="text-emerald-600">●</span> Changed in this scenario</p></div>
      </details>

      <TargetsPanel eligibility={eligibility} production={production} statsSeason={CURRENT_LEAGUE_SEASON - 1} list={targets} availableIds={new Set(signingRows.map((row) => row.player?.player_api_id || ""))} onPlan={(target) => { setMode("signing"); setPendingTarget(target); }} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <section id="mock-move" className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><div><p className="text-[10px] font-black uppercase tracking-wider text-brand-500">Build a scenario</p><h2 className="text-xl font-black text-gray-900 dark:text-white">Mock Move</h2></div><div className="mt-4 flex flex-wrap gap-2">{(["status","trade","buyout","callup","signing","rfa"] as ActionMode[]).map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-lg px-3 py-2 text-xs font-black capitalize ${mode === item ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>{item === "status" ? "IR / LTIR / Waivers" : item === "callup" ? "Prospect Call-Up" : item === "rfa" ? "Retain RFA" : item}</button>)}</div>
          <div className="mt-5 space-y-4">{mode === "signing" && <label className="block text-xs font-bold uppercase text-gray-500">Signing Class<select value={signingClass} onChange={(event) => setSigningClass(event.target.value as "ALL" | "UFA" | "RFA")} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="ALL">All available UFAs and RFAs</option><option value="UFA">UFA only</option><option value="RFA">Other teams’ RFAs only</option></select><span className="mt-1 block text-[10px] font-semibold normal-case text-gray-400">Your own RFAs are hidden here; use Retain RFA for those players.</span></label>}<label className="block text-xs font-bold uppercase text-gray-500">{mode === "signing" ? "Available Player" : mode === "callup" ? `${selectedTeam?.abbreviation || "Team"} Prospect` : mode === "trade" ? `${teamName(tradeSourceTeamId)} Player` : `${selectedTeam?.abbreviation || "Team"} Player`}<select value={playerKey} onChange={(event) => setPlayerKey(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="">Choose a player…</option>{selectableRows.map((row) => <option key={row.labKey} value={row.labKey}>{mode === "signing" ? `${position(row) === "RFA" ? "RFA" : "UFA"} · ${playerProduction(row).position || playerPosition(row)}` : playerPosition(row)} · {playerName(row)} · {productionLabel(row)} · {money.format(row.salary || 0)}</option>)}</select><span className="mt-1 block text-[10px] font-semibold normal-case text-gray-400">Ordered by position, then current-season fantasy points.</span></label>
            {selected && mode === "signing" && <div className="flex items-center gap-2 text-sm text-gray-500"><TargetButton list={targets} player={{ player_api_id: selected.player?.player_api_id || "", player_name: playerName(selected), position: playerPosition(selected), stat_group: ["SP", "RP"].includes(playerPosition(selected)) ? "pitching" : "hitting" }} />Favorite this player</div>}
            {selected && <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900"><p className="mb-2 text-xs font-bold text-gray-500">Eligible positions · {year} / {year - 1}</p><MlbEligibilityBadges positions={selectedPositions} loading={eligibility.loading} error={eligibility.error} /><p className="mt-2 text-[10px] text-gray-400">5 field-position games · 10 DH games · 5 starts · 5 relief appearances in either season.</p></div>}
            {mode === "status" && <label className="block text-xs font-bold uppercase text-gray-500">New Designation<select value={[...selectedPositions, "W", "IR", "LTIR"].some((position) => position === newStatus) ? newStatus : ""} onChange={(event) => setNewStatus(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="">Choose a designation…</option>{[...selectedPositions,"W","IR","LTIR"].map((item) => <option key={item}>{item}</option>)}</select></label>}
            {mode === "trade" && <><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold uppercase text-gray-500">Trading From<select value={tradeSourceTeamId ?? ""} onChange={(event) => { const sourceId = Number(event.target.value); setTradeSourceTeamId(sourceId); setDestinationTeamId(focusTeamId !== sourceId ? focusTeamId : teams.find((team) => team.id !== sourceId)?.id || null); }} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">{teams.map((team) => <option key={team.id} value={team.id}>{team.team_name}</option>)}</select></label><label className="block text-xs font-bold uppercase text-gray-500">Trading To<select value={destinationTeamId ?? ""} onChange={(event) => setDestinationTeamId(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">{teams.filter((team) => team.id !== tradeSourceTeamId).map((team) => <option key={team.id} value={team.id}>{team.team_name}</option>)}</select></label></div><p className="text-xs font-semibold text-gray-500">Choose another franchise above to mock one of its players onto {selectedTeam?.team_name || "your roster"}.</p><label className="block text-xs font-bold uppercase text-gray-500">Salary Retained by {teamName(tradeSourceTeamId)}: {retentionPercent}%<input type="range" min="0" max="25" step="5" value={retentionPercent} onChange={(event) => setRetentionPercent(Number(event.target.value))} className="mt-2 w-full accent-brand-500" /></label></>}
            {(mode === "callup" || mode === "signing" || mode === "rfa") && <div className="grid grid-cols-3 gap-3"><label className="text-xs font-bold uppercase text-gray-500">Position<select value={newPosition} onChange={(event) => setNewPosition(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="">Choose an eligible position…</option>{selectedPositions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-bold uppercase text-gray-500">Salary<input type="number" min="250000" step="50000" value={salary} onChange={(event) => setSalary(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900" /></label><label className="text-xs font-bold uppercase text-gray-500">Term<input type="number" min="1" max="5" value={term} onChange={(event) => setTerm(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900" /></label></div>}
            {mode === "rfa" && selected && <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs dark:border-violet-500/30 dark:bg-violet-500/10"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-violet-800 dark:text-violet-200">Previous salary: {previousRfaRow?.salary == null ? "Unavailable" : money.format(previousRfaRow.salary)} · 50% qualifying offer: <strong>{money.format(rfaQualifyingSalary)}</strong></span><button type="button" onClick={() => { setSalary(rfaQualifyingSalary); setTerm(1); }} className="rounded-lg bg-violet-600 px-3 py-1.5 font-black text-white">Use 1-year 50%</button></div><p className="mt-2 text-violet-600 dark:text-violet-300">Use the qualifying offer, or enter any placeholder salary and term up to five years.</p></div>}
            {mode === "rfa" && !rfaRows.length && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">No RFA rights are listed for this team in {year}.</p>}
            {mode === "buyout" && selected && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">The player is removed for all remaining recorded seasons. The Lab applies the league’s 30% / 40% / 50% penalty according to remaining term.</p>}
            {mode === "callup" && !prospectRows.length && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">No eligible prospect-rights records were found for this team as of {year}.</p>}
            <button type="button" disabled={!selected || !validPosition || (["signing", "callup", "rfa"].includes(mode) && !validTargetEstimate(salary, term)) || (mode === "trade" && (!tradeSourceTeamId || !destinationTeamId || tradeSourceTeamId === destinationTeamId))} onClick={applyAction} className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Apply Mock Move</button></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-wider text-cyan-600">Current standings order · Lab impact for {year}</p><h2 className="text-xl font-black text-gray-900 dark:text-white">League Impact</h2></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900"><tr><th className="px-3 py-3">Rank</th><th className="px-3 py-3 text-left">Team</th><th className="px-3 py-3">Points</th><th className="px-3 py-3">Payroll</th><th className="px-3 py-3">Space</th><th className="px-3 py-3">Roster</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{standingsTeams.map(({ team, rank, points }) => { const item = summary(team.id, year); return <tr key={team.id} className={team.id === focusTeamId ? "bg-brand-50/60 dark:bg-brand-500/10" : ""}><td className="px-3 py-3 text-center font-black text-gray-500">#{rank}</td><td className="px-3 py-3"><button type="button" onClick={() => setFocusTeamId(team.id)} className="flex min-w-48 items-center gap-2 text-left font-bold text-gray-900 hover:text-brand-500 dark:text-white">{team.logo && <img src={team.logo} alt="" className="h-8 w-8 object-contain" />}{team.team_name}</button></td><td className="px-3 py-3 text-center font-black text-brand-600 dark:text-brand-300">{formatFantasyPoints(points)}</td><td className="px-3 py-3 text-center font-semibold">{money.format(item.payroll)}</td><td className={`px-3 py-3 text-center font-bold ${item.space < 0 ? "text-error-600" : "text-success-600"}`}>{item.space < 0 ? `−${money.format(Math.abs(item.space))}` : money.format(item.space)}</td><td className="px-3 py-3 text-center">{item.active}/{rosterLimit}</td><td className="px-3 py-3 text-center"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${item.compliant ? "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"}`}>{item.compliant ? "PASS" : "CHECK"}</span></td></tr>; })}</tbody></table></div></section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-wider text-violet-500">Five-year view</p><h2 className="text-xl font-black text-gray-900 dark:text-white">{selectedTeam?.team_name || "Team"} Projection</h2></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900"><tr><th className="px-3 py-3">Season</th><th className="px-3 py-3">Payroll</th><th className="px-3 py-3">Cap Space</th><th className="px-3 py-3">Active</th>{activePositions.map((code) => <th key={code} className="px-3 py-3">{code}</th>)}<th className="px-3 py-3">Compliance</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{years.filter((item) => item >= year).map((seasonYear) => { const item = focusTeamId ? summary(focusTeamId, seasonYear) : null; return item && <tr key={seasonYear}><td className="px-3 py-3 text-center font-black">{seasonYear}</td><td className="px-3 py-3 text-center">{money.format(item.payroll)}</td><td className={`px-3 py-3 text-center font-bold ${item.space < 0 ? "text-error-600" : "text-success-600"}`}>{money.format(item.space)}</td><td className="px-3 py-3 text-center">{item.active}/{rosterLimit}</td>{activePositions.map((code) => <td key={code} className={`px-3 py-3 text-center ${item.counts[code] < minimums[code] ? "font-bold text-warning-600" : ""}`}>{item.counts[code]}</td>)}<td className="px-3 py-3 text-center font-black">{item.compliant ? "✓" : "!"}</td></tr>; })}</tbody></table></div></section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Scenario history</p><h2 className="text-lg font-black text-gray-900 dark:text-white">{history.length} mock moves this session</h2></div></div>{history.length ? <ol className="mt-3 space-y-2">{history.map((snapshot, index) => <li key={`${snapshot.label}-${index}`} className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-gray-900"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{index + 1}</span><span className="font-semibold text-gray-700 dark:text-gray-200">{snapshot.label}</span></li>)}</ol> : <p className="mt-3 text-sm text-gray-500">{scenarioDirty ? "Your previously saved scenario has been restored. New moves made today will appear here." : "No mock moves yet. Changes will be saved in this browser until you choose Clear Lab."}</p>}</section>
    </div>
  </div>;
}
