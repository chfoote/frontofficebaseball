import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchFantasyPlayerByApiId, fetchPlayerSeasonsByPlayer, type FantasyPlayer, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { fetchNhlPlayerLanding, fetchNhlPlayerSeasonStats, formatFantasyPoints, formatNhlStat, getGoalieScore, getSkaterScore, type NhlGoalieRecord, type NhlPlayerLanding, type NhlSkaterRecord } from "../../lib/nhl";
import { fetchPlayerAwards, type PlayerAward } from "../../lib/awards";
import { fetchLeagueTransactions, type LeagueTransaction } from "../../lib/transactions";
import { applyTeamBranding, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import { CURRENT_LEAGUE_SEASON, FIRST_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { TradeTransactionDetails } from "./Transactions";
import { usePlayerTradeInterest } from "../../hooks/usePlayerTradeInterest";
import PlayerInterestButton from "./PlayerInterestButton";
import { fetchPlayerLeadership } from "../../lib/teamLeadership";
import { fetchRecordBookData, type FranchiseStatLine, type ScoringLeader } from "../../lib/recordBook";
import PositionBadge from "../../components/hockey/PositionBadge";
import CountryFlagBadge from "../../components/hockey/CountryFlagBadge";
import PlayerAwardBadges from "./PlayerAwardBadges";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
function nhlSeasonId(year: number) { return (year - 1) * 10000 + year; }
function displayPosition(position?: string | null) { return position === "L" ? "LW" : position === "R" ? "RW" : position || "—"; }
function playerName(player: FantasyPlayer | null, landing: NhlPlayerLanding | null) { return player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(" ") || [landing?.firstName?.default, landing?.lastName?.default].filter(Boolean).join(" ") || "Unknown Player"; }
function ageOn(date?: string) { if (!date) return null; const birth = new Date(`${date}T00:00:00`); const today = new Date(); let age = today.getFullYear() - birth.getFullYear(); if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1; return age; }
function formatDate(date: string) { return new Date(`${date}T00:00:00`).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }); }
function actionLabel(action: string) { return action.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase()); }

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70"><p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p><div className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">{value || "—"}</div></div>;
}

