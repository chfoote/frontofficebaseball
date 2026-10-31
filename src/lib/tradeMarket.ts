import { supabase } from "./supabase";
import type { FantasyTeam } from "./fantasyTeams";
import type { PlayerSeasonWithRelations } from "./fantasyPlayers";

export type TradeBlockListing = {
  id: number;
  player_season_id: number;
  fantasy_team_id: number;
  season_year: number;
  listed_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  player_season: PlayerSeasonWithRelations | null;
  fantasy_team: FantasyTeam | null;
};

export type PlayerTradeInterest = {
  id: number;
  player_season_id: number;
  interested_team_id: number;
  owner_team_id: number;
  season_year: number;
  created_by: string;
  created_at: string;
  player_season: PlayerSeasonWithRelations | null;
  interested_team: FantasyTeam | null;
  owner_team: FantasyTeam | null;
};

const listingSelect = `
  *,
  fantasy_team:fantasy_teams!trade_block_listings_fantasy_team_id_fkey(*),
  player_season:player_seasons(*, player:players(*), fantasy_team:fantasy_teams(*))
`;

const interestSelect = `
  *,
  interested_team:fantasy_teams!player_trade_interests_interested_team_id_fkey(*),
  owner_team:fantasy_teams!player_trade_interests_owner_team_id_fkey(*),
  player_season:player_seasons(*, player:players(*), fantasy_team:fantasy_teams(*))
`;

export async function fetchTradeBlockListings(seasonYear: number) {
  const { data, error } = await supabase
    .from("trade_block_listings")
    .select(listingSelect)
    .eq("season_year", seasonYear)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TradeBlockListing[];
}

export async function addTradeBlockListing({
  playerSeasonId,
  fantasyTeamId,
  seasonYear,
  listedBy,
}: {
  playerSeasonId: number;
  fantasyTeamId: number;
  seasonYear: number;
  listedBy: string;
}) {
  const { data, error } = await supabase
    .from("trade_block_listings")
    .insert({
      player_season_id: playerSeasonId,
      fantasy_team_id: fantasyTeamId,
      season_year: seasonYear,
      listed_by: listedBy,
    })
    .select(listingSelect)
    .single();
  if (error) throw error;
  return data as TradeBlockListing;
}

export async function removeTradeBlockListing(id: number) {
  const { error } = await supabase.from("trade_block_listings").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPlayerTradeInterests(seasonYear: number) {
  const { data, error } = await supabase
    .from("player_trade_interests")
    .select(interestSelect)
    .eq("season_year", seasonYear)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlayerTradeInterest[];
}

export async function addPlayerTradeInterest({
  playerSeasonId,
  interestedTeamId,
  ownerTeamId,
  seasonYear,
  createdBy,
}: {
  playerSeasonId: number;
  interestedTeamId: number;
  ownerTeamId: number;
  seasonYear: number;
  createdBy: string;
}) {
  const { data, error } = await supabase
    .from("player_trade_interests")
    .insert({
      player_season_id: playerSeasonId,
      interested_team_id: interestedTeamId,
      owner_team_id: ownerTeamId,
      season_year: seasonYear,
      created_by: createdBy,
    })
    .select(interestSelect)
    .single();
  if (error) throw error;
  return data as PlayerTradeInterest;
}

export async function removePlayerTradeInterest(id: number) {
  const { error } = await supabase.from("player_trade_interests").delete().eq("id", id);
  if (error) throw error;
}
