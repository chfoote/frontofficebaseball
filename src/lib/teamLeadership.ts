import { supabase } from "./supabase";

export type LeadershipSlot = "C" | "A1" | "A2";

export type TeamLeadership = {
  id: number;
  fantasy_team_id: number;
  season_year: number;
  player_season_id: number;
  slot: LeadershipSlot;
  created_at: string;
  updated_at: string;
};

export async function fetchTeamLeadership(teamId: number, seasonYear: number) {
  const { data, error } = await supabase
    .from("team_leadership")
    .select("*")
    .eq("fantasy_team_id", teamId)
    .eq("season_year", seasonYear)
    .order("slot");
  if (error) throw error;
  return (data ?? []) as TeamLeadership[];
}

export async function fetchSeasonLeadership(seasonYear: number) {
  const { data, error } = await supabase
    .from("team_leadership")
    .select("*")
    .eq("season_year", seasonYear);
  if (error) throw error;
  return (data ?? []) as TeamLeadership[];
}

export async function fetchPlayerLeadership(playerSeasonIds: number[]) {
  if (!playerSeasonIds.length) return [];
  const { data, error } = await supabase
    .from("team_leadership")
    .select("*")
    .in("player_season_id", playerSeasonIds);
  if (error) throw error;
  return (data ?? []) as TeamLeadership[];
}

export async function setTeamLeadershipSlot({
  teamId,
  seasonYear,
  slot,
  playerSeasonId,
}: {
  teamId: number;
  seasonYear: number;
  slot: LeadershipSlot;
  playerSeasonId: number | null;
}) {
  if (playerSeasonId === null) {
    const { error } = await supabase
      .from("team_leadership")
      .delete()
      .eq("fantasy_team_id", teamId)
      .eq("season_year", seasonYear)
      .eq("slot", slot);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("team_leadership")
    .upsert({ fantasy_team_id: teamId, season_year: seasonYear, player_season_id: playerSeasonId, slot }, { onConflict: "fantasy_team_id,season_year,slot" });
  if (error) throw error;
}
