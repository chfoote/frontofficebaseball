import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchGoalFeed, type FeedStanding, type GoalieFeedEvent, type GoalFeedEvent, type GoalFeedPlayer, type MilestoneWatchItem, type RecordChase, type RecordMovementEvent } from "../../lib/goalFeed";
import { fetchNhlPlayerLanding, getNhlStatsDate } from "../../lib/nhl";
import type { FantasyTeam } from "../../lib/fantasyTeams";
import { useAuth } from "../../context/AuthContext";
import { fetchLatestUserTeamAssignment, fetchUserTeamAssignment } from "../../lib/teamUserAssignments";

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function periodLabel(event: GoalFeedEvent) {
  if (event.periodType === "SO") return "Shootout";
  if (event.periodType === "OT") return event.period > 4 ? `${event.period - 3}OT` : "OT";
  return event.period ? `${event.period}${event.period === 1 ? "st" : event.period === 2 ? "nd" : event.period === 3 ? "rd" : "th"}` : "—";
}

function FantasyOwnership({ player, primary = false }: { player: GoalFeedPlayer; primary?: boolean }) {
  const team = player.fantasyTeam;
  return <div className="flex min-w-0 items-center gap-2">
    {player.headshot && <Link to={`/player-profile?playerId=${player.playerId}`} className={`${primary ? "h-10 w-10" : "h-8 w-8"} shrink-0 overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700`}><img src={player.headshot} alt="" className="h-full w-full object-cover object-top" /></Link>}
    <div className="min-w-0"><Link to={`/player-profile?playerId=${player.playerId}`} className={`${primary ? "text-base" : "text-sm"} block truncate font-black text-gray-900 hover:text-brand-500 dark:text-white`}>{player.name}</Link><div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">{team?.logo && <img src={team.logo} alt="" className="h-4 w-4 object-contain" />}{team ? <Link to={`/teams/${team.abbreviation}`} className="hover:text-brand-500">{team.abbreviation}</Link> : <span>Free Agent</span>}{player.prospect && <><span>·</span><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Prospect</span></>}{player.tonightPoints != null && <><span>·</span><span className="text-brand-500">{player.tonightPoints.toFixed(2)} FPTS tonight</span></>}</div></div>
  </div>;
}

function GoalieCard({ event, records = [], viewerTeamId }: { event: GoalieFeedEvent; records?: RecordFeedEvent[]; viewerTeamId: number | null }) {
  const highlighted = event.goalie.fantasyTeam?.id === viewerTeamId;
  return <article className="relative overflow-hidden rounded-xl border border-sky-200 bg-white shadow-theme-xs dark:border-sky-900/70 dark:bg-white/[0.03]">
    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-500 via-blue-500 to-indigo-500" />
    <div className="grid gap-2 p-3 pl-4 lg:grid-cols-[150px_minmax(180px,.85fr)_minmax(260px,1.2fr)_145px] lg:items-center">
      <div className="flex items-center gap-2.5">{event.nhlTeam.logo && <img src={event.nhlTeam.logo} alt={`${event.nhlTeam.abbreviation} logo`} className="h-9 w-9 object-contain" />}<div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-600">{event.shutout ? "Shutout" : "Goalie Win"}</p><p className="mt-0.5 text-[10px] font-semibold text-gray-500">Final · {event.saves} saves</p></div></div>
      <div className={`rounded-lg px-3 py-2 ${highlighted ? "bg-gradient-to-r from-amber-100 to-yellow-50 ring-1 ring-amber-300 dark:from-amber-500/20 dark:to-yellow-500/10 dark:ring-amber-700" : "bg-gray-50 dark:bg-gray-900/60"}`}><FantasyOwnership player={event.goalie} primary /><p className={`mt-1 text-[8px] font-black uppercase tracking-[0.14em] ${highlighted ? "text-amber-700 dark:text-amber-300" : "text-sky-600"}`}>{event.shutout ? `${event.saves}-save shutout` : `${event.saves} saves`}</p><PlayerRecordLines events={records} playerId={event.goalie.playerId} /></div>
      <div className="hidden lg:block" aria-hidden="true" />
      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-900/70"><span className="text-[10px] font-black text-gray-500">{event.awayTeam.abbreviation}</span><span className="text-lg font-black text-gray-900 dark:text-white">{event.awayTeam.score}–{event.homeTeam.score}</span><span className="text-[10px] font-black text-gray-500">{event.homeTeam.abbreviation}</span><span className="text-[7px] font-black uppercase text-gray-400">Final</span></div>
    </div>
  </article>;
}

type AroundHornEvent = ({ kind: "goal" } & GoalFeedEvent) | ({ kind: "goalie" } & GoalieFeedEvent);

