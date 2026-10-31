import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { useAuth } from "../context/AuthContext";
import { fetchProfile, type Profile } from "../lib/profiles";
import { fetchLatestUserTeamAssignment, fetchUserTeamAssignment, type TeamUserAssignmentWithTeam } from "../lib/teamUserAssignments";
import { applyTeamBranding, fetchTeamBrandingHistory, fetchTeamFinishes, type FantasyTeamFinish } from "../lib/fantasyTeams";
import { CURRENT_LEAGUE_SEASON } from "../lib/leagueSeasons";

function initials(value: string) {
  const parts = value.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "GL").toUpperCase();
}

const medalStyles = {
  1: "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300",
  2: "border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-500/10 dark:text-gray-200",
  3: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300",
};
const medalIcons = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function UserProfiles() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignment, setAssignment] = useState<TeamUserAssignmentWithTeam | null>(null);
  const [finishes, setFinishes] = useState<FantasyTeamFinish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    Promise.all([
      fetchProfile(user.id),
      fetchUserTeamAssignment(user.id, CURRENT_LEAGUE_SEASON).then((row) => row || fetchLatestUserTeamAssignment(user.id)),
    ]).then(async ([profileRow, assignmentRow]) => {
      if (!active) return;
      setProfile(profileRow);
      if (assignmentRow?.fantasy_team) {
        const [history, finishRows] = await Promise.all([
          fetchTeamBrandingHistory(assignmentRow.fantasy_team_id),
          fetchTeamFinishes(assignmentRow.fantasy_team_id),
        ]);
        if (!active) return;
        setAssignment({ ...assignmentRow, fantasy_team: applyTeamBranding(assignmentRow.fantasy_team, history, assignmentRow.season_year) });
        setFinishes(finishRows);
      } else {
        setAssignment(assignmentRow);
        setFinishes([]);
      }
    }).catch((err: Error) => active && setError(err.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [user]);

  const email = profile?.email || user?.email || "No email available";
  const displayName = profile?.display_name?.trim() || email;
  const team = assignment?.fantasy_team || null;
  const finishesByPlacement = useMemo(() => ([1, 2, 3] as const).map((placement) => ({
    placement,
    years: finishes.filter((finish) => finish.placement === placement).map((finish) => finish.season_year).sort((a, b) => b - a),
  })), [finishes]);

  return <>
    <PageMeta title="My Profile | Front Office Baseball League" description="FOBL account and team profile" />
    <PageBreadcrumb pageTitle="My Profile" />
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      {loading ? <div className="py-12 text-center text-sm text-gray-500">Loading profile…</div> : error ? <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div> : <div className="space-y-6">
        <section className="flex flex-col gap-5 rounded-xl border border-gray-200 p-5 dark:border-gray-800 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xl font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{initials(displayName)}</div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-semibold text-gray-800 dark:text-white/90">{displayName}</h1>
            <p className="mt-1 break-all text-sm text-gray-500 dark:text-gray-400">{email}</p>
            <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">{team ? team.team_name : "No FOBL team assigned"}</p>
            {profile?.is_admin && <span className="mt-2 inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">League Admin</span>}
          </div>
        </section>

        {team ? <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="h-2" style={{ background: `linear-gradient(90deg, ${team.primary_color || "#1d4ed8"}, ${team.secondary_color || "#f97316"})` }} />
          <div className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {team.logo ? <img src={team.logo} alt={`${team.team_name} logo`} className="h-16 w-16 rounded-lg border border-gray-200 object-contain p-1 dark:border-gray-800" /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 font-semibold dark:bg-gray-800">{team.abbreviation}</div>}
                <div><p className="text-xs font-medium uppercase text-gray-500">Assigned Team · {assignment?.season_year}</p><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{team.team_name}</h2></div>
              </div>
              <Link to={`/teams/${team.id}`} className="text-sm font-medium text-brand-500 hover:underline">View team page</Link>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">{finishesByPlacement.map(({ placement, years }) => <div key={placement} className={`rounded-lg border p-4 text-center ${medalStyles[placement]}`}><span className="text-2xl">{medalIcons[placement]}</span><p className="mt-1 text-lg font-semibold">{years.length}</p><p className="mt-1 text-xs font-medium">{years.length ? years.join(", ") : "—"}</p></div>)}</div>
          </div>
        </section> : <section className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Your account has not been assigned to a FOBL team yet.</section>}

        <p className="text-xs text-gray-500 dark:text-gray-400">Display names and team assignments are managed by league administrators in Auction Admin.</p>
      </div>}
    </div>
  </>;
}
