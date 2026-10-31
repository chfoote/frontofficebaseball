import { useEffect, useState } from "react";
import { Link } from "react-router";
import LeagueBrand from "../../components/common/LeagueBrand";
import PageMeta from "../../components/common/PageMeta";
import PoolstersBrand from "../../components/common/PoolstersBrand";
import { useAuth } from "../../context/AuthContext";
import { applyTeamBranding, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { fetchLatestUserTeamAssignment, fetchUserTeamAssignment, type TeamUserAssignmentWithTeam } from "../../lib/teamUserAssignments";

export default function LeagueWelcome() {
  const { user, isAdmin } = useAuth();
  const [assignment, setAssignment] = useState<TeamUserAssignmentWithTeam | null>(null);
  const [team, setTeam] = useState<FantasyTeam | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      try {
        const assigned = await fetchUserTeamAssignment(user.id, CURRENT_LEAGUE_SEASON) || await fetchLatestUserTeamAssignment(user.id);
        if (!active) return;
        setAssignment(assigned);
        if (assigned?.fantasy_team) {
          const branding = await fetchTeamBrandingHistory(assigned.fantasy_team_id).catch(() => []);
          if (active) setTeam(applyTeamBranding(assigned.fantasy_team, branding, CURRENT_LEAGUE_SEASON));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [user]);

  const displayName = isAdmin ? "Admin" : assignment?.profile?.display_name
    || user?.user_metadata?.display_name
    || [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(Boolean).join(" ")
    || user?.email?.split("@")[0]
    || "Manager";

  return (
    <div className="mx-auto max-w-5xl">
      <PageMeta title="Welcome to Poolsters | Front Office Baseball" description="Poolsters league home, hosted by Front Office Baseball." />
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-8 text-white shadow-xl sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-24 -top-28 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute -bottom-36 -right-20 h-96 w-96 rounded-full bg-blue-600/15 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.9)_1px,transparent_1px)] [background-size:42px_42px]" />
        </div>

        <div className="relative">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-2xl bg-white px-5 py-3 shadow-lg"><LeagueBrand /></div>
            <div className="my-6 flex w-full max-w-md items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-white/15" />
              <span className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">League hosted by FOB</span>
              <span className="h-px flex-1 bg-white/15" />
            </div>
            <div className="rounded-3xl bg-white px-6 py-4 shadow-lg"><PoolstersBrand /></div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Season {CURRENT_LEAGUE_SEASON}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Welcome, {displayName}</h1>
            <p className="mt-2 text-sm text-slate-300">You’re signed in and ready to manage your club.</p>
          </div>

          <div className="mx-auto mt-8 max-w-2xl rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm sm:p-6">
            {loading ? <div className="h-24 animate-pulse rounded-2xl bg-white/10" /> : team ? (
              <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-lg">
                  {team.logo ? <img src={team.logo} alt={`${team.team_name} logo`} className="h-full w-full object-contain" /> : <span className="text-xl font-black text-slate-700">{team.abbreviation}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Your Poolsters franchise</p>
                  <h2 className="mt-1 text-2xl font-black">{team.team_name}</h2>
                  <p className="mt-1 text-sm text-slate-300">{team.abbreviation} · {assignment?.role === "co_owner" ? "Co-owner" : "General Manager"}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">Signed in as {user?.email}</p>
                </div>
              </div>
            ) : (
              <div className="text-center"><h2 className="text-lg font-bold">No franchise assigned yet</h2><p className="mt-1 text-sm text-slate-300">Your account is active. A commissioner can connect it to a Poolsters team.</p></div>
            )}
          </div>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/front-office" className="rounded-xl bg-emerald-500 px-6 py-3 text-center text-sm font-black text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400">Enter My Front Office</Link>
            {team && <Link to={`/teams/${team.abbreviation}`} className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-center text-sm font-bold text-white transition hover:bg-white/15">View My Team</Link>}
          </div>
        </div>
      </section>
    </div>
  );
}
