import { supabase } from "./supabase";
import type { FantasyTeam } from "./fantasyTeams";

export type AuctionBidHistory = {
  id: number;
  auction_id: number;
  bid_id: number | null;
  fantasy_team_id: number;
  created_by: string | null;
  aav: number;
  years: number;
  total_value: number;
  is_qualifying_bid: boolean;
  event_type: "submitted" | "updated" | "backfilled";
  recorded_at: string;
  seconds_remaining: number | null;
  fantasy_team: FantasyTeam | null;
};

export async function fetchAuctionBidHistory(auctionIds: number[]) {
  if (auctionIds.length === 0) return [];

  const { data, error } = await supabase
    .from("auction_bid_history")
    .select("*, fantasy_team:fantasy_teams(*)")
    .in("auction_id", auctionIds)
    .order("recorded_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AuctionBidHistory[];
}
