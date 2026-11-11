import { supabase } from "./supabase";

export type LeagueOverview = {
  id: string; slug: string; name: string; current_season: number; first_recorded_season: number;
  is_enabled: boolean; core_setup_ready?: boolean; sport?: string; logo_url?: string | null; founded_year?: number | null; team_limit?: number;
  membership_role: "member" | "commissioner" | null; member_display_name?: string | null;
  team: { id: number; team_name: string; abbreviation: string; logo: string | null } | null;
  team_count: number; member_count: number; commissioners: { user_id: string; name: string }[];
};
export type LeagueMember = { user_id: string; email: string | null; account_name: string | null; display_name: string | null; role: "member" | "commissioner"; team_id: number | null };
export type LeagueDirectory = { league: LeagueOverview; members: LeagueMember[]; teams: { id: number; team_name: string; abbreviation: string }[] };
export type RegisteredAccount = { id: string; email: string | null; display_name: string | null };
export type LeagueSetup = { name: string; slug: string; season: number; teamLimit: number; commissionerEmail: string; foundedYear: number | null; logoUrl: string | null };

export function isAdminSetupMissing(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && ["PGRST202", "42P01", "42703"].includes(String(error.code)));
}
export async function fetchAccountLeagues() {
  const { data, error } = await supabase.rpc("account_league_dashboard");
  if (error) throw error;
  return (data || []) as LeagueOverview[];
}
export async function fetchLeagueDirectory(leagueId: string, season: number) {
  const { data, error } = await supabase.rpc("admin_league_directory", { p_league_id: leagueId, p_season: season });
  if (error) throw error;
  return data as LeagueDirectory;
}
export async function fetchRegisteredAccounts() {
  const { data, error } = await supabase.rpc("platform_account_directory");
  if (error) throw error;
  return (data || []) as RegisteredAccount[];
}
export async function createLeague(input: LeagueSetup) {
  const { data, error } = await supabase.rpc("platform_create_league", { p_name: input.name, p_slug: input.slug, p_season: input.season, p_team_limit: input.teamLimit, p_commissioner_email: input.commissionerEmail, p_founded_year: input.foundedYear, p_logo_url: input.logoUrl });
  if (error) throw error;
  return data as string;
}
export async function addLeagueMember(leagueId: string, email: string) {
  const { error } = await supabase.rpc("admin_add_league_member", { p_league_id: leagueId, p_email: email });
  if (error) throw error;
}
export async function saveLeagueMember(leagueId: string, season: number, member: LeagueMember) {
  const { error } = await supabase.rpc("admin_save_league_member", { p_league_id: leagueId, p_user_id: member.user_id, p_season: season, p_display_name: member.display_name, p_role: member.role, p_team_id: member.team_id });
  if (error) throw error;
}
export async function removeLeagueMember(leagueId: string, userId: string) {
  const { error } = await supabase.rpc("admin_remove_league_member", { p_league_id: leagueId, p_user_id: userId });
  if (error) throw error;
}
export async function updateAccountName(userId: string, name: string) {
  const { error } = await supabase.rpc("platform_update_account_name", { p_user_id: userId, p_name: name });
  if (error) throw error;
}
export function administrationError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "23505") return "That league URL or team assignment is already in use.";
  if (error && typeof error === "object" && "code" in error && error.code === "23514") return "Check the league details: use 2–30 teams, a valid logo URL, and an established year no later than the season.";
  if (isAdminSetupMissing(error)) return "The required league database update has not been applied yet. Your existing data is unchanged.";
  return error && typeof error === "object" && "message" in error ? String(error.message) : "Unable to complete this action. Please try again.";
}

export async function updateLeagueDetails(leagueId: string, input: { name: string; teamLimit: number; foundedYear: number | null; logoUrl: string | null }) {
  const { error } = await supabase.rpc("platform_update_league", { p_league_id: leagueId, p_name: input.name, p_team_limit: input.teamLimit, p_founded_year: input.foundedYear, p_logo_url: input.logoUrl });
  if (error) throw error;
}
