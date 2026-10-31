import type { Auction } from "./auctions";
import type { FantasyTeamFinish } from "./fantasyTeams";
import { assignmentForTeamSeason, type GmStats } from "./gmStats";
import type { ContractRetention } from "./retentions";
import type { TeamUserAssignmentWithTeam } from "./teamUserAssignments";
import type { GmTradeOfferActivity } from "./tradeOffers";

export type GmFrontOfficeStats = {
  userId: string;
  auctionsEntered: number;
  auctionWins: number;
  ufaWins: number;
  rfaWins: number;
  winningAuctionAav: number;
  winningAuctionValue: number;
  tradeOffersProposed: number;
  counterOffers: number;
  offersCompleted: number;
  offersDeclined: number;
  offersRevoked: number;
  retentionsSent: number;
  retainedAnnualAav: number;
  retentionsReceived: number;
  retainedReliefReceived: number;
  championships: number;
  runnerUpFinishes: number;
  thirdPlaceFinishes: number;
};

const empty = (userId: string): GmFrontOfficeStats => ({
  userId, auctionsEntered: 0, auctionWins: 0, ufaWins: 0, rfaWins: 0,
  winningAuctionAav: 0, winningAuctionValue: 0, tradeOffersProposed: 0,
  counterOffers: 0, offersCompleted: 0, offersDeclined: 0, offersRevoked: 0,
  retentionsSent: 0, retainedAnnualAav: 0, retentionsReceived: 0,
  retainedReliefReceived: 0, championships: 0, runnerUpFinishes: 0, thirdPlaceFinishes: 0,
});

export function buildGmFrontOfficeStats(
  managers: GmStats[],
  assignments: TeamUserAssignmentWithTeam[],
  auctions: Auction[],
  offers: GmTradeOfferActivity[],
  retentions: ContractRetention[],
  finishes: FantasyTeamFinish[],
  selectedSeason: number | null,
) {
  const result = new Map(managers.map((manager) => [manager.userId, empty(manager.userId)]));
  const forTeam = (teamId: number, seasonYear: number) => {
    const assignment = assignmentForTeamSeason(assignments, teamId, seasonYear);
    return assignment ? result.get(assignment.user_id) : undefined;
  };

  auctions.filter((auction) => selectedSeason === null || auction.season_year === selectedSeason).forEach((auction) => {
    auction.auction_bids.forEach((bid) => { const stats = forTeam(bid.fantasy_team_id, auction.season_year); if (stats) stats.auctionsEntered += 1; });
    if (auction.status !== "completed" || auction.award_undone_at || !auction.winning_bid) return;
    const stats = forTeam(auction.winning_bid.fantasy_team_id, auction.season_year);
    if (!stats) return;
    stats.auctionWins += 1;
    if (auction.auction_type === "rfa") stats.rfaWins += 1; else stats.ufaWins += 1;
    stats.winningAuctionAav += auction.winning_bid.aav;
    stats.winningAuctionValue += auction.winning_bid.aav * auction.winning_bid.years;
  });

  offers.filter((offer) => selectedSeason === null || offer.season_year === selectedSeason).forEach((offer) => {
    const assignment = assignments.find((candidate) => candidate.user_id === offer.created_by)
      || assignmentForTeamSeason(assignments, offer.from_team_id, offer.season_year);
    const stats = assignment ? result.get(assignment.user_id) : undefined;
    if (!stats) return;
    const count = Number(offer.offer_count);
    stats.tradeOffersProposed += count;
    if (offer.is_counter) stats.counterOffers += count;
    if (offer.status === "completed") stats.offersCompleted += count;
    if (["declined", "admin_declined"].includes(offer.status)) stats.offersDeclined += count;
    if (offer.status === "revoked") stats.offersRevoked += count;
  });

  retentions.filter((retention) => retention.status === "active" && (selectedSeason === null || retention.first_season_year === selectedSeason)).forEach((retention) => {
    const sender = forTeam(retention.retaining_team_id, retention.first_season_year);
    if (sender) { sender.retentionsSent += 1; sender.retainedAnnualAav += retention.annual_retained_amount; }
    const receiver = forTeam(retention.receiving_team_id, retention.first_season_year);
    if (receiver) { receiver.retentionsReceived += 1; receiver.retainedReliefReceived += retention.annual_retained_amount; }
  });

  finishes.filter((finish) => selectedSeason === null || finish.season_year === selectedSeason).forEach((finish) => {
    const stats = forTeam(finish.fantasy_team_id, finish.season_year);
    if (!stats) return;
    if (finish.placement === 1) stats.championships += 1;
    if (finish.placement === 2) stats.runnerUpFinishes += 1;
    if (finish.placement === 3) stats.thirdPlaceFinishes += 1;
  });
  return result;
}

export function gmDistinctions(manager: GmStats, frontOffice: GmFrontOfficeStats, allManagers: GmStats[], allFrontOffice: Map<string, GmFrontOfficeStats>) {
  const isLeader = (value: number, select: (gm: GmStats, front: GmFrontOfficeStats) => number) => value > 0 && value === Math.max(...allManagers.map((gm) => select(gm, allFrontOffice.get(gm.userId) || empty(gm.userId))));
  return [
    isLeader(manager.trades, (gm) => gm.trades) ? { label: "The Dealmaker", icon: "🤝", detail: "League leader in completed trades" } : null,
    isLeader(manager.uniqueTradePartners, (gm) => gm.uniqueTradePartners) ? { label: "The Networker", icon: "🕸️", detail: "League leader in unique trade partners" } : null,
    isLeader(manager.totalContractValue, (gm) => gm.totalContractValue) ? { label: "The Big Spender", icon: "💰", detail: "League leader in contract value committed" } : null,
    isLeader(frontOffice.auctionWins, (_gm, front) => front.auctionWins) ? { label: "The Auctioneer", icon: "🔨", detail: "League leader in auction victories" } : null,
    frontOffice.championships > 0 ? { label: "Champion GM", icon: "🏆", detail: `${frontOffice.championships} championship${frontOffice.championships === 1 ? "" : "s"}` } : null,
  ].filter((item): item is { label: string; icon: string; detail: string } => Boolean(item));
}