type StandingsFeedEvent = { kind: "standings"; key: string; team: FantasyTeam; passedTeam: FantasyTeam; rank: number; points: number; sortValue: number };
type RecordFeedEvent = { kind: "record" } & RecordMovementEvent;
type DisplayFeedEvent = AroundHornEvent | StandingsFeedEvent | RecordFeedEvent;

function PlayerRecordLines({ events, playerId }: { events: RecordFeedEvent[]; playerId: string }) {
  const movements = events.filter((event) => event.player.playerId === playerId).flatMap((event) => event.movements);
  if (!movements.length) return null;
  return <div className="mt-2 space-y-1 border-t border-gray-200/80 pt-1.5 dark:border-gray-700/80">
    <Link to="/record-book" className="flex w-fit items-center gap-1 text-[7px] font-black uppercase tracking-[0.12em] text-amber-700 hover:text-amber-600 dark:text-amber-300"><span>🏆</span><span>Record Book</span></Link>
    {movements.map((movement) => {
      const league = movement.scope === "league";
      const changed = movement.moved || movement.beforeRank == null;
      return <Link key={`${movement.scope}:${movement.abbreviation}`} to="/record-book" className={`flex items-center justify-between gap-1.5 rounded-md border px-1.5 py-1 text-[8px] transition hover:-translate-y-px ${changed ? "border-amber-400 bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:border-amber-500 dark:bg-amber-500/20 dark:text-amber-200" : league ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-500/10 dark:text-rose-300" : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-500/10 dark:text-violet-300"}`}><span className="flex min-w-0 items-center gap-1">{changed && <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-white">!</span>}<span className="truncate font-black">{league ? "League" : "Franchise"} ({movement.abbreviation})</span>{changed && <span className="shrink-0 font-black">{movement.beforeRank == null ? `New top ${league ? 5 : 10}` : `↑ #${movement.beforeRank}→#${movement.afterRank}`}</span>}</span><span className="shrink-0 font-black">{movement.tied ? "T-" : ""}#{movement.afterRank} <span className="text-gray-500">({movement.value})</span></span></Link>;
    })}
  </div>;
}

function StandingsCard({ event }: { event: StandingsFeedEvent }) {
  const place = event.rank === 1 ? "1st" : event.rank === 2 ? "2nd" : event.rank === 3 ? "3rd" : `${event.rank}th`;
  return <article className="relative overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-theme-xs dark:border-violet-900/70 dark:bg-white/[0.03]">
    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-500 to-fuchsia-500" />
    <div className="flex flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3">{event.team.logo && <img src={event.team.logo} alt="" className="h-12 w-12 object-contain" />}<div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Standings movement</p><p className="mt-1 font-black text-gray-900 dark:text-white">{event.team.team_name} moves into {place}</p><p className="mt-1 text-xs text-gray-500">Passes {event.passedTeam.team_name}</p></div></div><div className="rounded-xl bg-violet-50 px-4 py-3 text-center dark:bg-violet-500/10"><p className="text-xl font-black text-violet-700 dark:text-violet-300">{event.points.toFixed(2)}</p><p className="text-[9px] font-black uppercase tracking-wider text-violet-500">Season FPTS</p></div></div>
  </article>;
}

function NightlyRecap({ events, records, stars, date }: { events: DisplayFeedEvent[]; records: RecordFeedEvent[]; stars: GoalFeedPlayer[]; date: string }) {
  const goals = events.filter((event): event is Extract<AroundHornEvent, { kind: "goal" }> => event.kind === "goal");
  const goalies = events.filter((event): event is Extract<AroundHornEvent, { kind: "goalie" }> => event.kind === "goalie");
  const standings = events.filter((event): event is StandingsFeedEvent => event.kind === "standings");
  const movementCount = records.reduce((sum, event) => sum + event.movements.filter((movement) => movement.moved || movement.beforeRank == null).length, 0);
  const label = new Date(`${date}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" });
  const summaries = [{ value: goals.length, label: "Goals", tone: "text-red-400" }, { value: goalies.length, label: "Goalie wins", tone: "text-sky-300" }, { value: movementCount, label: "Record moves", tone: "text-amber-300" }, { value: standings.length, label: "Standings", tone: "text-violet-300" }];
  return <div className="grid gap-3 border-t border-white/10 px-4 py-3 sm:px-5 lg:grid-cols-[180px_minmax(300px,.8fr)_minmax(420px,1.2fr)] lg:items-center"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-sky-300">Nightly Recap</p><h2 className="mt-0.5 text-sm font-black">{label}</h2></div><div className="grid grid-cols-4 divide-x divide-white/10 rounded-lg bg-white/[0.04] py-1.5">{summaries.map((summary) => <div key={summary.label} className="px-2 text-center"><p className={`text-lg font-black ${summary.tone}`}>{summary.value}</p><p className="truncate text-[7px] font-black uppercase tracking-wide text-slate-400">{summary.label}</p></div>)}</div>{stars.length > 0 && <div className="grid min-w-0 gap-1 sm:grid-cols-3 lg:flex lg:items-center"><span className="mr-1 hidden shrink-0 text-[8px] font-black uppercase tracking-wider text-amber-300 lg:inline">⭐ Stars</span>{stars.map((star, index) => <Link key={star.playerId} to={`/player-profile?playerId=${star.playerId}`} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-white/[0.08]"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${index === 0 ? "bg-amber-400 text-slate-950" : index === 1 ? "bg-slate-300 text-slate-900" : "bg-orange-700 text-white"}`}>{index + 1}</span>{star.headshot && <img src={star.headshot} alt="" className="hidden h-7 w-7 shrink-0 rounded-full bg-white/10 object-cover object-top sm:block" />}<span className="min-w-0"><span className="block truncate text-[10px] font-black">{star.name}</span><span className="block text-[8px] font-bold text-sky-300">{star.tonightPoints?.toFixed(2)} FPTS</span></span></Link>)}</div>}</div>;
}

