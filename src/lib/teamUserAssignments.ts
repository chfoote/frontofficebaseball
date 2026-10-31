import { supabase } from "./supabase";
import { applyTeamBranding, fetchAllTeamManagerTenures, fetchFantasyTeams, fetchTeamBrandingHistory, type FantasyTeam } from "./fantasyTeams";
import type { Profile } from "./profiles";
import { CURRENT_LEAGUE_SEASON, FIRST_LEAGUE_SEASON } from "./leagueSeasons";

export type TeamUserAssignment = {
  id: number;
  user_id: string;
  user_email: string | null;
  fantasy_team_id: number;
  season_year: number;
  role: "owner" | "co_owner" | "admin";
  created_at: string;
  updated_at: string;
};

export type TeamUserAssignmentWithTeam = TeamUserAssignment & {
  fantasy_team: FantasyTeam | null;
  profile: Profile | null;
};

export async function fetchUserTeamAssignment(
  userId: string,
  seasonYear: number,
) {
  const { data, error } = await supabase
    .from("team_user_assignments")
    .select("*, fantasy_team:fantasy_teams(*), profile:profiles(*)")
    .eq("user_id", userId)
    .eq("season_year", seasonYear)
    .maybeSingle();

  if (error) throw error;
  return data as TeamUserAssignmentWithTeam | null;
}

export async function fetchLatestUserTeamAssignment(userId: string) {
  const { data, error } = await supabase
    .from("team_user_assignments")
    .select("*, fantasy_team:fantasy_teams(*), profile:profiles(*)")
    .eq("user_id", userId)
    .order("season_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as TeamUserAssignmentWithTeam | null;
}

export async function fetchTeamUserAssignments(seasonYear: number) {
  const { data, error } = await supabase
    .from("team_user_assignments")
    .select("*, fantasy_team:fantasy_teams(*), profile:profiles(*)")
    .eq("season_year", seasonYear)
    .order("user_email", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as TeamUserAssignmentWithTeam[];
}

export async function fetchAllTeamUserAssignments() {
  const [{ data, error }, branding, tenures, teams] = await Promise.all([
    supabase
      .from("team_user_assignments")
      .select("*, fantasy_team:fantasy_teams(*), profile:profiles(*)")
      .order("season_year", { ascending: false }),
    fetchTeamBrandingHistory(),
    fetchAllTeamManagerTenures(),
    fetchFantasyTeams(true),
  ]);

  if (error) throw error;
  const assignments = ((data ?? []) as TeamUserAssignmentWithTeam[]).map((assignment) => ({
    ...assignment,
    fantasy_team: assignment.fantasy_team
      ? applyTeamBranding(assignment.fantasy_team, branding, assignment.season_year)
      : null,
  }));
  const syntheticAssignments: TeamUserAssignmentWithTeam[] = [];
  tenures.forEach((tenure) => {
    const team = teams.find((candidate) => candidate.id === tenure.fantasy_team_id);
    if (!team) return;
    // Teams 2–10 are the original franchises and had the same manager in both
    // 2026 and 2027. Some databases still contain the old 2027 start date from
    // manager_since, so normalize that legacy seed until the corrective
    // migration has been applied. Team 1 intentionally has separate managers.
    const hasEarlierRecordedManager = tenures.some((candidate) =>
      candidate.fantasy_team_id === tenure.fantasy_team_id
      && candidate.id !== tenure.id
      && candidate.start_season < tenure.start_season,
    );
    const isLegacyOriginalManager = tenure.fantasy_team_id >= 2
      && tenure.fantasy_team_id <= 10
      && tenure.start_season === 2027
      && !hasEarlierRecordedManager;
    const firstSeason = isLegacyOriginalManager
      ? FIRST_LEAGUE_SEASON
      : Math.max(tenure.start_season, FIRST_LEAGUE_SEASON);
    const finalSeason = Math.min(tenure.end_season ?? CURRENT_LEAGUE_SEASON, CURRENT_LEAGUE_SEASON);
    for (let seasonYear = firstSeason; seasonYear <= finalSeason; seasonYear += 1) {
      if (assignments.some((assignment) => assignment.fantasy_team_id === tenure.fantasy_team_id && assignment.season_year === seasonYear)) continue;
      const syntheticUserId = tenure.profile_id || `tenure-${tenure.id}`;
      syntheticAssignments.push({
        id: -tenure.id * 10_000 - seasonYear,
        user_id: syntheticUserId,
        user_email: null,
        fantasy_team_id: tenure.fantasy_team_id,
        season_year: seasonYear,
        role: "owner",
        created_at: "",
        updated_at: "",
        fantasy_team: applyTeamBranding(team, branding, seasonYear),
        profile: {
          id: syntheticUserId,
          email: null,
          display_name: tenure.manager_name,
          is_admin: false,
          created_at: "",
          updated_at: "",
        },
      });
    }
  });
  return [...assignments, ...syntheticAssignments].sort((a, b) => b.season_year - a.season_year || a.fantasy_team_id - b.fantasy_team_id);
}

export async function upsertUserTeamAssignment({
  userId,
  userEmail,
  fantasyTeamId,
  seasonYear,
}: {
  userId: string;
  userEmail: string;
  fantasyTeamId: number;
  seasonYear: number;
}) {
  const { data, error } = await supabase
    .from("team_user_assignments")
    .upsert(
      {
        user_id: userId,
        user_email: userEmail,
        fantasy_team_id: fantasyTeamId,
        season_year: seasonYear,
        role: "owner",
      },
      { onConflict: "user_id,season_year" },
    )
    .select("*, fantasy_team:fantasy_teams(*), profile:profiles(*)")
    .single();

  if (error) throw error;
  return data as TeamUserAssignmentWithTeam;
}

export async function upsertTeamUserAssignment({
  userId,
  userEmail,
  fantasyTeamId,
  seasonYear,
}: {
  userId: string;
  userEmail: string | null;
  fantasyTeamId: number;
  seasonYear: number;
}) {
  const { data, error } = await supabase
    .from("team_user_assignments")
    .upsert(
      {
        user_id: userId,
        user_email: userEmail,
        fantasy_team_id: fantasyTeamId,
        season_year: seasonYear,
        role: "owner",
      },
      { onConflict: "user_id,season_year" },
    )
    .select("*, fantasy_team:fantasy_teams(*), profile:profiles(*)")
    .single();

  if (error) throw error;
  return data as TeamUserAssignmentWithTeam;
}

export async function deleteTeamUserAssignment(id: number) {
  const { error } = await supabase
    .from("team_user_assignments")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
