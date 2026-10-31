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

function position(row: PlayerSeasonWithRelations) { return (row.position || "").toUpperCase(); }
function playerName(row: PlayerSeasonWithRelations) { return row.player?.full_name || [row.player?.first_name, row.player?.last_name].filter(Boolean).join(" ") || "Unknown player"; }
function normalizedName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function capForYear(_year: number) { return 47_000_000; }
function cloneRows(rows: LabRow[]) { return rows.map((row) => ({ ...row, player: row.player ? { ...row.player } : null, fantasy_team: row.fantasy_team ? { ...row.fantasy_team } : null })); }
function getBatterScore(record: MlbStatRecord) { return Number(record.stats.runs ?? 0) + Number(record.stats.hits ?? 0) + Number(record.stats.doubles ?? 0) + Number(record.stats.triples ?? 0) * 2 + Number(record.stats.homeRuns ?? 0) * 3 + Number(record.stats.rbi ?? 0) + Number(record.stats.stolenBases ?? 0) * 2; }
function getPitcherScore(record: MlbStatRecord) { return Number(record.stats.wins ?? 0) * 8 + Number(record.stats.strikeOuts ?? 0) + Number(record.stats.saves ?? 0) * 6 + Number(record.stats.completeGames ?? 0) * 5 + Number(record.stats.shutouts ?? 0) * 5; }