function RecordChaseBoard({ chases, viewerTeamId }: { chases: RecordChase[]; viewerTeamId: number | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!chases.length) return null;
  const categoryOrder: Record<RecordChase["abbreviation"], number> = { G: 0, A: 1, P: 2, GWG: 3, W: 4, SO: 5 };
  const teamOrder = (teamId?: number | null) => teamId === viewerTeamId ? -1 : teamId || Number.MAX_SAFE_INTEGER;
  const league = chases.filter((chase) => chase.scope === "league").sort((a, b) => teamOrder(a.player.fantasyTeam?.id) - teamOrder(b.player.fantasyTeam?.id) || categoryOrder[a.abbreviation] - categoryOrder[b.abbreviation] || a.rank - b.rank || a.player.name.localeCompare(b.player.name));
  const franchise = chases.filter((chase) => chase.scope === "franchise").sort((a, b) => teamOrder(a.team?.id) - teamOrder(b.team?.id) || categoryOrder[a.abbreviation] - categoryOrder[b.abbreviation] || a.rank - b.rank || a.player.name.localeCompare(b.player.name));
  const limit = expanded ? Number.POSITIVE_INFINITY : 3;
  const column = (title: string, rows: RecordChase[], tone: "league" | "franchise") => <div className={tone === "franchise" ? "border-t border-amber-200/70 dark:border-amber-900/60 lg:border-l lg:border-t-0" : ""}><div className="flex items-center gap-2 bg-white/45 px-3 py-1.5 dark:bg-white/[0.025]"><span className={`h-1.5 w-1.5 rounded-full ${tone === "league" ? "bg-rose-500" : "bg-violet-500"}`} /><h3 className={`text-[9px] font-black uppercase tracking-[0.16em] ${tone === "league" ? "text-rose-600 dark:text-rose-300" : "text-violet-600 dark:text-violet-300"}`}>{title}</h3></div><div className="divide-y divide-amber-200/60 dark:divide-amber-900/50">{rows.slice(0, limit).map((chase) => <Link key={chase.key} to={`/player-profile?playerId=${chase.player.playerId}`} className="flex min-w-0 items-center gap-2.5 px-3 py-2 transition hover:bg-white/70 dark:hover:bg-white/[0.04]">{chase.player.headshot ? <img src={chase.player.headshot} alt="" className="h-8 w-8 shrink-0 rounded-full bg-gray-100 object-cover object-top dark:bg-gray-800" /> : <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${tone === "league" ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" : "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"}`}>{chase.player.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}<div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-1.5"><p className="truncate text-xs font-black text-gray-900 dark:text-white">{chase.player.name}</p><span className={`shrink-0 text-[8px] font-black uppercase ${tone === "league" ? "text-rose-600 dark:text-rose-300" : "text-violet-600 dark:text-violet-300"}`}>{tone === "franchise" ? `${chase.team?.abbreviation || "Franchise"} · ` : ""}{chase.abbreviation}</span></div><p className="truncate text-[10px] font-semibold text-gray-500 dark:text-gray-400"><span className="font-black text-amber-700 dark:text-amber-300">{chase.needed} more</span> to pass {chase.targetNames.join(" / ") || `#${chase.targetRank}`}</p></div><span className="shrink-0 text-[9px] font-black text-gray-400">{chase.value} · #{chase.rank}</span></Link>)}{!rows.length && <p className="px-3 py-4 text-center text-[10px] font-semibold text-gray-400">No active chases</p>}</div></div>;
  return <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-500/[0.06]"><div className="flex items-center justify-between gap-3 border-b border-amber-200/70 px-4 py-2.5 dark:border-amber-900/60"><h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">🔥 Record Chases</h2>{(league.length > 3 || franchise.length > 3) && <button type="button" onClick={() => setExpanded((value) => !value)} className="text-[10px] font-black text-amber-700 hover:underline dark:text-amber-300">{expanded ? "Show less" : `See all ${chases.length}`}</button>}</div><div className="grid lg:grid-cols-2">{column("League", league, "league")}{column("Franchise", franchise, "franchise")}</div></section>;
}

function MilestoneWatch({ milestones, viewerTeamId }: { milestones: MilestoneWatchItem[]; viewerTeamId: number | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!milestones.length) return null;
  const categoryOrder: Record<MilestoneWatchItem["abbreviation"], number> = { G: 0, A: 1, P: 2, W: 3, SO: 4, FPTS: 5 };
  const teamOrder = (teamId?: number | null) => teamId === viewerTeamId ? -1 : teamId || Number.MAX_SAFE_INTEGER;
  const ordered = [...milestones].sort((a, b) => teamOrder(a.player.fantasyTeam?.id) - teamOrder(b.player.fantasyTeam?.id) || categoryOrder[a.abbreviation] - categoryOrder[b.abbreviation] || a.remaining - b.remaining || a.player.name.localeCompare(b.player.name));
  const visible = expanded ? ordered : ordered.slice(0, 6);
  const recognitionLabel = (recognition: MilestoneWatchItem["recognition"]) => recognition === "standard" ? "Milestone" : recognition === "major" ? "Major" : `${recognition[0].toUpperCase()}${recognition.slice(1)} tier`;
  const recognitionTone = (recognition: MilestoneWatchItem["recognition"]) => recognition === "legendary" ? "text-fuchsia-200" : recognition === "gold" ? "text-amber-200" : recognition === "silver" ? "text-slate-200" : recognition === "bronze" ? "text-orange-200" : "text-emerald-100";
  const playerMark = (milestone: MilestoneWatchItem, reachedStyle = false) => <span className="relative shrink-0">{milestone.player.headshot ? <img src={milestone.player.headshot} alt="" className={`${reachedStyle ? "h-10 w-10 ring-2 ring-white/30" : "h-8 w-8"} rounded-full bg-white/15 object-cover object-top`} /> : <span className={`${reachedStyle ? "h-10 w-10" : "h-8 w-8"} flex items-center justify-center rounded-full bg-white/15 text-[9px] font-black`}>{milestone.player.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}{milestone.player.fantasyTeam?.logo && <img src={milestone.player.fantasyTeam.logo} alt={`${milestone.player.fantasyTeam.team_name} logo`} title={milestone.player.fantasyTeam.team_name} className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white p-0.5 object-contain shadow ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700" />}</span>;
  return <section className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/70 dark:bg-emerald-500/[0.06]"><div className="flex items-center justify-between gap-3 border-b border-emerald-200/70 px-3 py-2 dark:border-emerald-900/60"><h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">🎯 Milestone Watch</h2>{ordered.length > 6 && <button type="button" onClick={() => setExpanded((value) => !value)} className="text-[9px] font-black text-emerald-700 hover:underline dark:text-emerald-300">{expanded ? "Show less" : `See all ${milestones.length}`}</button>}</div><div className="divide-y divide-emerald-200/60 dark:divide-emerald-900/50">{visible.map((milestone) => milestone.achievedTonight ? <Link key={milestone.key} to={`/player-profile?playerId=${milestone.player.playerId}`} className="flex items-center gap-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-white transition hover:from-emerald-500 hover:to-teal-500">{playerMark(milestone, true)}<span className="min-w-0 flex-1"><span className={`block text-[7px] font-black uppercase tracking-[0.14em] ${recognitionTone(milestone.recognition)}`}>✓ {recognitionLabel(milestone.recognition)} reached</span><span className="block truncate text-xs font-black">{milestone.player.name} · {milestone.target.toLocaleString("en-CA")} {milestone.abbreviation}</span></span><span>🎉</span></Link> : <Link key={milestone.key} to={`/player-profile?playerId=${milestone.player.playerId}`} className="flex min-w-0 items-center gap-2 px-3 py-1.5 transition hover:bg-white/70 dark:hover:bg-white/[0.04]">{playerMark(milestone)}<span className="min-w-0 flex-1"><span className="flex items-center gap-1"><span className="truncate text-[11px] font-black text-gray-900 dark:text-white">{milestone.player.name}</span><span className="shrink-0 text-[7px] font-black uppercase text-emerald-700 dark:text-emerald-300">{milestone.abbreviation}</span><span className={`shrink-0 text-[7px] font-black uppercase ${milestone.recognition === "legendary" ? "text-fuchsia-600 dark:text-fuchsia-300" : milestone.recognition === "gold" ? "text-amber-600 dark:text-amber-300" : milestone.recognition === "silver" ? "text-slate-500 dark:text-slate-300" : milestone.recognition === "bronze" ? "text-orange-600 dark:text-orange-300" : "text-gray-400"}`}>{recognitionLabel(milestone.recognition)}</span></span><span className="block truncate text-[9px] font-semibold text-gray-500"><strong className="text-emerald-700 dark:text-emerald-300">{milestone.remaining.toLocaleString("en-CA")} away</strong> from {milestone.target.toLocaleString("en-CA")} {milestone.category}</span></span><span className="shrink-0 text-[9px] font-black text-gray-400">{milestone.value.toLocaleString("en-CA")}</span></Link>)}</div></section>;
}

function GoalCard({ event, records = [], viewerTeamId }: { event: GoalFeedEvent; records?: RecordFeedEvent[]; viewerTeamId: number | null }) {
  const final = ["OFF", "FINAL"].includes(event.gameState);
  const scorerHighlighted = event.scorer.fantasyTeam?.id === viewerTeamId;
  return <article className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 via-amber-400 to-yellow-300" />
    <div className="grid gap-2 p-3 pl-4 lg:grid-cols-[150px_minmax(180px,.85fr)_minmax(260px,1.2fr)_145px] lg:items-center"><div className="flex items-center gap-2.5">{event.nhlTeam.logo && <img src={event.nhlTeam.logo} alt={`${event.nhlTeam.abbreviation} logo`} className="h-9 w-9 object-contain" />}<div><div className="flex items-center gap-1.5"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-red-500">Goal</span>{event.strength && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{event.strength}</span>}</div><p className="mt-0.5 text-[10px] font-semibold text-gray-500">{periodLabel(event)} · {event.timeInPeriod}{event.shotType ? ` · ${event.shotType.replace(/-/g, " ")}` : ""}</p></div></div>
      <div className={`rounded-lg px-3 py-2 ${scorerHighlighted ? "bg-gradient-to-r from-amber-100 to-yellow-50 ring-1 ring-amber-300 dark:from-amber-500/20 dark:to-yellow-500/10 dark:ring-amber-700" : "bg-gray-50 dark:bg-gray-900/60"}`}><p className={`mb-1 text-[8px] font-black uppercase tracking-[0.14em] ${scorerHighlighted ? "text-amber-700 dark:text-amber-300" : "text-gray-400"}`}>Scored by</p><FantasyOwnership player={event.scorer} primary /><PlayerRecordLines events={records} playerId={event.scorer.playerId} /></div>
      <div>{event.assists.length ? <div className="grid gap-1.5 sm:grid-cols-2">{event.assists.map((assist) => { const highlighted = assist.fantasyTeam?.id === viewerTeamId; return <div key={assist.playerId} className={`rounded-lg border px-2.5 py-1.5 ${highlighted ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-500/10" : "border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50"}`}><FantasyOwnership player={assist} /><PlayerRecordLines events={records} playerId={assist.playerId} /></div>; })}</div> : <p className="px-2 text-[10px] font-semibold text-gray-400">Unassisted</p>}</div>
      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-900/70"><span className="text-[10px] font-black text-gray-500">{event.awayTeam.abbreviation}</span><span className="text-lg font-black text-gray-900 dark:text-white">{event.awayTeam.score}–{event.homeTeam.score}</span><span className="text-[10px] font-black text-gray-500">{event.homeTeam.abbreviation}</span>{final && <span className="text-[7px] font-black uppercase text-gray-400">Final</span>}</div>
    </div>
  </article>;
}

export default function GoalHorn() {
  const { user } = useAuth();
  const today = getNhlStatsDate();
  const [date, setDate] = useState(today);
  const [events, setEvents] = useState<DisplayFeedEvent[]>([]);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [games, setGames] = useState(0);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [viewerTeamId, setViewerTeamId] = useState<number | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordChases, setRecordChases] = useState<RecordChase[]>([]);
  const [nightlyStars, setNightlyStars] = useState<GoalFeedPlayer[]>([]);
  const [milestones, setMilestones] = useState<MilestoneWatchItem[]>([]);
  const [showNightlyRecap, setShowNightlyRecap] = useState(() => typeof window === "undefined" || window.localStorage.getItem("around-horn:show-nightly-recap") !== "false");
  const [showRecordChases, setShowRecordChases] = useState(() => typeof window === "undefined" || window.localStorage.getItem("around-horn:show-record-chases") !== "false");
  const [showMilestones, setShowMilestones] = useState(() => typeof window === "undefined" || window.localStorage.getItem("around-horn:show-milestones") !== "false");
  const feedOrder = useRef(new Map<string, number>());
  const feedOrderDate = useRef("");
  const previousStandings = useRef<FeedStanding[]>([]);
  const standingsEvents = useRef<StandingsFeedEvent[]>([]);
  const recordEvents = useRef<RecordFeedEvent[]>([]);
  const recordRequest = useRef(0);
  const milestoneHeadshots = useRef(new Map<string, string | null>());

  const load = useCallback(async (background = false) => {
    const requestId = ++recordRequest.current;
    if (background) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const result = await fetchGoalFeed(date);
      if (feedOrderDate.current !== date) { feedOrder.current.clear(); feedOrderDate.current = date; previousStandings.current = []; standingsEvents.current = []; recordEvents.current = []; }
      if (!previousStandings.current.length) previousStandings.current = result.baselineStandings;
      if (previousStandings.current.length && result.standings.length) {
        const previousByTeam = new Map(previousStandings.current.map((row) => [row.team.id, row]));
        const currentByTeam = new Map(result.standings.map((row) => [row.team.id, row]));
        result.standings.forEach((row) => {
          const previous = previousByTeam.get(row.team.id);
          if (!previous || row.rank >= previous.rank) return;
          const passed = previousStandings.current.find((candidate) => candidate.rank >= row.rank && candidate.rank < previous.rank && (currentByTeam.get(candidate.team.id)?.rank || 0) > row.rank);
          if (!passed) return;
          const movement: StandingsFeedEvent = { kind: "standings", key: `standings:${date}:${row.team.id}:${passed.team.id}:${row.rank}`, team: row.team, passedTeam: passed.team, rank: row.rank, points: row.points, sortValue: Date.now() };
          if (!standingsEvents.current.some((event) => event.key === movement.key)) standingsEvents.current.unshift(movement);
        });
      }
      previousStandings.current = result.standings;
      const firstLoad = feedOrder.current.size === 0;
      const nextEvents: DisplayFeedEvent[] = [
        ...result.events.map((event) => ({ ...event, kind: "goal" as const })),
        ...result.goalieEvents.map((event) => ({ ...event, kind: "goalie" as const })),
        ...recordEvents.current,
        ...standingsEvents.current,
      ];
      if (firstLoad) {
        nextEvents.forEach((event) => feedOrder.current.set(event.key, event.sortValue));
      } else {
        const newEvents = nextEvents.filter((event) => !feedOrder.current.has(event.key));
        const highestExistingOrder = Math.max(0, ...feedOrder.current.values());
        newEvents.forEach((event, index) => {
          // Newly detected events always belong above everything already in the
          // feed. NHL play data has no reliable cross-game wall-clock timestamp,
          // so comparing an arrival time with earlier estimates can misorder it.
          feedOrder.current.set(event.key, highestExistingOrder + newEvents.length - index);
        });
      }
      setEvents(nextEvents.sort((a, b) => (feedOrder.current.get(b.key) || b.sortValue) - (feedOrder.current.get(a.key) || a.sortValue)));
      setTeams(result.teams); setGames(result.games); setLive(result.live); setNightlyStars(result.nightlyStars); setUpdatedAt(new Date());
      setRecordsLoading(true);
      void Promise.all([result.recordEventsPromise, result.recordChasesPromise, result.milestoneWatchPromise]).then(([rows, chases, milestoneRows]) => {
        if (recordRequest.current !== requestId || feedOrderDate.current !== date) return;
        const nextRecords = rows.map((event) => ({ ...event, kind: "record" as const }));
        recordEvents.current = nextRecords;
        setRecordChases(chases.map((chase) => ({ ...chase, player: { ...chase.player, headshot: chase.player.headshot || milestoneHeadshots.current.get(chase.player.playerId) || undefined } })));
        setMilestones(milestoneRows.map((milestone) => ({ ...milestone, player: { ...milestone.player, headshot: milestone.player.headshot || milestoneHeadshots.current.get(milestone.player.playerId) || undefined } })));
        setEvents((current) => [...current.filter((event) => event.kind !== "record"), ...nextRecords].sort((a, b) => (feedOrder.current.get(b.key) || b.sortValue) - (feedOrder.current.get(a.key) || a.sortValue)));
        setRecordsLoading(false);
      });
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load Around the Horn."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [date]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    if (!user) { setViewerTeamId(null); return; }
    const [year, month] = date.split("-").map(Number);
    const season = month >= 9 ? year + 1 : year;
    fetchUserTeamAssignment(user.id, season).then((assignment) => assignment || fetchLatestUserTeamAssignment(user.id)).then((assignment) => { if (active) setViewerTeamId(assignment?.fantasy_team_id ?? null); }).catch(() => { if (active) setViewerTeamId(null); });
    return () => { active = false; };
  }, [date, user]);
  useEffect(() => {
    if (date !== today) return;
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [date, today, load]);
  useEffect(() => { window.localStorage.setItem("around-horn:show-nightly-recap", String(showNightlyRecap)); }, [showNightlyRecap]);
  useEffect(() => { window.localStorage.setItem("around-horn:show-record-chases", String(showRecordChases)); }, [showRecordChases]);
  useEffect(() => { window.localStorage.setItem("around-horn:show-milestones", String(showMilestones)); }, [showMilestones]);
  useEffect(() => {
    const players = [
      ...(showMilestones ? milestones.map((milestone) => milestone.player) : []),
      ...(showRecordChases ? recordChases.map((chase) => chase.player) : []),
    ];
    const missing = [...new Map(players.filter((player) => !player.headshot && !milestoneHeadshots.current.has(player.playerId)).map((player) => [player.playerId, player])).values()];
    if (!missing.length) return;
    let active = true;
    missing.forEach((player) => milestoneHeadshots.current.set(player.playerId, null));
    void Promise.all(missing.map(async (player) => {
      const landing = await fetchNhlPlayerLanding(Number(player.playerId)).catch(() => null);
      return { playerId: player.playerId, headshot: landing?.headshot || null };
    })).then((rows) => {
      if (!active) return;
      rows.forEach((row) => milestoneHeadshots.current.set(row.playerId, row.headshot));
      setMilestones((current) => current.map((milestone) => ({ ...milestone, player: { ...milestone.player, headshot: milestone.player.headshot || milestoneHeadshots.current.get(milestone.player.playerId) || undefined } })));
      setRecordChases((current) => current.map((chase) => ({ ...chase, player: { ...chase.player, headshot: chase.player.headshot || milestoneHeadshots.current.get(chase.player.playerId) || undefined } })));
    });
    return () => { active = false; };
  }, [milestones, recordChases, showMilestones, showRecordChases]);
  const filteredEvents = useMemo(() => selectedTeamId == null ? events : events.filter((event) => event.kind === "goal" ? [event.scorer, ...event.assists].some((player) => player.fantasyTeam?.id === selectedTeamId) : event.kind === "goalie" ? event.goalie.fantasyTeam?.id === selectedTeamId : event.kind === "record" ? event.player.fantasyTeam?.id === selectedTeamId : event.team.id === selectedTeamId || event.passedTeam.id === selectedTeamId), [events, selectedTeamId]);
  const visibleEvents = useMemo(() => filteredEvents.filter((event) => event.kind !== "record"), [filteredEvents]);
  const recordsFor = useCallback((event: GoalFeedEvent | GoalieFeedEvent) => filteredEvents.filter((candidate): candidate is RecordFeedEvent => candidate.kind === "record" && Math.abs(candidate.sortValue - event.sortValue - 0.5) < 0.001), [filteredEvents]);
  const filteredChases = useMemo(() => selectedTeamId == null ? recordChases : recordChases.filter((chase) => chase.player.fantasyTeam?.id === selectedTeamId), [recordChases, selectedTeamId]);
  const filteredStars = useMemo(() => (selectedTeamId == null ? nightlyStars : nightlyStars.filter((player) => player.fantasyTeam?.id === selectedTeamId)).slice(0, 3), [nightlyStars, selectedTeamId]);
  const filteredMilestones = useMemo(() => selectedTeamId == null ? milestones : milestones.filter((milestone) => milestone.player.fantasyTeam?.id === selectedTeamId), [milestones, selectedTeamId]);

  return <div>
    <PageMeta title="Around the Horn | GLDHL" description="Live NHL scoring and GLDHL fantasy updates" />
    <PageBreadcrumb pageTitle="Around the Horn" />
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl bg-gradient-to-r from-red-950 via-slate-950 to-sky-950 text-white shadow-sm"><div className="flex flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-3"><span className="text-2xl">🚨</span><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h1 className="text-2xl font-black sm:text-3xl">Around the Horn</h1><span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">GLDHL Live Scoring</span></div></div><div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-300"><span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-red-400" : "bg-slate-500"}`} />{live ? "Live" : `${games} games`}</span><button type="button" onClick={() => setDate((current) => shiftDate(current, -1))} className="h-8 rounded-md bg-white/10 px-2.5 text-xs font-black hover:bg-white/15">←</button><button type="button" onClick={() => setDate(today)} className="h-8 rounded-md bg-white/10 px-2.5 text-[10px] font-black uppercase hover:bg-white/15">Today</button><button type="button" disabled={date >= today} onClick={() => setDate((current) => shiftDate(current, 1))} className="h-8 rounded-md bg-white/10 px-2.5 text-xs font-black disabled:opacity-30">→</button><input aria-label="Hockey date" type="date" max={today} value={date} onChange={(event) => setDate(event.target.value)} className="h-8 rounded-md border border-white/15 bg-white/10 px-2 text-xs font-bold text-white [color-scheme:dark]" /><button type="button" disabled={refreshing} onClick={() => void load(true)} className="h-8 rounded-md bg-red-600 px-3 text-[10px] font-black uppercase disabled:opacity-60">{refreshing ? "…" : "Refresh"}</button></div></div>{showNightlyRecap && !loading && visibleEvents.length > 0 && <NightlyRecap events={visibleEvents} records={filteredEvents.filter((event): event is RecordFeedEvent => event.kind === "record")} stars={filteredStars} date={date} />}</section>

      <section className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-white/[0.03]"><div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between"><div className="flex min-w-0 items-center gap-2"><span className="hidden shrink-0 text-[9px] font-black uppercase tracking-[0.14em] text-brand-500 sm:inline">Team</span><div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5"><button type="button" onClick={() => setSelectedTeamId(null)} className={`flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border px-2 text-[9px] font-black uppercase transition ${selectedTeamId == null ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300" : "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900"}`}>All</button>{teams.map((team) => <button key={team.id} type="button" title={team.team_name} aria-label={`Filter by ${team.team_name}`} onClick={() => setSelectedTeamId((current) => current === team.id ? null : team.id)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border p-1 transition ${selectedTeamId === team.id ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500/20 dark:bg-brand-500/10" : "border-gray-200 bg-gray-50 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900"}`}>{team.logo ? <img src={team.logo} alt={`${team.team_name} logo`} className="h-full w-full object-contain" /> : <span className="text-[8px] font-black text-gray-500">{team.abbreviation}</span>}</button>)}</div>{selectedTeamId != null && <button type="button" onClick={() => setSelectedTeamId(null)} className="shrink-0 text-[9px] font-black text-brand-500 hover:underline">Clear</button>}</div><div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2 dark:border-gray-800 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0"><span className="mr-1 text-[8px] font-black uppercase tracking-[0.14em] text-gray-400">Show</span>{[["Recap", showNightlyRecap, () => setShowNightlyRecap((value) => !value), "sky"], ["Records", showRecordChases, () => setShowRecordChases((value) => !value), "amber"], ["Milestones", showMilestones, () => setShowMilestones((value) => !value), "emerald"]] .map(([label, shown, toggle, tone]) => <button key={String(label)} type="button" onClick={toggle as () => void} aria-pressed={Boolean(shown)} className={`rounded-full border px-2.5 py-1 text-[9px] font-black transition ${shown ? tone === "sky" ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-500/10 dark:text-sky-300" : tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-300" : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-900"}`}><span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${shown ? tone === "sky" ? "bg-sky-500" : tone === "amber" ? "bg-amber-500" : "bg-emerald-500" : "bg-gray-400"}`} />{String(label)}</button>)}</div></div></section>

      {!recordsLoading && ((showRecordChases && filteredChases.length > 0) || (showMilestones && filteredMilestones.length > 0)) && <div className={`grid items-start gap-3 ${showRecordChases && filteredChases.length > 0 && showMilestones && filteredMilestones.length > 0 ? "xl:grid-cols-2" : ""}`}>{showRecordChases && <RecordChaseBoard chases={filteredChases} viewerTeamId={viewerTeamId} />}{showMilestones && <MilestoneWatch milestones={filteredMilestones} viewerTeamId={viewerTeamId} />}</div>}

      {updatedAt && <div className="flex items-center justify-end gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{recordsLoading && <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />Loading record notes</span>}<span>Updated {updatedAt.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span></div>}
      {error && <p role="alert" className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm font-semibold text-error-700">{error}</p>}
      {loading ? <div className="space-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />)}</div> : visibleEvents.length ? <div className="space-y-3">{visibleEvents.map((event) => event.kind === "goal" ? <GoalCard key={event.key} event={event} records={recordsFor(event)} viewerTeamId={viewerTeamId} /> : event.kind === "goalie" ? <GoalieCard key={event.key} event={event} records={recordsFor(event)} viewerTeamId={viewerTeamId} /> : <StandingsCard key={event.key} event={event} />)}</div> : <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center dark:border-gray-700 dark:bg-white/[0.02]"><div className="text-5xl">🥅</div><h2 className="mt-4 text-xl font-black text-gray-900 dark:text-white">The horn is quiet</h2><p className="mt-2 text-sm text-gray-500">{selectedTeamId != null ? "No scoring events involve this fantasy team on the selected date." : games ? "No scoring events yet." : "No NHL games are scheduled for this hockey date."}</p></section>}
    </div>
  </div>;
}
