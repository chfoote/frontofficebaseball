import { fetchFantasyTeams } from "../../lib/fantasyTeams";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import LeagueBrand from "../../components/common/LeagueBrand";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { useLeague } from "../../context/LeagueContext";
import { fetchAccountLeagues, isAdminSetupMissing, administrationError, type LeagueOverview } from "../../lib/leagueAdministration";
import { fetchUserTeamAssignment } from "../../lib/teamUserAssignments";
import { leagueUrl } from "../../lib/leagueIdentity";

export default function LeagueWelcome() {
  const { user, isPlatformAdmin, isAdmin, adminSetupPending } = useAuth();
  const { league, membership } = useLeague();
  const [leagues, setLeagues] = useState<LeagueOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const siteAdmin = isPlatformAdmin || (adminSetupPending && isAdmin);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true); setError("");
    (async () => {
      try { const rows = await fetchAccountLeagues(); if (active) setLeagues(rows); }
      catch (reason) {
        if (!isAdminSetupMissing(reason)) throw reason;
        const [assignment, teams] = await Promise.all([fetchUserTeamAssignment(user.id, league.current_season),fetchFantasyTeams()]);
        if (active) setLeagues(membership || isAdmin ? [{ ...league, logo_url: "/poolsters-logo.png", sport: "MLB", membership_role: membership?.role || null, team: assignment?.fantasy_team || null, team_count: teams.length, member_count: 0, commissioners: membership?.role === "commissioner" ? [{user_id:user.id,name:user.email || "Commissioner"}] : [] }] : []);
      }
    })().catch((reason) => { if (active) setError(administrationError(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, league, membership, isAdmin, attempt]);
  const ready = leagues.filter((item) => item.is_enabled).length;
  return <div className="space-y-6">
    <PageMeta title="My Leagues | Front Office Baseball" description="Your leagues and teams on Front Office Baseball" />
    <section className="flex flex-col gap-5 border-b border-gray-200 pb-6 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-500">Your account</p><h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{siteAdmin ? "League Dashboard" : "My Leagues"}</h1><p className="mt-2 text-sm text-gray-500">{user?.email}</p></div>{siteAdmin && <Link to="/admin/leagues" className="rounded-lg bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-white">Site Administration →</Link>}</section>
    {siteAdmin && <div className="grid grid-cols-3 gap-3">{[[ready,"Active leagues"],[leagues.length-ready,"In setup"],[leagues.reduce((sum,item)=>sum+item.team_count,0),"Active teams"]].map(([value,label])=><div key={label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"><p className="text-2xl font-bold dark:text-white">{loading ? "—" : value}</p><p className="mt-1 text-xs text-gray-500">{label}</p></div>)}</div>}
    <div className="flex items-center gap-3"><img src="/mlb-logo.svg" alt="MLB" className="h-9 w-16 object-contain" /><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Baseball Leagues</h2><p className="text-xs text-gray-500">{siteAdmin ? "All leagues on Front Office Baseball" : "Your teams and league memberships"}</p></div></div>
    {error && <div role="alert" className="rounded-lg bg-error-50 p-4 text-sm text-error-600">{error}<button type="button" onClick={()=>setAttempt(value=>value+1)} className="ml-3 underline">Retry</button></div>}
    {loading ? <p role="status" className="text-sm text-gray-500">Loading your leagues…</p> : !error && !leagues.length ? <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">You haven’t joined a league yet. Ask your commissioner to add your registered email.</div> : <div className="grid items-start gap-4 lg:grid-cols-2">{leagues.map(item=>{
      const enterable=item.is_enabled;
      return <article key={item.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800"><div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-gray-50 p-2 dark:bg-white">{item.logo_url ? <img src={item.logo_url} alt={`${item.name} logo`} className="max-h-full max-w-full object-contain" /> : <span className="text-xl font-bold text-gray-500">{item.name.slice(0,2).toUpperCase()}</span>}</div><div className="min-w-0 flex-1"><h3 className="text-xl font-bold text-gray-900 dark:text-white">{item.name}</h3><p className="mt-1 text-xs text-gray-500">MLB · {item.current_season} season{item.founded_year ? ` · Est. ${item.founded_year}` : ""}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${enterable ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{enterable ? "Active" : "In setup"}</span></div>
      <div className="px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{item.team ? "Your franchise" : item.membership_role === "commissioner" ? "Your role" : siteAdmin ? "Site access" : "Your membership"}</p><div className="mt-2 flex items-center gap-3">{item.team?.logo && <img src={item.team.logo} alt="" className="h-10 w-10 object-contain" />}<div><p className="font-semibold text-gray-900 dark:text-white">{item.team?.team_name || (item.membership_role === "commissioner" ? "Commissioner" : siteAdmin ? "Site Administrator" : "Team assignment pending")}</p><p className="mt-0.5 text-xs text-gray-500">{item.member_display_name || user?.email}{item.team && item.membership_role === "commissioner" ? " · Commissioner" : ""}</p></div></div>{item.commissioners.length>0 && <p className="mt-3 text-xs text-gray-500">Commissioner: {item.commissioners.map(person=>person.name).join(", ")}</p>}</div>
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-5 py-3 dark:border-gray-800">{(enterable || item.core_setup_ready) ? <a href={leagueUrl(item.slug,item.is_enabled && !item.team ? "/league-dashboard" : "/front-office")} className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white">{enterable ? "Enter Front Office →" : "Open League Setup →"}</a> : <span className="text-xs text-gray-400">League setup tools are not open yet</span>}{(siteAdmin || item.membership_role === "commissioner") && <Link to={`/admin/users?league=${item.id}`} className="text-xs font-semibold text-brand-500 hover:underline">Manage users & teams</Link>}</div></article>;
    })}</div>}
    <footer className="border-t border-gray-200 pt-5 dark:border-gray-800"><LeagueBrand /></footer>
  </div>;
}
