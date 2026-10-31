import { supabase } from "./supabase";

export type FantasyTeam = {
  id: number;
  team_name: string;
  abbreviation: string;
  logo: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  manager_name: string | null;
  manager_since: string | null;
  eastern_farm_system: string | null;
  western_farm_system: string | null;
  championships: number;
  runner_up_finishes: number;
  third_place_finishes: number;
  created_date: string;
  active: boolean;
  notes: string | null;
};

export type FantasyTeamInput = {
  team_name: string;
  abbreviation: string;
  logo: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  manager_name: string | null;
  manager_since: string | null;
  eastern_farm_system: string | null;
  western_farm_system: string | null;
  championships: number;
  runner_up_finishes: number;
  third_place_finishes: number;
  active: boolean;
  notes: string | null;
};

export type FantasyTeamManagerTenure = {
  id: number;
  fantasy_team_id: number;
  manager_name: string;
  profile_id: string | null;
  start_season: number;
  end_season: number | null;
};

export type FantasyTeamFinish = {
  id: number;
  fantasy_team_id: number;
  season_year: number;
  placement: 1 | 2 | 3;
};

export type FantasyTeamBranding = {
  id: number;
  fantasy_team_id: number;
  start_season: number;
  end_season: number | null;
  team_name: string;
  abbreviation: string;
  logo: string | null;
  primary_color: string | null;
  secondary_color: string | null;
};

export async function fetchFantasyTeams(includeInactive = false) {
  let query = supabase
    .from("fantasy_teams")
    .select("*")
    .order("id", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FantasyTeam[];
}

export async function fetchFantasyTeamByAbbreviation(
  abbreviation: string,
  includeInactive = false,
) {
  let query = supabase
    .from("fantasy_teams")
    .select("*");

  query = /^\d+$/.test(abbreviation)
    ? query.eq("id", Number(abbreviation))
    : query.ilike("abbreviation", abbreviation);

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as FantasyTeam | null;
}

export async function fetchTeamBrandingHistory(teamId?: number) {
  let query = supabase
    .from("fantasy_team_branding_history")
    .select("*")
    .order("start_season", { ascending: true });
  if (teamId) query = query.eq("fantasy_team_id", teamId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FantasyTeamBranding[];
}

export function getBrandingForSeason(history: FantasyTeamBranding[], teamId: number, seasonYear: number) {
  return [...history]
    .filter((item) => item.fantasy_team_id === teamId && item.start_season <= seasonYear && (item.end_season === null || item.end_season >= seasonYear))
    .sort((a, b) => b.start_season - a.start_season)[0] ?? null;
}

export function applyTeamBranding(team: FantasyTeam, history: FantasyTeamBranding[], seasonYear: number): FantasyTeam {
  const branding = getBrandingForSeason(history, team.id, seasonYear);
  return branding ? { ...team, team_name: branding.team_name, abbreviation: branding.abbreviation, logo: branding.logo, primary_color: branding.primary_color, secondary_color: branding.secondary_color } : team;
}

export async function createTeamBranding(input: Omit<FantasyTeamBranding, "id">) {
  const { data, error } = await supabase.from("fantasy_team_branding_history").insert(input).select().single();
  if (error) throw error;
  return data as FantasyTeamBranding;
}

export async function deleteTeamBranding(id: number) {
  const { error } = await supabase.from("fantasy_team_branding_history").delete().eq("id", id);
  if (error) throw error;
}

export async function createFantasyTeam(team: FantasyTeamInput) {
  const { data, error } = await supabase
    .from("fantasy_teams")
    .insert(team)
    .select()
    .single();

  if (error) throw error;
  return data as FantasyTeam;
}

export async function updateFantasyTeam(id: number, team: FantasyTeamInput) {
  const { data, error } = await supabase
    .from("fantasy_teams")
    .update(team)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as FantasyTeam;
}

export async function deactivateFantasyTeam(id: number) {
  const { error } = await supabase
    .from("fantasy_teams")
    .update({ active: false })
    .eq("id", id);

  if (error) throw error;
}

export async function fetchTeamManagerTenures(teamId: number) {
  const { data, error } = await supabase
    .from("fantasy_team_manager_tenures")
    .select("*")
    .eq("fantasy_team_id", teamId)
    .order("start_season", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FantasyTeamManagerTenure[];
}

export async function fetchAllTeamManagerTenures() {
  const { data, error } = await supabase
    .from("fantasy_team_manager_tenures")
    .select("*")
    .order("fantasy_team_id", { ascending: true })
    .order("start_season", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FantasyTeamManagerTenure[];
}

export function getManagerForSeason(
  tenures: FantasyTeamManagerTenure[],
  seasonYear: number,
) {
  return [...tenures]
    .filter((tenure) => tenure.start_season <= seasonYear && (tenure.end_season === null || tenure.end_season >= seasonYear))
    .sort((a, b) => b.start_season - a.start_season)[0] ?? null;
}

export async function createTeamManagerTenure(input: Omit<FantasyTeamManagerTenure, "id" | "profile_id"> & { profile_id?: string | null }) {
  const { data, error } = await supabase
    .from("fantasy_team_manager_tenures")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as FantasyTeamManagerTenure;
}

export async function deleteTeamManagerTenure(id: number) {
  const { error } = await supabase
    .from("fantasy_team_manager_tenures")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function fetchTeamFinishes(teamId: number) {
  const { data, error } = await supabase
    .from("fantasy_team_finishes")
    .select("*")
    .eq("fantasy_team_id", teamId)
    .order("season_year", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FantasyTeamFinish[];
}

export async function fetchAllTeamFinishes() {
  const { data, error } = await supabase
    .from("fantasy_team_finishes")
    .select("*")
    .order("season_year", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FantasyTeamFinish[];
}

export async function createTeamFinish(input: Omit<FantasyTeamFinish, "id">) {
  const { data, error } = await supabase
    .from("fantasy_team_finishes")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as FantasyTeamFinish;
}

export async function deleteTeamFinish(id: number) {
  const { error } = await supabase.from("fantasy_team_finishes").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadTeamLogo(file: File) {
  const extension = file.name.split(".").pop() || "png";
  const fileName = `${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("team-logos")
    .upload(fileName, file, { upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from("team-logos").getPublicUrl(fileName);
  return data.publicUrl;
}
