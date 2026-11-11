import { supabase } from "./supabase";
import { POOLSTERS_LEAGUE_ID, requireSupportedLeague } from "./leagueIdentity";

export type League = {
  id: string;
  slug: string;
  name: string;
  current_season: number;
  first_recorded_season: number;
  is_enabled: boolean;
  logo_url?: string | null;
  core_setup_ready?: boolean;
};
export type LeagueMembership = {
  league_id: string;
  user_id: string;
  role: "member" | "commissioner";
};

export async function fetchLeague(leagueId = POOLSTERS_LEAGUE_ID) {
  requireSupportedLeague(leagueId);
  const { data, error } = await supabase.from("leagues").select("*")
    .eq("id", leagueId).single();
  if (error) throw error;
  return data as League;
}

export async function fetchLeagueMembership(userId: string, leagueId = POOLSTERS_LEAGUE_ID) {
  requireSupportedLeague(leagueId);
  const { data, error } = await supabase.from("league_memberships").select("league_id,user_id,role")
    .eq("league_id", leagueId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as LeagueMembership | null;
}

export async function fetchLeagueBySlug(slug: string) {
  const { data, error } = await supabase.from("leagues").select("*").eq("slug",slug).single();
  if (error) throw error;
  return data as League;
}
