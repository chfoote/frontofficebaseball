import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import PositionBadge from "../../components/hockey/PositionBadge";
import { useAuth } from "../../context/AuthContext";
import { fetchCompetitiveBalancePicks, makeCompetitiveBalancePick, undoCompetitiveBalancePick, type CompetitiveBalancePick } from "../../lib/competitiveBalanceDraft";
import { fetchPlayerSeasonsBySeason, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { fetchNhlPlayerLanding, searchNhlPlayers, type NhlPlayerSearchResult } from "../../lib/nhl";
import { fetchProspectRights, getProspectRight, type ProspectRight } from "../../lib/prospectRights";

const DRAFT_SEASON = 2027;

function displayPosition(position?: string) {
  return position === "L" ? "LW" : position === "R" ? "RW" : position || "—";
}

function PickCard({ pick, headshot, canSubmit, onSelect, onUndo }: { pick: CompetitiveBalancePick; headshot?: string; canSubmit: boolean; onSelect: (pick: CompetitiveBalancePick) => void; onUndo: (pick: CompetitiveBalancePick) => void }) {
  return <article className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${pick.team.primary_color || "#465fff"}, ${pick.team.secondary_color || "#8b5cf6"})` }} />
    <div className="p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-500">Round {pick.round} · Pick {pick.pick_in_round}</p><p className="mt-1 text-sm font-bold text-gray-500">#{pick.overall_pick} Overall</p></div>{pick.team.logo && <img src={pick.team.logo} alt={`${pick.team.team_name} logo`} className="h-12 w-12 object-contain" />}</div>
      <p className="mt-3 font-black text-gray-900 dark:text-white">{pick.team.team_name}</p>
      {pick.player ? <div className="mt-5 text-center"><Link to={`/player-profile?playerId=${pick.player.player_api_id}`} className="mx-auto flex h-24 w-24 items-end justify-center overflow-hidden rounded-full bg-gradient-to-b from-gray-100 to-brand-100 ring-1 ring-gray-200 dark:from-gray-800 dark:to-brand-500/20 dark:ring-gray-700">{headshot ? <img src={headshot} alt={`${pick.player.full_name} headshot`} className="h-full w-full object-contain object-bottom" /> : <span className="mb-7 text-xl font-black text-gray-400">{(pick.player.full_name || "?").split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}</Link><Link to={`/player-profile?playerId=${pick.player.player_api_id}`} className="mt-3 block text-lg font-black text-gray-900 hover:text-brand-500 dark:text-white">{pick.player.full_name}</Link><div className="mt-1 flex items-center justify-center gap-2 text-xs font-bold text-gray-500"><PositionBadge position={displayPosition(pick.position || undefined)} /><span>{pick.nhl_team || "NHL team unavailable"}</span></div><span className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Acquired Prospect</span>{canSubmit && <button type="button" onClick={() => onUndo(pick)} className="mt-4 block w-full rounded-lg border border-error-200 px-3 py-2 text-xs font-bold text-error-600 hover:bg-error-50 dark:border-error-500/30">Undo Selection</button>}</div> : <div className="mt-5 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center dark:border-gray-700 dark:bg-gray-900/50"><span className="text-4xl font-black text-gray-200 dark:text-gray-700">#{pick.overall_pick}</span><p className="mt-2 text-sm font-bold text-gray-400">Selection pending</p><button type="button" disabled={!canSubmit} onClick={() => onSelect(pick)} className="mt-4 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300">{canSubmit ? "Make Pick" : "Sign in to manage"}</button><p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">Commissioner permission required</p></div>}
    </div>
  </article>;
}

export default function CompetitiveBalanceDraft() {
  const { user } = useAuth();
  const [picks, setPicks] = useState<CompetitiveBalancePick[]>([]);
  const [rights, setRights] = useState<Map<string, ProspectRight>>(new Map());
  const [roster, setRoster] = useState<PlayerSeasonWithRelations[]>([]);
  const [headshots, setHeadshots] = useState<Map<string, string>>(new Map());
  const [activePick, setActivePick] = useState<CompetitiveBalancePick | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NhlPlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingPlayerId, setSavingPlayerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectionPanelRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const [pickRows, prospectRights, rosterRows] = await Promise.all([fetchCompetitiveBalancePicks(DRAFT_SEASON), fetchProspectRights(DRAFT_SEASON), fetchPlayerSeasonsBySeason(DRAFT_SEASON)]);
      setPicks(pickRows); setRights(prospectRights); setRoster(rosterRows);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the Competitive Balance Draft."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!activePick) return;
    window.requestAnimationFrame(() => {
      selectionPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => searchInputRef.current?.focus(), 350);
    });
  }, [activePick]);
  useEffect(() => {
    let active = true;
    picks.filter((pick) => pick.player?.player_api_id && !headshots.has(pick.player.player_api_id)).forEach((pick) => {
      const apiId = pick.player!.player_api_id;
      void fetchNhlPlayerLanding(Number(apiId)).then((landing) => { if (active && landing.headshot) setHeadshots((current) => new Map(current).set(apiId, landing.headshot!)); }).catch(() => {});
    });
    return () => { active = false; };
  }, [picks, headshots]);

  const pickedApiIds = useMemo(() => new Set(picks.map((pick) => pick.player?.player_api_id).filter(Boolean)), [picks]);
  const ownedApiIds = useMemo(() => new Set(roster.filter((season) => season.fantasy_team_id).map((season) => season.player?.player_api_id).filter(Boolean)), [roster]);

  async function runSearch() {
    if (query.trim().length < 2) return;
    setSearching(true); setError("");
    try { setResults(await searchNhlPlayers(query.trim())); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to search NHL players."); }
    finally { setSearching(false); }
  }

  async function submitPick(player: NhlPlayerSearchResult) {
    if (!activePick) return;
    const right = getProspectRight(rights, player.playerId, player.name);
    if (right) { setError(`${player.name} already belongs to ${right.team.team_name}.`); return; }
    if (ownedApiIds.has(player.playerId)) { setError(`${player.name} already belongs to a GLDHL roster.`); return; }
    if (!window.confirm(`Select ${player.name} for ${activePick.team.team_name} with Round ${activePick.round}, Pick ${activePick.pick_in_round}?`)) return;
    setSavingPlayerId(player.playerId); setError(""); setMessage("");
    try {
      await makeCompetitiveBalancePick({ pickId: activePick.id, playerApiId: player.playerId, playerName: player.name, position: displayPosition(player.positionCode), nhlTeam: player.teamAbbrev || player.lastTeamAbbrev });
      setMessage(`${activePick.team.team_name} selected ${player.name}. He has been added to Acquired Prospects.`);
      setActivePick(null); setQuery(""); setResults([]); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to submit that selection."); }
    finally { setSavingPlayerId(""); }
  }

  async function undoPick(pick: CompetitiveBalancePick) {
    if (!window.confirm(`Undo ${pick.player?.full_name || "this selection"} at Pick #${pick.overall_pick}?`)) return;
    setError(""); setMessage("");
    try { await undoCompetitiveBalancePick(pick.id); setMessage(`Pick #${pick.overall_pick} is open again.`); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to undo that selection."); }
  }

  return <div>
    <PageMeta title="Competitive Balance Draft | GLDHL" description="Great Lakes Dynasty Hockey League Competitive Balance Draft" />
    <PageBreadcrumb pageTitle="Competitive Balance Draft" />
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-emerald-950 to-cyan-950 p-6 text-white shadow-lg sm:p-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">2027 Draft · Based on 2026 Standings</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Competitive Balance Draft</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">The bottom three franchises receive two selections in the same order. Eligible selections must be rookie-eligible and cannot already belong to a GLDHL farm system or roster.</p><div className="mt-5 flex flex-wrap gap-2">{picks.slice(0, 3).map((pick) => <span key={pick.id} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold ring-1 ring-white/15">#{pick.pick_in_round} {pick.team.abbreviation}</span>)}</div></header>
      {error && <p role="alert" className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm font-semibold text-error-700">{error}</p>}
      {message && <p className="rounded-xl border border-success-200 bg-success-50 p-4 text-sm font-semibold text-success-700">{message}</p>}
      {activePick && user && <section ref={selectionPanelRef} className="scroll-mt-20 rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-500/30 dark:bg-brand-500/10"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-500">Commissioner Selection</p><h2 className="mt-1 text-xl font-black text-gray-900 dark:text-white">{activePick.team.team_name} · Round {activePick.round}, Pick {activePick.pick_in_round}</h2></div><button type="button" onClick={() => { setActivePick(null); setResults([]); setQuery(""); }} className="text-sm font-bold text-gray-500">Close</button></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }} placeholder="Search an NHL player, e.g. Anton Frondell" className="h-11 flex-1 rounded-lg border border-brand-200 bg-white px-3 text-sm dark:border-brand-500/30 dark:bg-gray-950" /><button type="button" disabled={searching || query.trim().length < 2} onClick={() => void runSearch()} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{searching ? "Searching…" : "Search Players"}</button></div>{results.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{results.map((player) => { const right = getProspectRight(rights, player.playerId, player.name); const unavailable = Boolean(right || pickedApiIds.has(player.playerId) || ownedApiIds.has(player.playerId)); return <button key={player.playerId} type="button" disabled={unavailable || Boolean(savingPlayerId)} onClick={() => void submitPick(player)} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 text-left disabled:cursor-not-allowed disabled:opacity-55 dark:border-gray-700 dark:bg-gray-900"><span><span className="block font-bold text-gray-900 dark:text-white">{player.name}</span><span className="text-xs text-gray-500">{displayPosition(player.positionCode)} · {player.teamAbbrev || player.lastTeamAbbrev || "NHL team unavailable"}</span></span><span className={`text-xs font-black ${unavailable ? "text-error-500" : "text-brand-500"}`}>{right ? `${right.team.abbreviation} rights` : pickedApiIds.has(player.playerId) ? "Drafted" : ownedApiIds.has(player.playerId) ? "Owned" : savingPlayerId === player.playerId ? "Selecting…" : "Select"}</span></button>; })}</div>}<p className="mt-3 text-xs text-gray-500">The database verifies commissioner access when you submit. Farm-system and existing GLDHL ownership conflicts are blocked automatically.</p></section>}
      {loading ? <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />)}</div> : [1, 2].map((round) => <section key={round} className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]"><div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">2027 Competitive Balance Draft</p><h2 className="text-2xl font-black text-gray-900 dark:text-white">Round {round}</h2></div><div className="grid gap-4 p-4 md:grid-cols-3">{picks.filter((pick) => pick.round === round).map((pick) => <PickCard key={pick.id} pick={pick} headshot={pick.player?.player_api_id ? headshots.get(pick.player.player_api_id) : undefined} canSubmit={Boolean(user)} onSelect={(row) => { setActivePick(row); setQuery(""); setResults([]); setError(""); }} onUndo={(row) => void undoPick(row)} />)}</div></section>)}
    </div>
  </div>;
}
