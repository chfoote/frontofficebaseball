import { supabase } from "./supabase";
import type { FantasyPlayer, PlayerSeasonWithRelations } from "./fantasyPlayers";
import type { FantasyTeam } from "./fantasyTeams";

export type BuyoutPenalty = {
  id: number;
  buyout_id: number;
  fantasy_team_id: number;
  player_id: number;
  season_year: number;
  amount: number;
  player: FantasyPlayer | null;
};

export type PlayerBuyout = {
  id: number;
  player_id: number;
  fantasy_team_id: number;
  source_player_season_id: number | null;
  transaction_id: number | null;
  buyout_date: string;
  contract_season_year: number;
  original_aav: number;
  original_term_end_year: number;
  free_agent_season: number;
  notes: string | null;
  status: "active" | "reversed";
  created_at: string;
  player: FantasyPlayer | null;
  fantasy_team: FantasyTeam | null;
  source_player_season: PlayerSeasonWithRelations | null;
  buyout_cap_penalties: BuyoutPenalty[];
};

const buyoutSelect = `*, player:players(*), fantasy_team:fantasy_teams(*), source_player_season:player_seasons(*,player:players(*),fantasy_team:fantasy_teams(*)), buyout_cap_penalties(*)`;

export async function fetchPlayerBuyouts() {
  const { data, error } = await supabase
    .from("player_buyouts")
    .select(buyoutSelect)
    .order("buyout_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlayerBuyout[];
}

export async function fetchBuyoutPenalties(seasonYear: number, teamId?: number) {
  let query = supabase
    .from("buyout_cap_penalties")
    .select("*, player:players(*)")
    .eq("season_year", seasonYear);
  if (teamId) query = query.eq("fantasy_team_id", teamId);
  const { data, error } = await query.order("amount", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BuyoutPenalty[];
}

export async function processPlayerBuyout(input: {
  playerSeasonId: number;
  buyoutDate: string;
  freeAgentSeason: number;
  penalties: { season_year: number; amount: number }[];
  notes: string | null;
}) {
  const { data, error } = await supabase.rpc("process_player_buyout", {
    p_player_season_id: input.playerSeasonId,
    p_buyout_date: input.buyoutDate,
    p_free_agent_season: input.freeAgentSeason,
    p_penalties: input.penalties,
    p_notes: input.notes,
  });
  if (error) throw error;
  return data as PlayerBuyout;
}