function SummaryMetric({ label, value, detail, danger }: { label: string; value: string; detail: string; danger?: boolean }) {
  return <div className={`rounded-xl border p-4 ${danger ? "border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10" : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p><p className={`mt-1 text-xl font-black ${danger ? "text-error-600 dark:text-error-300" : "text-gray-900 dark:text-white"}`}>{value}</p><p className="mt-1 text-[10px] font-medium text-gray-400">{detail}</p></div>;
}

export default function RosterLab() {
  const { user } = useAuth();
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
  const [mode, setMode] = useState<ActionMode>("status");
  const [playerKey, setPlayerKey] = useState("");
  const [tradeSourceTeamId, setTradeSourceTeamId] = useState<number | null>(null);
  const [destinationTeamId, setDestinationTeamId] = useState<number | null>(null);
  const [newStatus, setNewStatus] = useState("IR");
  const [newPosition, setNewPosition] = useState("C");
  const [retentionPercent, setRetentionPercent] = useState(0);
  const [salary, setSalary] = useState(750_000);
  const [term, setTerm] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    ]).then(([teamRows, seasonRows, prospectRights, mlbStats, financialRows, assignment]) => {
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
      setTeams(teamRows); setBaseRows(labRows); setRows(cloneRows(labRows)); setBaseAdjustments(financialAdjustments); setAdjustments(financialAdjustments);
      setRightsProspects(rightRows);
      const liveProduction = new Map<string, Production>();
      const namedProduction = new Map<string, Production>();
      const [hitters, pitchers] = mlbStats;
      hitters.forEach((record) => { const item = { points: getBatterScore(record), gamesPlayed: Number(record.stats.gamesPlayed ?? 0), position: record.position || "" }; if (record.playerId) liveProduction.set(String(record.playerId), item); namedProduction.set(normalizedName(record.playerName), item); });
      pitchers.forEach((record) => { const item = { points: getPitcherScore(record), gamesPlayed: Number(record.stats.gamesPlayed ?? 0), position: record.position || "P" }; if (record.playerId) liveProduction.set(String(record.playerId), item); namedProduction.set(normalizedName(record.playerName), item); });
      setProduction(liveProduction);
      setProductionByName(namedProduction);
      const preferred = assignment?.fantasy_team_id || teamRows[0]?.id || null;
      setFocusTeamId(preferred); setTradeSourceTeamId(preferred); setDestinationTeamId(teamRows.find((team) => team.id !== preferred)?.id || null);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to open the Roster Lab."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const playerProduction = useCallback((row: PlayerSeasonWithRelations) => production.get(row.player?.player_api_id || "") || productionByName.get(normalizedName(playerName(row))) || { points: 0, gamesPlayed: 0, position: "" }, [production, productionByName]);
  const playerPosition = useCallback((row: PlayerSeasonWithRelations) => { const code = position(row); return ["PROSPECT", "AP"].includes(code) ? playerProduction(row).position || (row.contract_group && row.contract_group !== "PROSPECT_RIGHTS" ? row.contract_group : code) : code; }, [playerProduction]);
  const comparePlayers = useCallback((a: PlayerSeasonWithRelations, b: PlayerSeasonWithRelations) => { const positionDifference = positionOrder.indexOf(playerPosition(a)) - positionOrder.indexOf(playerPosition(b)); return positionDifference || playerProduction(b).points - playerProduction(a).points || playerName(a).localeCompare(playerName(b)); }, [playerPosition, playerProduction]);
  const focusRows = useMemo(() => rows.filter((row) => row.fantasy_team_id === focusTeamId && row.season_year === year).sort(comparePlayers), [rows, focusTeamId, year, comparePlayers]);
  const freeAgents = useMemo(() => rows.filter((row) => !row.fantasy_team_id && row.season_year === year && row.player).sort(comparePlayers), [rows, year, comparePlayers]);
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
  const selectableRows = mode === "signing" ? freeAgents : mode === "trade" ? tradeRows : mode === "callup" ? prospectRows : mode === "rfa" ? rfaRows : focusRows;
  const selected = selectableRows.find((row) => row.labKey === playerKey) || null;
  const previousRfaRow = selected && mode === "rfa" ? rows.filter((row) => row.player_id === selected.player_id && row.season_year < year && row.salary != null).sort((a, b) => b.season_year - a.season_year)[0] : null;
  const rfaQualifyingSalary = Math.max(Math.round((previousRfaRow?.salary || 0) * 0.5), 500_000);

  useEffect(() => { setPlayerKey(""); }, [mode, focusTeamId, tradeSourceTeamId, year]);

  useEffect(() => {
    if (mode === "callup") { setSalary(500_000); setTerm(3); }
    if (mode === "signing") { setSalary(750_000); setTerm(1); }
    if (mode === "rfa") { setTerm(1); }
  }, [mode]);

  useEffect(() => {
    if (mode !== "rfa" || !selected) return;
    const previous = rows.filter((row) => row.player_id === selected.player_id && row.season_year < year && row.salary != null).sort((a, b) => b.season_year - a.season_year)[0];
    setSalary(Math.max(Math.round((previous?.salary || 0) * 0.5), 500_000));
    const resolvedPosition = playerProduction(selected).position.toUpperCase();
    setNewPosition(activeSet.has(resolvedPosition) ? resolvedPosition : "DH");
  }, [mode, selected, rows, year, playerProduction]);

  useEffect(() => {
    setTradeSourceTeamId(focusTeamId);
    setDestinationTeamId(teams.find((team) => team.id !== focusTeamId)?.id || null);
  }, [focusTeamId, teams]);

  function remember(label: string) { setHistory((current) => [...current, { rows: cloneRows(rows), adjustments: adjustments.map((item) => ({ ...item })), label }]); }
  function teamName(id: number | null) { return teams.find((team) => team.id === id)?.team_name || "Team"; }

  function applyAction() {
    if (!selected || !focusTeamId) return;
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
  function reset() { setRows(cloneRows(baseRows)); setAdjustments(baseAdjustments.map((item) => ({ ...item }))); setHistory([]); }

  function summary(teamId: number, seasonYear: number) {
    const teamRows = rows.filter((row) => row.fantasy_team_id === teamId && row.season_year === seasonYear);
    const active = teamRows.filter((row) => activeSet.has(position(row)));
    const payroll = teamRows.filter((row) => capSet.has(position(row))).reduce((sum, row) => sum + (row.salary || 0), 0) + adjustments.filter((item) => item.teamId === teamId && item.year === seasonYear).reduce((sum, item) => sum + item.amount, 0);
    const counts = Object.fromEntries(activePositions.map((code) => [code, active.filter((row) => position(row) === code).length])) as Record<string, number>;
    const missing = activePositions.filter((code) => counts[code] < minimums[code]).map((code) => `${code} ${counts[code]}/${minimums[code]}`);
    const retentionSlots = adjustments.filter((item) => item.teamId === teamId && item.year === seasonYear && item.kind === "retention").length;
    const buyoutSlots = adjustments.filter((item) => item.teamId === teamId && item.year === seasonYear && item.kind === "buyout").length;
    return { payroll, space: capForYear(seasonYear) - payroll, active: active.length, counts, missing, retentionSlots, buyoutSlots, compliant: payroll <= capForYear(seasonYear) && active.length <= rosterLimit && missing.length === 0 && retentionSlots <= 1 && buyoutSlots <= 2 };
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
  function rosterGroupCard({ code, players }: { code: string; players: LabRow[] }) {
    return <div key={code} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950/40"><div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900"><span className="flex items-center gap-2 text-xs font-black text-gray-700 dark:text-gray-200"><span className={`h-2 w-2 rounded-full ${code === "SP" || code === "RP" ? "bg-cyan-500" : "bg-emerald-500"}`} />{code === "W" ? "Waivers" : code}</span><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-gray-400 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">{players.length}</span></div><div className="divide-y divide-gray-100 dark:divide-gray-800">{players.map((row) => <div key={row.labKey} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${changed(row) ? "bg-emerald-50 dark:bg-emerald-500/10" : ""}`}><span className="min-w-0"><span className="block truncate text-xs font-bold text-gray-800 dark:text-gray-100">{playerName(row)}{changed(row) && <span className="ml-1 text-emerald-600">●</span>}</span><span className="mt-0.5 block text-[9px] font-bold text-brand-500">{productionLabel(row)}</span></span><span className="shrink-0 rounded-md bg-gray-50 px-1.5 py-1 text-[10px] font-semibold text-gray-500 dark:bg-gray-900 dark:text-gray-400">{money.format(row.salary || 0)}</span></div>)}</div></div>;
  }

  if (loading) return <div className="grid gap-4"><div className="h-44 animate-pulse rounded-3xl bg-gray-200 dark:bg-gray-800" /><div className="h-96 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" /></div>;
  return <div>
    <PageMeta title="Roster Lab | Front Office Baseball" description="Private baseball roster and cap move simulator" />
    <PageBreadcrumb pageTitle="Roster Lab" />
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-950 p-6 text-white shadow-xl sm:p-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Private sandbox</p><div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black">Roster Lab</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Experiment with trades, retention, buyouts, roster designations, prospect call-ups and signings. Nothing here changes the real league.</p></div><div className="flex gap-2"><button type="button" disabled={!history.length} onClick={undo} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold disabled:opacity-40">Undo</button><button type="button" disabled={!history.length} onClick={reset} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">Reset Lab</button></div></div></section>
      {error && <p className="rounded-xl border border-error-200 bg-error-50 p-4 text-error-700">{error}</p>}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-black uppercase text-gray-500">Focus Team<select value={focusTeamId ?? ""} onChange={(event) => setFocusTeamId(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold dark:border-gray-700 dark:bg-gray-900">{teams.map((team) => <option key={team.id} value={team.id}>{team.team_name}</option>)}</select></label><label className="text-xs font-black uppercase text-gray-500">Starting Season<select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold dark:border-gray-700 dark:bg-gray-900">{years.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        {current && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><SummaryMetric label="Payroll" value={money.format(current.payroll)} detail={`${money.format(capForYear(year))} cap`} danger={current.space < 0} /><SummaryMetric label={current.space < 0 ? "Over Cap" : "Cap Space"} value={money.format(Math.abs(current.space))} detail={`Season ${year}`} danger={current.space < 0} /><SummaryMetric label="Active Roster" value={`${current.active} / ${rosterLimit}`} detail={current.missing.length ? current.missing.join(" · ") : "Position minimums met"} danger={current.active > rosterLimit || Boolean(current.missing.length)} /><SummaryMetric label="Retention Slots" value={`${current.retentionSlots} / 1`} detail="Active retained contracts" danger={current.retentionSlots > 1} /><SummaryMetric label="Buyout Slots" value={`${current.buyoutSlots} / 2`} detail="Active buyout penalties" danger={current.buyoutSlots > 2} /><SummaryMetric label="Compliance" value={current.compliant ? "PASS" : "CHECK"} detail={current.compliant ? "Cap, size, positions and move limits are legal" : "Review highlighted limits"} danger={!current.compliant} /></div>}
      </section>

      <details open className="group overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Projected roster · {year}</p><h2 className="text-xl font-black text-gray-900 dark:text-white">{selectedTeam?.team_name || "Team"}</h2><p className="mt-1 text-[10px] font-bold text-gray-400">Production shown from {CURRENT_LEAGUE_SEASON - 1}</p></div><span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-black text-gray-500 group-open:hidden dark:bg-gray-800">Show roster</span><span className="hidden rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-black text-gray-500 group-open:inline dark:bg-gray-800">Collapse</span></summary><div className="border-t border-gray-100 p-4 dark:border-gray-800">{rosterGroups.length ? <><div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]"><section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/[0.04]"><div className="mb-3 flex items-center justify-between px-1"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">Batting order</p><h3 className="text-sm font-black text-gray-900 dark:text-white">Position Players</h3></div><span className="text-xs font-black text-emerald-700 dark:text-emerald-300">{positionPlayerGroups.reduce((total, group) => total + group.players.length, 0)}</span></div>{positionPlayerGroups.length ? <div className="grid gap-3 sm:grid-cols-2">{positionPlayerGroups.map(rosterGroupCard)}</div> : <p className="rounded-xl border border-dashed border-emerald-200 py-8 text-center text-xs text-gray-500 dark:border-emerald-500/20">No position players</p>}</section><section className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-3 dark:border-cyan-500/20 dark:bg-cyan-500/[0.04]"><div className="mb-3 flex items-center justify-between px-1"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-400">Pitching staff</p><h3 className="text-sm font-black text-gray-900 dark:text-white">Pitchers</h3></div><span className="text-xs font-black text-cyan-700 dark:text-cyan-300">{pitcherGroups.reduce((total, group) => total + group.players.length, 0)}</span></div>{pitcherGroups.length ? <div className="space-y-3">{pitcherGroups.map(rosterGroupCard)}</div> : <p className="rounded-xl border border-dashed border-cyan-200 py-8 text-center text-xs text-gray-500 dark:border-cyan-500/20">No pitchers</p>}</section></div>{statusGroups.length > 0 && <section className="mt-4"><p className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Inactive &amp; contract designations</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statusGroups.map(rosterGroupCard)}</div></section>}</> : <p className="py-5 text-center text-sm text-gray-500">No rostered players for this season.</p>}<p className="mt-3 text-[10px] font-semibold text-gray-400">Position players run C through DH on the left; pitchers run SP then RP on the right · Players are ordered by {CURRENT_LEAGUE_SEASON - 1} fantasy points within each position · <span className="text-emerald-600">●</span> changed in this scenario</p></div></details>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><div><p className="text-[10px] font-black uppercase tracking-wider text-brand-500">Build a scenario</p><h2 className="text-xl font-black text-gray-900 dark:text-white">Mock Move</h2></div><div className="mt-4 flex flex-wrap gap-2">{(["status","trade","buyout","callup","signing","rfa"] as ActionMode[]).map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-lg px-3 py-2 text-xs font-black capitalize ${mode === item ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>{item === "status" ? "IR / LTIR / Waivers" : item === "callup" ? "Prospect Call-Up" : item === "rfa" ? "Retain RFA" : item}</button>)}</div>
          <div className="mt-5 space-y-4"><label className="block text-xs font-bold uppercase text-gray-500">{mode === "signing" ? "Available Player" : mode === "callup" ? `${selectedTeam?.abbreviation || "Team"} Prospect` : mode === "trade" ? `${teamName(tradeSourceTeamId)} Player` : `${selectedTeam?.abbreviation || "Team"} Player`}<select value={playerKey} onChange={(event) => setPlayerKey(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="">Choose a player…</option>{selectableRows.map((row) => <option key={row.labKey} value={row.labKey}>{playerPosition(row)} · {playerName(row)} · {productionLabel(row)} · {money.format(row.salary || 0)}</option>)}</select><span className="mt-1 block text-[10px] font-semibold normal-case text-gray-400">Ordered by position, then current-season fantasy points.</span></label>
            {mode === "status" && <label className="block text-xs font-bold uppercase text-gray-500">New Designation<select value={newStatus} onChange={(event) => setNewStatus(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">{[...activePositions,"W","IR","LTIR"].map((item) => <option key={item}>{item}</option>)}</select></label>}
            {mode === "trade" && <><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold uppercase text-gray-500">Trading From<select value={tradeSourceTeamId ?? ""} onChange={(event) => { const sourceId = Number(event.target.value); setTradeSourceTeamId(sourceId); setDestinationTeamId(focusTeamId !== sourceId ? focusTeamId : teams.find((team) => team.id !== sourceId)?.id || null); }} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">{teams.map((team) => <option key={team.id} value={team.id}>{team.team_name}</option>)}</select></label><label className="block text-xs font-bold uppercase text-gray-500">Trading To<select value={destinationTeamId ?? ""} onChange={(event) => setDestinationTeamId(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">{teams.filter((team) => team.id !== tradeSourceTeamId).map((team) => <option key={team.id} value={team.id}>{team.team_name}</option>)}</select></label></div><p className="text-xs font-semibold text-gray-500">Choose another franchise above to mock one of its players onto {selectedTeam?.team_name || "your roster"}.</p><label className="block text-xs font-bold uppercase text-gray-500">Salary Retained by {teamName(tradeSourceTeamId)}: {retentionPercent}%<input type="range" min="0" max="25" step="5" value={retentionPercent} onChange={(event) => setRetentionPercent(Number(event.target.value))} className="mt-2 w-full accent-brand-500" /></label></>}
            {(mode === "callup" || mode === "signing" || mode === "rfa") && <div className="grid grid-cols-3 gap-3"><label className="text-xs font-bold uppercase text-gray-500">Position<select value={newPosition} onChange={(event) => setNewPosition(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900">{activePositions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-bold uppercase text-gray-500">Salary<input type="number" min="500000" step="50000" value={salary} onChange={(event) => setSalary(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900" /></label><label className="text-xs font-bold uppercase text-gray-500">Term<input type="number" min="1" max="5" value={term} onChange={(event) => setTerm(Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900" /></label></div>}
            {mode === "rfa" && selected && <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs dark:border-violet-500/30 dark:bg-violet-500/10"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-violet-800 dark:text-violet-200">Previous salary: {previousRfaRow?.salary == null ? "Unavailable" : money.format(previousRfaRow.salary)} · 50% qualifying offer: <strong>{money.format(rfaQualifyingSalary)}</strong></span><button type="button" onClick={() => { setSalary(rfaQualifyingSalary); setTerm(1); }} className="rounded-lg bg-violet-600 px-3 py-1.5 font-black text-white">Use 1-year 50%</button></div><p className="mt-2 text-violet-600 dark:text-violet-300">Use the qualifying offer, or enter any placeholder salary and term up to five years.</p></div>}
            {mode === "rfa" && !rfaRows.length && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">No RFA rights are listed for this team in {year}.</p>}
            {mode === "buyout" && selected && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">The player is removed for all remaining recorded seasons. The Lab applies the league’s 30% / 40% / 50% penalty according to remaining term.</p>}
            {mode === "callup" && !prospectRows.length && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">No eligible prospect-rights records were found for this team as of {year}.</p>}
            <button type="button" disabled={!selected || (mode === "trade" && (!tradeSourceTeamId || !destinationTeamId || tradeSourceTeamId === destinationTeamId))} onClick={applyAction} className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Apply Mock Move</button></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-wider text-cyan-600">Current standings order · Lab impact for {year}</p><h2 className="text-xl font-black text-gray-900 dark:text-white">League Impact</h2></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900"><tr><th className="px-3 py-3">Rank</th><th className="px-3 py-3 text-left">Team</th><th className="px-3 py-3">Points</th><th className="px-3 py-3">Payroll</th><th className="px-3 py-3">Space</th><th className="px-3 py-3">Roster</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{standingsTeams.map(({ team, rank, points }) => { const item = summary(team.id, year); return <tr key={team.id} className={team.id === focusTeamId ? "bg-brand-50/60 dark:bg-brand-500/10" : ""}><td className="px-3 py-3 text-center font-black text-gray-500">#{rank}</td><td className="px-3 py-3"><button type="button" onClick={() => setFocusTeamId(team.id)} className="flex min-w-48 items-center gap-2 text-left font-bold text-gray-900 hover:text-brand-500 dark:text-white">{team.logo && <img src={team.logo} alt="" className="h-8 w-8 object-contain" />}{team.team_name}</button></td><td className="px-3 py-3 text-center font-black text-brand-600 dark:text-brand-300">{formatFantasyPoints(points)}</td><td className="px-3 py-3 text-center font-semibold">{money.format(item.payroll)}</td><td className={`px-3 py-3 text-center font-bold ${item.space < 0 ? "text-error-600" : "text-success-600"}`}>{item.space < 0 ? `−${money.format(Math.abs(item.space))}` : money.format(item.space)}</td><td className="px-3 py-3 text-center">{item.active}/{rosterLimit}</td><td className="px-3 py-3 text-center"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${item.compliant ? "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"}`}>{item.compliant ? "PASS" : "CHECK"}</span></td></tr>; })}</tbody></table></div></section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-wider text-violet-500">Five-year view</p><h2 className="text-xl font-black text-gray-900 dark:text-white">{selectedTeam?.team_name || "Team"} Projection</h2></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900"><tr><th className="px-3 py-3">Season</th><th className="px-3 py-3">Payroll</th><th className="px-3 py-3">Cap Space</th><th className="px-3 py-3">Active</th>{activePositions.map((code) => <th key={code} className="px-3 py-3">{code}</th>)}<th className="px-3 py-3">Compliance</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{years.filter((item) => item >= year).map((seasonYear) => { const item = focusTeamId ? summary(focusTeamId, seasonYear) : null; return item && <tr key={seasonYear}><td className="px-3 py-3 text-center font-black">{seasonYear}</td><td className="px-3 py-3 text-center">{money.format(item.payroll)}</td><td className={`px-3 py-3 text-center font-bold ${item.space < 0 ? "text-error-600" : "text-success-600"}`}>{money.format(item.space)}</td><td className="px-3 py-3 text-center">{item.active}/{rosterLimit}</td>{activePositions.map((code) => <td key={code} className={`px-3 py-3 text-center ${item.counts[code] < minimums[code] ? "font-bold text-warning-600" : ""}`}>{item.counts[code]}</td>)}<td className="px-3 py-3 text-center font-black">{item.compliant ? "✓" : "!"}</td></tr>; })}</tbody></table></div></section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Scenario history</p><h2 className="text-lg font-black text-gray-900 dark:text-white">{history.length} mock moves</h2></div></div>{history.length ? <ol className="mt-3 space-y-2">{history.map((snapshot, index) => <li key={`${snapshot.label}-${index}`} className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-gray-900"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{index + 1}</span><span className="font-semibold text-gray-700 dark:text-gray-200">{snapshot.label}</span></li>)}</ol> : <p className="mt-3 text-sm text-gray-500">No mock moves yet. Your scenario stays only in this browser session.</p>}</section>
    </div>
  </div>;
}
