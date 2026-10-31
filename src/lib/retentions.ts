import { supabase } from "./supabase";
import type { FantasyPlayer, PlayerSeasonWithRelations } from "./fantasyPlayers";
import type { FantasyTeam } from "./fantasyTeams";

export type RetentionAdjustment = {
  id: number; retention_id: number; fantasy_team_id: number; player_id: number; season_year: number;
  adjustment_type: "charge" | "relief"; amount: number; player: FantasyPlayer | null;
  retention?: ContractRetention | null;
};
export type ContractRetention = {
  id: number; player_id: number; source_player_season_id: number | null; trade_offer_id: number;
  retaining_team_id: number; receiving_team_id: number; retention_percentage: number; original_aav: number;
  annual_retained_amount: number; first_season_year: number; term_end_year: number; retention_date: string;
  notes: string | null; status: "active" | "reversed"; created_at: string; player: FantasyPlayer | null;
  retaining_team: FantasyTeam | null; receiving_team: FantasyTeam | null; source_player_season: PlayerSeasonWithRelations | null;
  retention_cap_adjustments: RetentionAdjustment[];
};

const retentionSelect = `*,player:players(*),retaining_team:fantasy_teams!contract_retentions_retaining_team_id_fkey(*),receiving_team:fantasy_teams!contract_retentions_receiving_team_id_fkey(*),source_player_season:player_seasons(*,player:players(*)),retention_cap_adjustments(*)`;

export async function fetchContractRetentions() {
  const { data, error } = await supabase.from("contract_retentions").select(retentionSelect).order("retention_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContractRetention[];
}

export async function fetchRetentionAdjustments(seasonYear: number, teamId?: number) {
  let query = supabase.from("retention_cap_adjustments").select(`*,player:players(*),retention:contract_retentions(*,retaining_team:fantasy_teams!contract_retentions_retaining_team_id_fkey(*),receiving_team:fantasy_teams!contract_retentions_receiving_team_id_fkey(*))`).eq("season_year", seasonYear);
  if (teamId) query = query.eq("fantasy_team_id", teamId);
  const { data, error } = await query.order("amount", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RetentionAdjustment[];
}

export async function processContractRetention(input: { tradeOfferId: number; playerSeasonId: number; retentionDate: string; firstSeasonYear: number; retainedAmount: number; notes: string | null }) {
  const { data, error } = await supabase.rpc("process_contract_retention", {
    p_trade_offer_id: input.tradeOfferId, p_player_season_id: input.playerSeasonId, p_retention_date: input.retentionDate,
    p_first_season_year: input.firstSeasonYear, p_notes: input.notes,
    p_retained_amount: input.retainedAmount,
  });
  if (error) throw error;
  return data as ContractRetention;
}