function LeadershipSeasonBadge({ role }: { role?: "C" | "A" }) {
  if (!role) return null;
  const label = role === "C" ? "Captain" : "Assistant Captain";
  return <span title={label} aria-label={label} className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black ring-1 ${role === "C" ? "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300" : "bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-500/15 dark:text-sky-300"}`}>{role}</span>;
}

function SkaterStats({ record, season }: { record: NhlSkaterRecord; season: number }) {
  const score = getSkaterScore(record);
  const values = [record.gamesPlayed, record.goals, record.assists, record.plusMinus, record.penaltyMinutes, record.ppGoals, record.ppPoints-record.ppGoals, record.shGoals, record.shPoints-record.shGoals, record.gameWinningGoals, record.shots, record.blockedShots, record.hits, record.totalFaceoffWins];
  return <StatsTable title={`Skater Stats · ${season}`} headings={["GP","G","A","+/-","PIM","PPG","PPA","SHG","SHA","GWG","S","B","H","FOW","SCORE","FPPG"]} values={[...values, formatFantasyPoints(score), record.gamesPlayed ? formatFantasyPoints(score/record.gamesPlayed) : "—"]} />;
}

function GoalieStats({ record, season }: { record: NhlGoalieRecord; season: number }) {
  const score = getGoalieScore(record);
  return <StatsTable title={`Goalie Stats · ${season}`} headings={["GP","GS","W","L","OTL","GA","SV","SO","PIM","G","A","SV%","GAA","SCORE","FPPG"]} values={[record.gamesPlayed,record.gamesStarted,record.wins,record.losses,record.otLosses,record.goalsAgainst,record.saves,record.shutouts,record.penaltyMinutes,record.goals,record.assists,record.savePct?.toFixed(3) ?? "—",formatNhlStat(record.goalsAgainstAverage,2),formatFantasyPoints(score),record.gamesPlayed ? formatFantasyPoints(score/record.gamesPlayed) : "—"]} />;
}

type HistoricalStats = { season: number; skater: NhlSkaterRecord | null; goalie: NhlGoalieRecord | null };

function SeasonHistory({ rows, seasons, awards, leadership }: { rows: HistoricalStats[]; seasons: PlayerSeasonWithRelations[]; awards: PlayerAward[]; leadership: Map<number, "C" | "A"> }) {
  if (!rows.length) return null;
  const goalieHistory = rows.some((row) => row.goalie);
  const headings = goalieHistory
    ? ["Season", "Fantasy Team", "GP", "GS", "W", "L", "OTL", "GA", "SV", "SO", "PIM", "G", "A", "SV%", "GAA", "FPTS", "FPPG", "Awards"]
    : ["Season", "Fantasy Team", "GP", "G", "A", "+/-", "PIM", "PPG", "PPA", "SHG", "SHA", "GWG", "S", "BLK", "HIT", "FOW", "FPTS", "FPPG", "Awards"];
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-500">GLDHL history</p><h2 className="mt-1 text-lg font-black text-gray-900 dark:text-white">Previous League Seasons</h2><p className="mt-1 text-xs text-gray-500">Most recent season first · swipe horizontally on mobile.</p></div>
    <div className="overflow-x-auto"><table className="min-w-full whitespace-nowrap text-xs"><thead className="border-b border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900/70"><tr>{headings.map((heading, index) => <th key={heading} className={`${index < 2 ? "text-left" : "text-center"} px-3 py-3 font-black uppercase tracking-wide`}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows.map((row) => {
      const fantasySeason = seasons.find((season) => season.season_year === row.season) || null;
      const seasonAwards = awards.filter((award) => award.season_year === row.season);
      const team = fantasySeason?.fantasy_team;
      const record = row.goalie || row.skater;
      const score = row.goalie ? getGoalieScore(row.goalie) : row.skater ? getSkaterScore(row.skater) : 0;
      const gp = record?.gamesPlayed || 0;
      const values = row.goalie
        ? [row.goalie.gamesPlayed, row.goalie.gamesStarted, row.goalie.wins, row.goalie.losses, row.goalie.otLosses, row.goalie.goalsAgainst, row.goalie.saves, row.goalie.shutouts, row.goalie.penaltyMinutes, row.goalie.goals, row.goalie.assists, row.goalie.savePct?.toFixed(3) ?? "—", formatNhlStat(row.goalie.goalsAgainstAverage, 2)]
        : row.skater
          ? [row.skater.gamesPlayed, row.skater.goals, row.skater.assists, row.skater.plusMinus, row.skater.penaltyMinutes, row.skater.ppGoals, row.skater.ppPoints - row.skater.ppGoals, row.skater.shGoals, row.skater.shPoints - row.skater.shGoals, row.skater.gameWinningGoals, row.skater.shots, row.skater.blockedShots, row.skater.hits, row.skater.totalFaceoffWins]
          : Array.from({ length: goalieHistory ? 13 : 14 }, () => "—");
      return <tr key={row.season} className="even:bg-gray-50/70 dark:even:bg-white/[0.02]"><td className="px-3 py-3 text-left text-sm font-black text-gray-900 dark:text-white">{row.season}</td><td className="px-3 py-3"><div className="flex items-center gap-2">{team?.logo && <img src={team.logo} alt="" className="h-7 w-7 object-contain" />}<div><div className="flex items-center gap-2"><p className="font-bold text-gray-800 dark:text-gray-200">{team?.abbreviation || "FA"}</p>{fantasySeason && <LeadershipSeasonBadge role={leadership.get(fantasySeason.id)} />}</div><p className="max-w-36 truncate text-[10px] text-gray-400">{team?.team_name || "Free Agent"}</p></div></div></td>{values.map((value, index) => <td key={index} className="px-3 py-3 text-center tabular-nums text-gray-600 dark:text-gray-300">{value}</td>)}<td className="bg-brand-50/60 px-3 py-3 text-center font-black tabular-nums text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{record ? formatFantasyPoints(score) : "—"}</td><td className="bg-brand-50/60 px-3 py-3 text-center font-black tabular-nums text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{gp ? formatFantasyPoints(score / gp) : "—"}</td><td className="px-3 py-3">{seasonAwards.length ? <PlayerAwardBadges awards={seasonAwards} /> : <span className="text-gray-400">—</span>}</td></tr>;
    })}</tbody></table></div>
  </section>;
}

function StatsTable({ title, headings, values }: { title: string; headings: string[]; values: Array<string | number> }) {
  return <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><h2 className="border-b border-gray-200 px-4 py-3 font-semibold text-gray-800 dark:border-gray-800 dark:text-white/90">{title}</h2><div className="overflow-x-auto"><table className="min-w-full text-xs"><thead className="bg-gray-50 dark:bg-white/[0.03]"><tr>{headings.map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-2.5 text-center text-gray-500">{heading}</th>)}</tr></thead><tbody><tr>{values.map((value, index) => <td key={headings[index]} className={`px-3 py-3 text-center ${headings[index] === "SCORE" ? "font-bold text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300"}`}>{value}</td>)}</tr></tbody></table></div></section>;
}

function PlayerTransactionCard({ transaction, fallbackPosition }: { transaction: LeagueTransaction; fallbackPosition: string }) {
  if (transaction.trade_offer_id) return <article className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-5">
    <div className="absolute inset-y-0 left-0 w-1 bg-brand-500" />
    <div className="flex flex-col items-start gap-1"><span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">Trade</span><time className="text-xs font-medium text-gray-500">{formatDate(transaction.transaction_date)}</time></div>
    <TradeTransactionDetails transaction={transaction} />
    {transaction.notes && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">{transaction.notes}</p>}
  </article>;

  return <article className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
    <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: transaction.fantasy_team?.primary_color || "#465fff" }} />
    <div className="flex items-start gap-3">{transaction.fantasy_team?.logo && <Link to={`/teams/${transaction.fantasy_team.id}`} className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"><img src={transaction.fantasy_team.logo} alt={`${transaction.fantasy_team.team_name} logo`} className="h-full w-full object-contain" /></Link>}<div className="min-w-0 flex-1"><div className="flex flex-col items-start gap-1"><span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{actionLabel(transaction.action)}</span><time className="text-xs font-medium text-gray-500">{formatDate(transaction.transaction_date)}</time></div><p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{transaction.fantasy_team?.team_name || "Team"} · {transaction.position || fallbackPosition}{transaction.salary != null ? ` · ${money.format(transaction.salary)}` : ""}{transaction.term_end_year ? ` · ${transaction.term_end_year}` : ""}</p>{transaction.notes && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/[0.03]">{transaction.notes}</p>}</div></div>
  </article>;
}

const honourMonths = ["October", "November", "December", "January", "February", "March", "April"];

function PlayerTrophyCase({ awards }: { awards: PlayerAward[] }) {
  const [view, setView] = useState<"seasonal" | "monthly">("seasonal");
  const visible = awards.filter((assignment) => view === "monthly" ? assignment.is_monthly : !assignment.is_monthly);
  const icon = (assignment: PlayerAward) => assignment.award?.name.startsWith("Forward") ? "🏒" : assignment.award?.name.startsWith("Defenceman") ? "🛡️" : "🥅";
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Trophy Case</h2><div className="inline-flex rounded-lg border border-gray-300 p-1 dark:border-gray-700"><button type="button" onClick={() => setView("seasonal")} className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === "seasonal" ? "bg-amber-500 text-white" : "text-gray-500"}`}>Seasonal Awards</button><button type="button" onClick={() => setView("monthly")} className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === "monthly" ? "bg-amber-500 text-white" : "text-gray-500"}`}>Monthly Honours</button></div></div>{visible.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{visible.map((assignment) => <div key={assignment.id} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">{assignment.award?.image_url ? <img src={assignment.award.image_url} alt={assignment.award.name} className="h-12 w-12 object-contain" /> : <span className="text-3xl">{assignment.is_monthly ? icon(assignment) : "🏆"}</span>}<div><p className="font-semibold text-amber-900 dark:text-amber-200">{assignment.award?.name || "Award"}</p><p className="text-xs text-amber-700 dark:text-amber-300">{assignment.is_monthly && assignment.month_index !== undefined ? `${honourMonths[assignment.month_index]} · ` : ""}Season {assignment.season_year}</p></div></div>)}</div> : <p className="mt-4 text-sm text-gray-500">{view === "monthly" ? "No monthly honours yet." : "No seasonal awards yet."}</p>}</section>;
}

function FranchiseScoringHistory({ rows }: { rows: ScoringLeader[] }) {
  const ordered = [...rows].sort((a, b) => b.fantasyPoints - a.fantasyPoints);
  const total = ordered.reduce((sum, row) => sum + row.fantasyPoints, 0);
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="flex flex-col gap-2 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-500">GLDHL Ownership History</p><h2 className="text-lg font-black text-gray-900 dark:text-white">Points by Franchise</h2><p className="mt-1 text-xs text-gray-500">Fantasy production is credited to the franchise that owned the player when it was earned.</p></div>{ordered.length > 0 && <p className="text-sm font-black text-brand-600 dark:text-brand-300">{formatFantasyPoints(total)} career FPTS</p>}</div>
    {ordered.length ? <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">{ordered.map((row) => {
      const current = row.team && row.currentTeam && row.team.id === row.currentTeam.id && row.team.team_name === row.currentTeam.team_name;
      const firstSeason = row.seasons[0]; const lastSeason = row.seasons[row.seasons.length - 1];
      return <article key={row.key} className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/70"><div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: row.team?.primary_color || "#465fff" }} /><div className="flex items-center gap-3">{row.team?.logo && <Link to={`/teams/${row.team.id}`} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white p-1 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"><img src={row.team.logo} alt={`${row.team.team_name} logo`} className="h-full w-full object-contain" /></Link>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link to={row.team ? `/teams/${row.team.id}` : "#"} className="truncate font-black text-gray-900 hover:text-brand-500 dark:text-white">{row.team?.team_name || "Unknown Franchise"}</Link>{current && <span className="rounded-full bg-success-100 px-2 py-0.5 text-[9px] font-black uppercase text-success-700 dark:bg-success-500/15 dark:text-success-300">Current</span>}</div><p className="mt-1 text-xs text-gray-500">{firstSeason === lastSeason ? firstSeason : `${firstSeason}–${lastSeason}`} · {row.gamesPlayed} GP</p></div></div><p className="mt-4 text-2xl font-black text-brand-600 dark:text-brand-300">{formatFantasyPoints(row.fantasyPoints)} <span className="text-[10px] font-black uppercase text-gray-400">FPTS</span></p></article>;
    })}</div> : <p className="p-5 text-sm text-gray-500">No franchise-attributed scoring has been recorded yet.</p>}
  </section>;
}

type PlayerRecordPlacement = { key: string; scope: "league" | "franchise"; label: string; rank: number; value: number; team: FantasyTeam | null; format: "number" | "decimal" | "percentage" };
type RecordMetric = { label: string; kind: "skater" | "goalie"; field: string; format?: PlayerRecordPlacement["format"]; lower?: boolean };

const playerRecordMetrics: RecordMetric[] = [
  { label: "Games Played", kind: "skater", field: "gamesPlayed" }, { label: "Goals", kind: "skater", field: "goals" }, { label: "Assists", kind: "skater", field: "assists" }, { label: "Points", kind: "skater", field: "points" },
  { label: "+/-", kind: "skater", field: "plusMinus" }, { label: "Penalty Minutes", kind: "skater", field: "penaltyMinutes" }, { label: "Shots", kind: "skater", field: "shots" }, { label: "Power-Play Goals", kind: "skater", field: "ppGoals" },
  { label: "Power-Play Assists", kind: "skater", field: "ppAssists" }, { label: "Short-Handed Goals", kind: "skater", field: "shGoals" }, { label: "Short-Handed Assists", kind: "skater", field: "shAssists" }, { label: "Game-Winning Goals", kind: "skater", field: "gameWinningGoals" },
  { label: "Blocked Shots", kind: "skater", field: "blockedShots" }, { label: "Hits", kind: "skater", field: "hits" }, { label: "Faceoff Wins", kind: "skater", field: "faceoffWins" }, { label: "Fantasy Score", kind: "skater", field: "fantasyPoints", format: "decimal" },
  { label: "Games Played", kind: "goalie", field: "gamesPlayed" }, { label: "Games Started", kind: "goalie", field: "gamesStarted" }, { label: "Wins", kind: "goalie", field: "wins" }, { label: "Losses", kind: "goalie", field: "losses" },
  { label: "Overtime Losses", kind: "goalie", field: "otLosses" }, { label: "Goals Against", kind: "goalie", field: "goalsAgainst" }, { label: "Saves", kind: "goalie", field: "saves" }, { label: "Shutouts", kind: "goalie", field: "shutouts" },
  { label: "Penalty Minutes", kind: "goalie", field: "penaltyMinutes" }, { label: "Goals", kind: "goalie", field: "goals" }, { label: "Assists", kind: "goalie", field: "assists" }, { label: "Save Percentage", kind: "goalie", field: "savePct", format: "percentage" },
  { label: "Goals-Against Average", kind: "goalie", field: "goalsAgainstAverage", format: "decimal", lower: true }, { label: "Fantasy Score", kind: "goalie", field: "fantasyPoints", format: "decimal" },
];

function recordMetricValue(lines: FranchiseStatLine[], metric: RecordMetric) {
  const eligible = lines.map((line) => line[metric.kind] as unknown as Record<string, number> | null).filter((row): row is Record<string, number> => Boolean(row));
  if (!eligible.length) return null;
  if (metric.field === "savePct") {
    const saves = eligible.reduce((sum, row) => sum + Number(row.saves || 0), 0);
    const goalsAgainst = eligible.reduce((sum, row) => sum + Number(row.goalsAgainst || 0), 0);
    return saves + goalsAgainst ? saves / (saves + goalsAgainst) : 0;
  }
  if (metric.field === "goalsAgainstAverage") {
    const games = eligible.reduce((sum, row) => sum + Number(row.gamesPlayed || 0), 0);
    return games ? eligible.reduce((sum, row) => sum + Number(row.goalsAgainstAverage || 0) * Number(row.gamesPlayed || 0), 0) / games : 0;
  }
  return eligible.reduce((sum, row) => sum + Number(row[metric.field as keyof typeof row] || 0), 0);
}

function buildPlayerRecordPlacements(lines: FranchiseStatLine[], playerId: string) {
  const placements: PlayerRecordPlacement[] = [];
  playerRecordMetrics.forEach((metric) => {
    const leagueGroups = new Map<string, FranchiseStatLine[]>();
    lines.forEach((line) => leagueGroups.set(line.playerId, [...(leagueGroups.get(line.playerId) || []), line]));
    const leagueValues = [...leagueGroups.entries()].map(([id, rows]) => ({ id, value: recordMetricValue(rows, metric) })).filter((row): row is { id: string; value: number } => row.value != null);
    const leaguePlayer = leagueValues.find((row) => row.id === playerId);
    if (leaguePlayer) {
      const rank = 1 + leagueValues.filter((row) => metric.lower ? row.value < leaguePlayer.value : row.value > leaguePlayer.value).length;
      if (rank <= 5) placements.push({ key: `league:${metric.kind}:${metric.field}`, scope: "league", label: metric.label, rank, value: leaguePlayer.value, team: null, format: metric.format || "number" });
    }
    lines.filter((line) => line.playerId === playerId && line.team).forEach((playerLine) => {
      const teamLines = lines.filter((line) => line.team?.id === playerLine.team?.id);
      const playerValue = recordMetricValue([playerLine], metric);
      if (playerValue == null) return;
      const values = teamLines.map((line) => ({ id: line.playerId, value: recordMetricValue([line], metric) })).filter((row): row is { id: string; value: number } => row.value != null);
      const rank = 1 + values.filter((row) => metric.lower ? row.value < playerValue : row.value > playerValue).length;
      if (rank <= 10) placements.push({ key: `franchise:${playerLine.team!.id}:${metric.kind}:${metric.field}`, scope: "franchise", label: metric.label, rank, value: playerValue, team: playerLine.team, format: metric.format || "number" });
    });
  });
  return placements.sort((a, b) => a.scope.localeCompare(b.scope) || a.rank - b.rank || a.label.localeCompare(b.label));
}

function PlayerRecords({ records }: { records: PlayerRecordPlacement[] }) {
  const league = records.filter((record) => record.scope === "league");
  const franchise = records.filter((record) => record.scope === "franchise");
  const formatValue = (record: PlayerRecordPlacement) => record.format === "percentage" ? record.value.toFixed(3).replace(/^0/, "") : record.value.toLocaleString("en-CA", { maximumFractionDigits: record.format === "decimal" ? 2 : 0 });
  const section = (title: string, subtitle: string, rows: PlayerRecordPlacement[], tone: "rose" | "violet") => <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className={`text-[10px] font-black uppercase tracking-[0.18em] ${tone === "rose" ? "text-rose-600 dark:text-rose-300" : "text-violet-600 dark:text-violet-300"}`}>{subtitle}</p><h2 className="text-lg font-black text-gray-900 dark:text-white">{title}</h2></div>{rows.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map((record) => <article key={record.key} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${tone === "rose" ? "border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-500/10" : "border-violet-200 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-500/10"}`}><div className="min-w-0"><p className="truncate text-sm font-black text-gray-900 dark:text-white">{record.label}</p>{record.team && <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-gray-500">{record.team.logo && <img src={record.team.logo} alt="" className="h-4 w-4 object-contain" />}{record.team.team_name}</p>}</div><div className="shrink-0 text-right"><span className={`inline-flex rounded-lg px-2 py-1 text-xs font-black text-white ${tone === "rose" ? "bg-gradient-to-r from-red-600 to-rose-500" : "bg-gradient-to-r from-violet-600 to-indigo-500"}`}>#{record.rank}</span><p className="mt-1 text-xs font-black text-gray-600 dark:text-gray-300">{formatValue(record)}</p></div></article>)}</div> : <p className="p-5 text-sm text-gray-500">No current {tone === "rose" ? "top-five league" : "top-ten franchise"} placements.</p>}</section>;
  return <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-gradient-to-br from-rose-600 to-orange-500 p-5 text-white shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-100">League Record Book</p><p className="mt-2 text-4xl font-black">{league.length}</p><p className="mt-1 text-sm font-bold text-rose-100">Top-five league placements</p></div><div className="rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 p-5 text-white shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-100">Franchise Record Books</p><p className="mt-2 text-4xl font-black">{franchise.length}</p><p className="mt-1 text-sm font-bold text-violet-100">Top-ten franchise placements</p></div></section>{section("League Records", "All-Time GLDHL · Top 5", league, "rose")}{section("Franchise Records", "Credited by ownership · Top 10", franchise, "violet")}<p className="px-1 text-xs text-gray-400">Counts include every all-time Record Book category except fantasy points per game. League books track five places; franchise books track ten.</p></div>;
}

