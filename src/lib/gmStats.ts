import type { LeagueTransaction, TransactionAction } from "./transactions";
import type { TeamUserAssignmentWithTeam } from "./teamUserAssignments";

export type GmActionKey = Exclude<TransactionAction, "traded">;

export type GmSeasonTeam = {
  season: number;
  teamId: number;
  teamName: string;
  abbreviation: string;
  logo: string | null;
  primaryColor: string | null;
};

export type GmStats = {
  userId: string;
  displayName: string;
  email: string | null;
  seasons: number[];
  teams: GmSeasonTeam[];
  actions: Record<GmActionKey, number>;
  trades: number;
  twoTeamTrades: number;
  threeTeamTrades: number;
  playersAcquired: number;
  playersTradedAway: number;
  uniqueTradePartners: number;
  tradePartners: Array<{ userId: string; displayName: string; count: number }>;
  contractsSigned: number;
  totalAavCommitted: number;
  totalContractValue: number;
  largestAav: number;
  totalMoves: number;
  transactions: LeagueTransaction[];
};

const actionKeys: GmActionKey[] = [
  "signed", "called_up", "waived", "claimed", "bought_out", "retained",
  "injured_reserve", "long_term_injured_reserve", "released_to_rfa_offer", "matched_rfa_offer",
  "competitive_balance_drafted",
];

function emptyActions() {
  return Object.fromEntries(actionKeys.map((key) => [key, 0])) as Record<GmActionKey, number>;
}

function managerName(assignment: TeamUserAssignmentWithTeam) {
  return assignment.profile?.display_name || assignment.fantasy_team?.manager_name || assignment.user_email?.split("@")[0] || "Unknown GM";
}

function closestTeamAssignment(
  assignments: TeamUserAssignmentWithTeam[],
  teamId: number,
  seasonYear: number,
) {
  return assignments
    .filter((assignment) => assignment.fantasy_team_id === teamId)
    .sort((a, b) => {
      const distance = Math.abs(a.season_year - seasonYear) - Math.abs(b.season_year - seasonYear);
      return distance || b.season_year - a.season_year;
    })[0];
}

export function assignmentForTeamSeason(
  assignments: TeamUserAssignmentWithTeam[],
  teamId: number,
  seasonYear: number,
) {
  return assignments.find((assignment) => assignment.fantasy_team_id === teamId && assignment.season_year === seasonYear)
    || closestTeamAssignment(assignments, teamId, seasonYear);
}

export function buildGmStats(
  assignments: TeamUserAssignmentWithTeam[],
  transactions: LeagueTransaction[],
  selectedSeason: number | null,
) {
  const exactSeasonAssignments = assignments.filter((assignment) => selectedSeason === null || assignment.season_year === selectedSeason);
  const relevantAssignments = selectedSeason === null
    ? assignments
    : [
        ...exactSeasonAssignments,
        ...[...new Set(assignments.map((assignment) => assignment.fantasy_team_id))]
          .filter((teamId) => !exactSeasonAssignments.some((assignment) => assignment.fantasy_team_id === teamId))
          .map((teamId) => closestTeamAssignment(assignments, teamId, selectedSeason))
          .filter((assignment): assignment is TeamUserAssignmentWithTeam => Boolean(assignment)),
      ];
  const managers = new Map<string, GmStats>();

  relevantAssignments.forEach((assignment) => {
    const current = managers.get(assignment.user_id);
    const team: GmSeasonTeam = {
      season: assignment.season_year,
      teamId: assignment.fantasy_team_id,
      teamName: assignment.fantasy_team?.team_name || "Unknown team",
      abbreviation: assignment.fantasy_team?.abbreviation || "—",
      logo: assignment.fantasy_team?.logo || null,
      primaryColor: assignment.fantasy_team?.primary_color || null,
    };
    if (current) {
      if (!current.seasons.includes(assignment.season_year)) current.seasons.push(assignment.season_year);
      if (!current.teams.some((item) => item.season === team.season && item.teamId === team.teamId)) current.teams.push(team);
      return;
    }
    managers.set(assignment.user_id, {
      userId: assignment.user_id,
      displayName: managerName(assignment),
      email: assignment.profile?.email || assignment.user_email,
      seasons: [assignment.season_year],
      teams: [team],
      actions: emptyActions(),
      trades: 0,
      twoTeamTrades: 0,
      threeTeamTrades: 0,
      playersAcquired: 0,
      playersTradedAway: 0,
      uniqueTradePartners: 0,
      tradePartners: [],
      contractsSigned: 0,
      totalAavCommitted: 0,
      totalContractValue: 0,
      largestAav: 0,
      totalMoves: 0,
      transactions: [],
    });
  });

  const partnerCounts = new Map<string, Map<string, number>>();
  const addPartner = (managerId: string, partnerId: string) => {
    const counts = partnerCounts.get(managerId) || new Map<string, number>();
    counts.set(partnerId, (counts.get(partnerId) || 0) + 1);
    partnerCounts.set(managerId, counts);
  };

  transactions
    .filter((transaction) => selectedSeason === null || transaction.season_year === selectedSeason)
    .forEach((transaction) => {
      if (transaction.trade_offer_id && transaction.trade_offer) {
        const teamIds = [transaction.trade_offer.from_team?.id, transaction.trade_offer.to_team?.id, transaction.trade_offer.third_team?.id]
          .filter((id): id is number => typeof id === "number");
        const participants = teamIds.map((teamId) => assignmentForTeamSeason(assignments, teamId, transaction.season_year)).filter((item): item is TeamUserAssignmentWithTeam => Boolean(item));
        participants.forEach((assignment) => {
          const stats = managers.get(assignment.user_id);
          if (!stats) return;
          stats.trades += 1;
          if (teamIds.length === 3) stats.threeTeamTrades += 1;
          else stats.twoTeamTrades += 1;
          stats.totalMoves += 1;
          stats.transactions.push(transaction);
          const moves = transaction.trade_offer?.trade_offer_players || [];
          stats.playersAcquired += moves.filter((move) => move.to_team_id === assignment.fantasy_team_id).length;
          stats.playersTradedAway += moves.filter((move) => move.from_team_id === assignment.fantasy_team_id).length;
          participants.filter((partner) => partner.user_id !== assignment.user_id).forEach((partner) => addPartner(assignment.user_id, partner.user_id));
        });
        return;
      }

      if (!transaction.fantasy_team_id || transaction.action === "traded") return;
      const assignment = assignmentForTeamSeason(assignments, transaction.fantasy_team_id, transaction.season_year);
      const stats = assignment ? managers.get(assignment.user_id) : null;
      if (!stats) return;
      const action = transaction.action as GmActionKey;
      if (actionKeys.includes(action)) stats.actions[action] += 1;
      stats.totalMoves += 1;
      stats.transactions.push(transaction);
      if (["signed", "called_up", "matched_rfa_offer"].includes(transaction.action)) {
        const aav = transaction.salary || 0;
        const years = transaction.term_end_year ? Math.max(transaction.term_end_year - transaction.season_year + 1, 1) : 1;
        stats.contractsSigned += 1;
        stats.totalAavCommitted += aav;
        stats.totalContractValue += aav * years;
        stats.largestAav = Math.max(stats.largestAav, aav);
      }
    });

  managers.forEach((stats) => {
    stats.seasons.sort((a, b) => b - a);
    stats.teams.sort((a, b) => b.season - a.season);
    stats.transactions.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at));
    stats.tradePartners = [...(partnerCounts.get(stats.userId) || new Map()).entries()].map(([userId, count]) => ({
      userId,
      displayName: managers.get(userId)?.displayName || "Unknown GM",
      count,
    })).sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName));
    stats.uniqueTradePartners = stats.tradePartners.length;
  });

  return [...managers.values()].sort((a, b) => b.totalMoves - a.totalMoves || a.displayName.localeCompare(b.displayName));
}

