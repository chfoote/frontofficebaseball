import { supabase } from "./supabase";
import type { FantasyPlayer, PlayerSeasonWithRelations } from "./fantasyPlayers";
import { applyTeamBranding, fetchTeamBrandingHistory, type FantasyTeam } from "./fantasyTeams";

type TransactionTradePlayer = {
  id: number;
  from_team_id: number;
  to_team_id: number;
  to_team: FantasyTeam | null;
  player_season: PlayerSeasonWithRelations | null;
};

type TransactionTradeOffer = {
  id: number;
  from_team: FantasyTeam | null;
  to_team: FantasyTeam | null;
  third_team: FantasyTeam | null;
  trade_offer_players: TransactionTradePlayer[];
};

export type TransactionAction =
  | "signed"
  | "called_up"
  | "waived"
  | "claimed"
  | "bought_out"
  | "retained"
  | "injured_reserve"
  | "long_term_injured_reserve"
  | "released_to_rfa_offer"
  | "matched_rfa_offer"
  | "competitive_balance_drafted"
  | "traded";

export type LeagueTransaction = {
  id: number;
  player_season_id: number | null;
  player_id: number | null;
  fantasy_team_id: number | null;
  transaction_type: "signing" | "extension" | "trade" | "waiver" | "release" | "draft";
  action: TransactionAction;
  transaction_date: string;
  season_year: number;
  salary: number | null;
  term_end_year: number | null;
  contract_group: string | null;
  position: string | null;
  notes: string | null;
  description: string | null;
  trade_offer_id: number | null;
  related_trade_offer_id: number | null;
  created_at: string;
  player: FantasyPlayer | null;
  fantasy_team: FantasyTeam | null;
  player_season: PlayerSeasonWithRelations | null;
  trade_offer: TransactionTradeOffer | null;
  related_trade_offer: { id: number } | null;
};

export async function fetchLeagueTransactions() {
  const { data, error } = await supabase
    .from("league_transactions")
    .select(`
      *,
      player:players(*),
      fantasy_team:fantasy_teams(*),
      player_season:player_seasons(*),
      trade_offer:trade_offers!league_transactions_trade_offer_id_fkey(
        id,
        from_team:fantasy_teams!trade_offers_from_team_id_fkey(*),
        to_team:fantasy_teams!trade_offers_to_team_id_fkey(*),
        third_team:fantasy_teams!trade_offers_third_team_id_fkey(*),
        trade_offer_players(
          id,
          from_team_id,
          to_team_id,
          to_team:fantasy_teams!trade_offer_players_to_team_id_fkey(*),
          player_season:player_seasons(*, player:players(*))
        )
      ),
      related_trade_offer:trade_offers!league_transactions_related_trade_offer_id_fkey(id)
    `)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const transactions = (data ?? []) as LeagueTransaction[];
  const branding = await fetchTeamBrandingHistory();
  return transactions.map((transaction) => {
    const brand = (team: FantasyTeam | null) => team ? applyTeamBranding(team, branding, transaction.season_year) : null;
    return {
      ...transaction,
      fantasy_team: brand(transaction.fantasy_team),
      trade_offer: transaction.trade_offer ? {
        ...transaction.trade_offer,
        from_team: brand(transaction.trade_offer.from_team),
        to_team: brand(transaction.trade_offer.to_team),
        third_team: brand(transaction.trade_offer.third_team),
        trade_offer_players: transaction.trade_offer.trade_offer_players.map((move) => ({ ...move, to_team: brand(move.to_team) })),
      } : null,
    };
  });
}

export async function postSigningTransaction(
  season: PlayerSeasonWithRelations,
  transactionDate: string,
  action: TransactionAction,
  relatedTradeOfferId?: number | null,
  transactionPosition?: string | null,
) {
  if (!season.fantasy_team_id) {
    throw new Error("Choose a fantasy team before posting a signing transaction.");
  }

  if (action === "claimed") {
    const { error: carryoverError } = await supabase.rpc("carry_claimed_contract_forward", {
      p_player_season_id: season.id,
    });
    if (carryoverError) throw carryoverError;
  }

  const { data, error } = await supabase
    .from("league_transactions")
    .insert({
      player_season_id: season.id,
      player_id: season.player_id,
      fantasy_team_id: season.fantasy_team_id,
      transaction_type: "signing",
      action,
      transaction_date: transactionDate,
      season_year: season.season_year,
      salary: season.salary,
      term_end_year: season.term_end_year,
      contract_group: season.contract_group,
      position: transactionPosition?.trim() || season.position,
      notes: season.notes,
      related_trade_offer_id: relatedTradeOfferId ?? null,
    })
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}

export async function deleteLeagueTransaction(transactionId: number) {
  const { error } = await supabase
    .from("league_transactions")
    .delete()
    .eq("id", transactionId)
    .is("trade_offer_id", null);
  if (error) throw error;
}
