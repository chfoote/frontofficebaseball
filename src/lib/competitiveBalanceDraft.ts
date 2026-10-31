import { supabase } from "./supabase";
import type { FantasyPlayer } from "./fantasyPlayers";
import type { FantasyTeam } from "./fantasyTeams";

export type CompetitiveBalancePick = {
  id: number;
  draft_season: number;
  based_on_season: number;
  round: number;
  pick_in_round: number;
  overall_pick: number;
  fantasy_team_id: number;
  player_id: number | null;
  player_season_id: number | null;
  position: string | null;
  nhl_team: string | null;
  selected_at: string | null;
  transaction_id: number | null;
  team: FantasyTeam;
  player: FantasyPlayer | null;
};

const select = "*, team:fantasy_teams(*), player:players(*)";

export async function fetchCompetitiveBalancePicks(draftSeason = 2027) {
  const { data, error } = await supabase.from("competitive_balance_draft_picks").select(select).eq("draft_season", draftSeason).order("overall_pick");
  if (error) throw error;
  return (data ?? []) as CompetitiveBalancePick[];
}

export async function makeCompetitiveBalancePick(input: { pickId: number; playerApiId: string; playerName: string; position: string; nhlTeam?: string | null }) {
  const { data, error } = await supabase.rpc("make_competitive_balance_pick", { p_pick_id: input.pickId, p_player_api_id: input.playerApiId, p_player_name: input.playerName, p_position: input.position, p_nhl_team: input.nhlTeam || null });
  if (error) throw error;
  return data as CompetitiveBalancePick;
}

export async function undoCompetitiveBalancePick(pickId: number) {
  const { data, error } = await supabase.rpc("undo_competitive_balance_pick", { p_pick_id: pickId });
  if (error) throw error;
  return data as CompetitiveBalancePick;
}