export type GmTradeRelationship = {
  key: string;
  managerA: GmStats;
  managerB: GmStats;
  trades: LeagueTransaction[];
  twoTeamTrades: number;
  threeTeamTrades: number;
  playersExchanged: number;
  lastTradeDate: string;
};

export function buildGmTradeRelationships(
  managers: GmStats[],
  assignments: TeamUserAssignmentWithTeam[],
  transactions: LeagueTransaction[],
  selectedSeason: number | null,
) {
  const managerById = new Map(managers.map((manager) => [manager.userId, manager]));
  const relationships = new Map<string, GmTradeRelationship>();

  transactions
    .filter((transaction) => transaction.trade_offer_id && transaction.trade_offer && (selectedSeason === null || transaction.season_year === selectedSeason))
    .forEach((transaction) => {
      const teamIds = [transaction.trade_offer?.from_team?.id, transaction.trade_offer?.to_team?.id, transaction.trade_offer?.third_team?.id]
        .filter((id): id is number => typeof id === "number");
      const managerIds = [...new Set(teamIds.map((teamId) => assignmentForTeamSeason(assignments, teamId, transaction.season_year)?.user_id).filter((id): id is string => Boolean(id)))];
      const managerForTeam = (teamId: number) => assignmentForTeamSeason(assignments, teamId, transaction.season_year)?.user_id;
      for (let first = 0; first < managerIds.length; first += 1) {
        for (let second = first + 1; second < managerIds.length; second += 1) {
          const ids = [managerIds[first], managerIds[second]].sort();
          const managerA = managerById.get(ids[0]);
          const managerB = managerById.get(ids[1]);
          if (!managerA || !managerB) continue;
          const key = ids.join(":");
          const current = relationships.get(key) || {
            key,
            managerA,
            managerB,
            trades: [],
            twoTeamTrades: 0,
            threeTeamTrades: 0,
            playersExchanged: 0,
            lastTradeDate: transaction.transaction_date,
          };
          current.trades.push(transaction);
          if (teamIds.length === 3) current.threeTeamTrades += 1;
          else current.twoTeamTrades += 1;
          current.playersExchanged += (transaction.trade_offer?.trade_offer_players || []).filter((move) => {
            const fromManager = managerForTeam(move.from_team_id);
            const toManager = managerForTeam(move.to_team_id);
            return fromManager && toManager && ids.includes(fromManager) && ids.includes(toManager) && fromManager !== toManager;
          }).length;
          if (transaction.transaction_date > current.lastTradeDate) current.lastTradeDate = transaction.transaction_date;
          relationships.set(key, current);
        }
      }
    });

  return [...relationships.values()]
    .map((relationship) => ({ ...relationship, trades: relationship.trades.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)) }))
    .sort((a, b) => b.trades.length - a.trades.length || b.lastTradeDate.localeCompare(a.lastTradeDate));
}