function PlayerResume({ records, awards, franchises, seasons, leadership }: { records: PlayerRecordPlacement[]; awards: PlayerAward[]; franchises: ScoringLeader[]; seasons: PlayerSeasonWithRelations[]; leadership: Map<number, "C" | "A"> }) {
  const leagueRecords = records.filter((record) => record.scope === "league" && record.rank === 1);
  const franchiseRecords = records.filter((record) => record.scope === "franchise" && record.rank === 1);
  const seasonalAwards = awards.filter((award) => !award.is_monthly);
  const monthlyHonours = awards.filter((award) => award.is_monthly);
  const careerPoints = franchises.reduce((sum, row) => sum + row.fantasyPoints, 0);
  const teams = new Map(franchises.filter((row) => row.team).map((row) => [row.team!.id, row.team!]));
  const captaincies = seasons.filter((season) => leadership.get(season.id) === "C");
  const firstSeason = Math.min(...seasons.map((season) => season.season_year));
  const lastSeason = Math.max(...seasons.map((season) => season.season_year));
  const leagueLabels = new Set(records.filter((record) => record.scope === "league").map((record) => record.label));
  const badgePlacements = records.filter((record) => record.scope === "league" || record.rank <= 5);
  const franchiseNumberOnes = new Map<number, number>();
  franchiseRecords.forEach((record) => { if (record.team) franchiseNumberOnes.set(record.team.id, (franchiseNumberOnes.get(record.team.id) || 0) + 1); });
  const iconTeamId = [...franchiseNumberOnes.entries()].find(([, count]) => count >= 3)?.[0];
  const iconTeam = franchises.find((row) => row.team?.id === iconTeamId)?.team || null;
  const badges = [
    leagueRecords.length ? { key: "league-holder", icon: "👑", title: "League Record Holder", detail: `#1 in ${leagueRecords.length} league ${leagueRecords.length === 1 ? "category" : "categories"}`, tone: "rose" } : null,
    franchiseRecords.length ? { key: "franchise-holder", icon: "🏛️", title: "Franchise Record Holder", detail: `#1 in ${franchiseRecords.length} franchise ${franchiseRecords.length === 1 ? "category" : "categories"}`, tone: "violet" } : null,
    badgePlacements.length >= 5 ? { key: "regular", icon: "📚", title: "Record Book Regular", detail: `${badgePlacements.length} current top-five placements`, tone: "sky" } : null,
    badgePlacements.length >= 10 ? { key: "collector", icon: "🔥", title: "Record Collector", detail: `${badgePlacements.length} current top-five placements`, tone: "amber" } : null,
    ["Goals", "Assists", "Points"].every((label) => leagueLabels.has(label)) ? { key: "triple-threat", icon: "🏒", title: "Triple Threat", detail: "League top five in Goals, Assists and Points", tone: "emerald" } : null,
    ["Wins", "Shutouts"].every((label) => leagueLabels.has(label)) ? { key: "goalie-great", icon: "🥅", title: "Goalie Great", detail: "League top five in Wins and Shutouts", tone: "cyan" } : null,
    iconTeam ? { key: "franchise-icon", icon: "⭐", title: "Franchise Icon", detail: `Owns 3+ records for ${iconTeam.team_name}`, tone: "indigo", logo: iconTeam.logo } : null,
  ].filter((badge): badge is NonNullable<typeof badge> => Boolean(badge));
  const highlights = [...seasonalAwards.map((award) => ({ key: `award:${award.id}`, icon: "🏆", title: award.award?.name || "League award", detail: `Season ${award.season_year}` })), ...leagueRecords.slice(0, 4).map((record) => ({ key: record.key, icon: "👑", title: `League ${record.label} leader`, detail: record.value.toLocaleString("en-CA", { maximumFractionDigits: 2 }) })), ...captaincies.map((season) => ({ key: `captain:${season.id}`, icon: "C", title: `Captain · ${season.fantasy_team?.team_name || "GLDHL"}`, detail: `Season ${season.season_year}` }))];
  return <div className="space-y-5"><section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-5 text-white shadow-lg sm:p-7"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Career Résumé</p><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-black">GLDHL legacy at a glance</h2><p className="mt-1 text-sm text-slate-300">{Number.isFinite(firstSeason) ? firstSeason === lastSeason ? `Season ${firstSeason}` : `Seasons ${firstSeason}–${lastSeason}` : "No league seasons yet"} · {teams.size} {teams.size === 1 ? "franchise" : "franchises"}</p></div><p className="text-3xl font-black text-sky-300">{formatFantasyPoints(careerPoints)} <span className="text-[10px] uppercase tracking-wider text-slate-400">Career FPTS</span></p></div><div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4"><div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-black text-rose-300">{leagueRecords.length}</p><p className="text-[9px] font-black uppercase tracking-wider text-slate-300">League #1 records</p></div><div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-black text-violet-300">{franchiseRecords.length}</p><p className="text-[9px] font-black uppercase tracking-wider text-slate-300">Franchise #1 records</p></div><div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-black text-amber-300">{seasonalAwards.length}</p><p className="text-[9px] font-black uppercase tracking-wider text-slate-300">Season awards</p></div><div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-black text-emerald-300">{monthlyHonours.length}</p><p className="text-[9px] font-black uppercase tracking-wider text-slate-300">Monthly honours</p></div></div></section>
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="flex items-end justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-500">Record Book Badges</p><h3 className="text-lg font-black text-gray-900 dark:text-white">Earned distinctions</h3></div><span className="text-xs font-black text-gray-400">{badges.length} earned</span></div>{badges.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{badges.map((badge) => <article key={badge.key} className={`flex items-center gap-3 rounded-xl border p-3 ${badge.tone === "rose" ? "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-500/10" : badge.tone === "violet" ? "border-violet-200 bg-violet-50 dark:border-violet-900/60 dark:bg-violet-500/10" : badge.tone === "amber" ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-500/10" : badge.tone === "emerald" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-500/10" : badge.tone === "cyan" ? "border-cyan-200 bg-cyan-50 dark:border-cyan-900/60 dark:bg-cyan-500/10" : badge.tone === "indigo" ? "border-indigo-200 bg-indigo-50 dark:border-indigo-900/60 dark:bg-indigo-500/10" : "border-sky-200 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-500/10"}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">{badge.logo ? <img src={badge.logo} alt="" className="h-8 w-8 object-contain" /> : badge.icon}</span><div className="min-w-0"><p className="text-sm font-black text-gray-900 dark:text-white">{badge.title}</p><p className="mt-0.5 text-[10px] font-semibold leading-4 text-gray-500 dark:text-gray-400">{badge.detail}</p></div></article>)}</div> : <p className="p-5 text-sm text-gray-500">No Record Book badges yet. A top-five placement earns the first step toward one.</p>}</section>
    <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-500">Signature achievements</p><h3 className="text-lg font-black text-gray-900 dark:text-white">Career highlights</h3></div>{highlights.length ? <div className="divide-y divide-gray-100 dark:divide-gray-800">{highlights.map((item) => <div key={item.key} className="flex items-center gap-3 px-5 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-sm font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{item.icon}</span><div><p className="text-sm font-black text-gray-900 dark:text-white">{item.title}</p><p className="text-xs text-gray-500">{item.detail}</p></div></div>)}</div> : <p className="p-5 text-sm text-gray-500">The résumé is just getting started.</p>}</section><section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-500">Franchise journey</p><h3 className="text-lg font-black text-gray-900 dark:text-white">Teams represented</h3><div className="mt-4 space-y-3">{[...teams.values()].map((team) => { const points = franchises.filter((row) => row.team?.id === team.id).reduce((sum, row) => sum + row.fantasyPoints, 0); return <Link key={team.id} to={`/teams/${team.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3 hover:bg-gray-100 dark:bg-gray-900/70 dark:hover:bg-gray-800"> <span className="flex min-w-0 items-center gap-2">{team.logo && <img src={team.logo} alt="" className="h-8 w-8 object-contain" />}<span className="truncate text-xs font-black text-gray-900 dark:text-white">{team.team_name}</span></span><span className="shrink-0 text-xs font-black text-brand-500">{formatFantasyPoints(points)} FPTS</span></Link>; })}{!teams.size && <p className="text-sm text-gray-500">No franchise scoring yet.</p>}</div></section></div>
  </div>;
}

export default function PlayerProfile() {
  const playerApiId = new URLSearchParams(useLocation().search).get("playerId") || "";
  const [landing, setLanding] = useState<NhlPlayerLanding | null>(null);
  const [fantasyPlayer, setFantasyPlayer] = useState<FantasyPlayer | null>(null);
  const [seasons, setSeasons] = useState<PlayerSeasonWithRelations[]>([]);
  const [awards, setAwards] = useState<PlayerAward[]>([]);
  const [transactions, setTransactions] = useState<LeagueTransaction[]>([]);
  const [skater, setSkater] = useState<NhlSkaterRecord | null>(null);
  const [goalie, setGoalie] = useState<NhlGoalieRecord | null>(null);
  const [statsSeason, setStatsSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [historicalStats, setHistoricalStats] = useState<HistoricalStats[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leadershipByPlayerSeason, setLeadershipByPlayerSeason] = useState<Map<number, "C" | "A">>(new Map());
  const [franchiseScoring, setFranchiseScoring] = useState<ScoringLeader[]>([]);
  const [playerRecords, setPlayerRecords] = useState<PlayerRecordPlacement[]>([]);
  const [profileTab, setProfileTab] = useState<"resume" | "history" | "trophies" | "records" | "franchises" | "transactions">("history");
  const [tabLoading, setTabLoading] = useState(false);
  const tradeInterest = usePlayerTradeInterest(CURRENT_LEAGUE_SEASON);

  useEffect(() => {
    let active = true;
    const apiId = Number(playerApiId);
    if (!playerApiId || Number.isNaN(apiId)) { setError("No valid NHL player ID was provided."); setLoading(false); return; }
    async function load() {
      setLoading(true); setError("");
      try {
        const [landingRow, playerRow, currentStats, allAwards, branding] = await Promise.all([
          fetchNhlPlayerLanding(apiId),
          fetchFantasyPlayerByApiId(playerApiId),
          fetchNhlPlayerSeasonStats(apiId, nhlSeasonId(CURRENT_LEAGUE_SEASON)).catch(() => ({ skater: null, goalie: null })),
          fetchPlayerAwards(), fetchTeamBrandingHistory(),
        ]);
        const playerSeasons = playerRow ? await fetchPlayerSeasonsByPlayer(playerRow.id) : [];
        const leadershipRows = await fetchPlayerLeadership(playerSeasons.map((season) => season.id)).catch(() => []);
        const brandedSeasons = playerSeasons.map((season) => ({ ...season, fantasy_team: season.fantasy_team ? applyTeamBranding(season.fantasy_team, branding, season.season_year) : null }));
        if (!active) return;
        setLanding(landingRow); setFantasyPlayer(playerRow); setSeasons(brandedSeasons);
        setLeadershipByPlayerSeason(new Map(leadershipRows.map((row) => [row.player_season_id, row.slot === "C" ? "C" as const : "A" as const])));
        setSkater(currentStats.skater); setGoalie(currentStats.goalie);
        setStatsSeason(CURRENT_LEAGUE_SEASON);
        setAwards(playerRow ? allAwards.filter((award) => award.player_id === playerRow.id) : []);
        setTransactions([]); setFranchiseScoring([]); setPlayerRecords([]);
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Unable to load player profile."); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [playerApiId]);

  useEffect(() => {
    if (profileTab !== "history") return;
    const apiId = Number(playerApiId);
    if (!apiId || Number.isNaN(apiId)) return;
    let active = true; setHistoryLoading(true);
    const previousSeasons = Array.from({ length: Math.max(CURRENT_LEAGUE_SEASON - FIRST_LEAGUE_SEASON, 0) }, (_, index) => CURRENT_LEAGUE_SEASON - index - 1);
    Promise.all(previousSeasons.map(async (season) => ({ season, ...(await fetchNhlPlayerSeasonStats(apiId, nhlSeasonId(season)).catch(() => ({ skater: null, goalie: null }))) })))
      .then((rows) => { if (active) setHistoricalStats(rows); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [profileTab, playerApiId]);

  useEffect(() => {
    if (profileTab !== "transactions" || !fantasyPlayer) return;
    let active = true; setTabLoading(true);
    fetchLeagueTransactions().then((rows) => {
      if (!active) return;
      setTransactions(rows.filter((transaction) => transaction.player_id === fantasyPlayer.id || transaction.trade_offer?.trade_offer_players.some((move) => move.player_season?.player_id === fantasyPlayer.id)).sort((a,b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at)));
    }).catch(() => { if (active) setTransactions([]); }).finally(() => { if (active) setTabLoading(false); });
    return () => { active = false; };
  }, [profileTab, fantasyPlayer]);

  useEffect(() => {
    if (profileTab !== "franchises" && profileTab !== "records" && profileTab !== "resume") return;
    let active = true; setTabLoading(true);
    fetchRecordBookData().then((data) => { if (active) { setFranchiseScoring(data.franchisePositionLeaders.filter((row) => row.playerId === playerApiId)); setPlayerRecords(buildPlayerRecordPlacements(data.franchiseStatLines, playerApiId)); } }).catch(() => { if (active) { setFranchiseScoring([]); setPlayerRecords([]); } }).finally(() => { if (active) setTabLoading(false); });
    return () => { active = false; };
  }, [profileTab, playerApiId]);

  const currentSeason = useMemo(() => seasons.find((season) => season.season_year === CURRENT_LEAGUE_SEASON) || seasons[0] || null, [seasons]);
  const name = playerName(fantasyPlayer, landing);
  const position = displayPosition(currentSeason?.position === "RFA" || currentSeason?.position === "PROSPECT" ? landing?.position : currentSeason?.position || landing?.position);
  const draft = landing?.draftDetails;

  return <div><PageMeta title={`${name} | Great Lakes Dynasty Hockey League`} description={`${name} GLDHL player profile`} /><PageBreadcrumb pageTitle={name} />
    <div className="space-y-6">
      {loading && <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">Loading player profile…</div>}
      {error && <div className="rounded-xl border border-error-200 bg-error-50 p-4 text-error-700">{error}</div>}
      {!loading && !error && landing && <>
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          {landing.heroImage && <img src={landing.heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-10" />}
          <div className="relative p-5 sm:p-7"><div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-5"><div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">{landing.headshot ? <img src={landing.headshot} alt={`${name} headshot`} className="h-full w-full object-cover" /> : null}</div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">{name}</h1><PositionBadge position={position} className="px-2 py-1 text-xs" />{landing.sweaterNumber != null && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-sm font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">#{landing.sweaterNumber}</span>}{currentSeason && tradeInterest.canExpressInterest(currentSeason) && <PlayerInterestButton showLabel interested={tradeInterest.isInterested(currentSeason.id)} busy={tradeInterest.busyPlayerSeasonId === currentSeason.id} onClick={() => void tradeInterest.toggleInterest(currentSeason)} />}</div><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{landing.fullTeamName?.default || landing.currentTeamAbbrev || "NHL Team Unassigned"}</p>{tradeInterest.error && <p className="mt-2 text-xs font-medium text-error-600">{tradeInterest.error}</p>}</div></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[430px]"><InfoCard label="Current GLDHL Team" value={currentSeason?.fantasy_team ? <span className="flex flex-wrap items-center gap-2"><Link to={`/teams/${currentSeason.fantasy_team.id}`} className="flex items-center gap-2 text-brand-500 hover:underline">{currentSeason.fantasy_team.logo && <img src={currentSeason.fantasy_team.logo} alt="" className="h-7 w-7 rounded object-contain" />}{currentSeason.fantasy_team.team_name}</Link><LeadershipSeasonBadge role={leadershipByPlayerSeason.get(currentSeason.id)} /></span> : "Not Owned"} /><InfoCard label="Current Contract" value={currentSeason ? `${currentSeason.salary == null ? "No salary" : money.format(currentSeason.salary)} · ${currentSeason.term_end_year || currentSeason.position || "No term"}` : "—"} /><InfoCard label="Birthday" value={landing.birthDate ? `${formatDate(landing.birthDate)} (${ageOn(landing.birthDate)})` : "—"} /><InfoCard label="Shoots / Catches" value={landing.shootsCatches || "—"} /></div></div></div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><InfoCard label="NHL Team" value={<span className="flex items-center gap-2">{landing.teamLogo && <img src={landing.teamLogo} alt="" className="h-7 w-7 object-contain" />}{landing.fullTeamName?.default || landing.currentTeamAbbrev || "—"}</span>} /><InfoCard label="Position / Number" value={<span className="flex items-center gap-2"><PositionBadge position={position} />{landing.sweaterNumber != null ? `#${landing.sweaterNumber}` : ""}</span>} /><InfoCard label="Birthplace" value={<span className="flex flex-wrap items-center gap-2"><CountryFlagBadge countryCode={landing.birthCountry} showName /><span>{[landing.birthCity?.default, landing.birthStateProvince?.default].filter(Boolean).join(", ") || "—"}</span></span>} /><InfoCard label="Draft" value={draft ? `${draft.year || "—"} ${draft.teamAbbrev || ""} · Round ${draft.round || "—"} · Pick ${draft.pickInRound || "—"}${draft.overallPick ? ` (${draft.overallPick} overall)` : ""}` : "Undrafted"} /></section>

        {skater ? <SkaterStats record={skater} season={statsSeason} /> : goalie ? <GoalieStats record={goalie} season={statsSeason} /> : <div className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">No current-season NHL stats were returned.</div>}

        <nav aria-label="Player profile sections" className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03] sm:p-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible">
            {([
              ["resume", "Career Résumé", playerRecords.filter((record) => record.rank === 1).length + awards.length],
              ["history", "League History & Stats", historicalStats.length],
              ["trophies", "Trophy Case", awards.length],
              ["records", "Records", playerRecords.length],
              ["franchises", "Points by Franchise", franchiseScoring.length],
              ["transactions", "Transactions", transactions.length],
            ] as const).map(([key, label, count]) => <button key={key} type="button" onClick={() => setProfileTab(key)} aria-pressed={profileTab === key} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition ${profileTab === key ? "bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}>{label}<span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] ${profileTab === key ? "bg-white/20 dark:bg-gray-900/10" : "bg-white dark:bg-gray-900"}`}>{count}</span></button>)}
          </div>
        </nav>

        {profileTab === "history" && historyLoading && <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">Loading previous league seasons…</div>}
        {profileTab === "history" && !historyLoading && <SeasonHistory rows={historicalStats} seasons={seasons} awards={awards} leadership={leadershipByPlayerSeason} />}
        {profileTab === "trophies" && <PlayerTrophyCase awards={awards} />}
        {tabLoading && (profileTab === "resume" || profileTab === "records" || profileTab === "franchises" || profileTab === "transactions") && <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">Loading {profileTab === "resume" ? "career résumé" : profileTab === "records" ? "record-book placements" : profileTab === "franchises" ? "franchise scoring" : "transactions"}…</div>}
        {!tabLoading && profileTab === "resume" && <PlayerResume records={playerRecords} awards={awards} franchises={franchiseScoring} seasons={seasons} leadership={leadershipByPlayerSeason} />}
        {!tabLoading && profileTab === "records" && <PlayerRecords records={playerRecords} />}
        {!tabLoading && profileTab === "franchises" && <FranchiseScoringHistory rows={franchiseScoring} />}
        {!tabLoading && profileTab === "transactions" && <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Transaction History</h2><div className="mt-4 space-y-4">{transactions.length ? transactions.map((transaction) => <PlayerTransactionCard key={transaction.id} transaction={transaction} fallbackPosition={position} />) : <p className="text-sm text-gray-500">No transactions have been posted for this player.</p>}</div></section>}
      </>}
    </div>
  </div>;
}
