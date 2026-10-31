import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import PositionBadge from "../../components/hockey/PositionBadge";
import Checkbox from "../../components/form/input/Checkbox";
import { useAuth } from "../../context/AuthContext";
import { applyTeamBranding, fetchFantasyTeams, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import {
  fetchPlayerSeasonsByTeamAndSeason,
  type PlayerSeasonWithRelations,
} from "../../lib/fantasyPlayers";
import {
  fetchNhlGoalieStats,
  fetchNhlSkaterStats,
  getGoalieScore,
  getSkaterScore,
  type NhlGoalieRecord,
  type NhlSkaterRecord,
} from "../../lib/nhl";
import {
  fetchLatestUserTeamAssignment,
  fetchUserTeamAssignment,
} from "../../lib/teamUserAssignments";
import {
  createTradeOffer,
  createAdminTradeOffer,
  createAdminThreeTeamTrade,
  createThreeTeamTradeOffer,
  dismissTradeOffer,
  fetchTradeOfferDismissals,
  fetchTradeOffers,
  updateTradeOfferStatus,
  respondToThreeTeamTradeOffer,
  type TradeOffer,
  type TradeOfferPlayer,
} from "../../lib/tradeOffers";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { fetchBuyoutPenalties } from "../../lib/buyouts";
import { fetchRetentionAdjustments } from "../../lib/retentions";

const seasonOptions = Array.from({ length: 10 }, (_, index) => 2026 + index);
const rosterLimit = 23;
const positionOrder = ["C", "LW", "RW", "D", "G"];
const activeRosterPositions = new Set(["C", "LW", "RW", "D", "G"]);
const tradeablePositions = new Set([...activeRosterPositions, "RFA", "PROSPECT", "AP"]);
const dismissableTradeStatuses = new Set(["admin_declined", "completed", "countered"]);

function nhlSeasonId(year: number) {
  return (year - 1) * 10000 + year;
}

function salaryCapForSeason(_year: number) {
  return 47_000_000;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type NhlPlayerStatMaps = {
  skaters: Map<string, NhlSkaterRecord>;
  goalies: Map<string, NhlGoalieRecord>;
};

const emptyNhlPlayerStatMaps = (): NhlPlayerStatMaps => ({
  skaters: new Map(),
  goalies: new Map(),
});

function formatCurrency(value: number | null | undefined) {
  return value === null || value === undefined
    ? "No salary"
    : currencyFormatter.format(value);
}

function formatSignedCurrency(value: number) {
  if (value === 0) return "No cap change";

  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${currencyFormatter.format(Math.abs(value))}`;
}

function formatPlayerChange(value: number) {
  if (value === 0) return "No roster size change";

  const prefix = value > 0 ? "+" : "";
  const playerLabel = Math.abs(value) === 1 ? "Player" : "Players";
  return `${prefix}${value} ${playerLabel}`;
}

function formatImpact(salaryChange: number, rosterChange: number) {
  return `${formatSignedCurrency(salaryChange)} / ${formatPlayerChange(rosterChange)}`;
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;

  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return fallback;
}

function formatScore(score: number) {
  return score.toFixed(2);
}

function formatProjectedValue(currentValue: string | number, projectedValue: string | number) {
  return currentValue === projectedValue
    ? String(currentValue)
    : `${currentValue} -> ${projectedValue}`;
}

function getPlayerName(season: PlayerSeasonWithRelations) {
  const player = season.player;
  return (
    player?.full_name ||
    [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
    "Unknown Player"
  );
}

function isOlderThanOneDay(value: string | null | undefined) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return Date.now() - date.getTime() > 24 * 60 * 60 * 1000;
}

function getPosition(season: PlayerSeasonWithRelations) {
  return (season.position || "Unassigned").toUpperCase();
}

function getPlayerApiId(season: PlayerSeasonWithRelations) {
  return season.player?.player_api_id || "";
}

function getContractLine(season: PlayerSeasonWithRelations) {
  return `${formatCurrency(season.salary)}${
    season.term_end_year ? ` | ${season.term_end_year}` : ""
  }`;
}

function getScore(
  season: PlayerSeasonWithRelations,
  nhlPlayerStats: NhlPlayerStatMaps,
) {
  if (getPosition(season) === "G") {
    const record = nhlPlayerStats.goalies.get(getPlayerApiId(season));
    return record ? getGoalieScore(record) : 0;
  }
  const record = nhlPlayerStats.skaters.get(getPlayerApiId(season));
  return record ? getSkaterScore(record) : 0;
}

function getDisplayRecord(
  season: PlayerSeasonWithRelations,
  nhlPlayerStats: NhlPlayerStatMaps,
) {
  const apiId = getPlayerApiId(season);
  return getPosition(season) === "G"
    ? nhlPlayerStats.goalies.get(apiId)
    : nhlPlayerStats.skaters.get(apiId);
}

function getPositionRank(position: string) {
  const index = positionOrder.indexOf(position);
  return index === -1 ? positionOrder.length : index;
}

function sortRoster(
  roster: PlayerSeasonWithRelations[],
  nhlPlayerStats: NhlPlayerStatMaps,
) {
  return [...roster].sort((a, b) => {
    const aPositionRank = getPositionRank(getPosition(a));
    const bPositionRank = getPositionRank(getPosition(b));

    if (aPositionRank !== bPositionRank) {
      return aPositionRank - bPositionRank;
    }

    const aScore = getScore(a, nhlPlayerStats);
    const bScore = getScore(b, nhlPlayerStats);

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    return getPlayerName(a).localeCompare(getPlayerName(b));
  });
}

function sumSalary(players: PlayerSeasonWithRelations[]) {
  return players.reduce((total, season) => total + (season.salary ?? 0), 0);
}

function getTradeableRoster(roster: PlayerSeasonWithRelations[]) {
  return roster.filter((season) => tradeablePositions.has(getPosition(season)));
}

function getRosterCount(roster: PlayerSeasonWithRelations[]) {
  return roster.filter((season) => activeRosterPositions.has(getPosition(season))).length;
}

function getActivePlayerCount(players: PlayerSeasonWithRelations[]) {
  return players.filter((season) => activeRosterPositions.has(getPosition(season))).length;
}

function ComplianceItem({
  label,
  value,
  status,
}: {
  label: string;
  value: string | number;
  status?: "good" | "bad";
}) {
  const statusStyles = {
    good: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300",
    bad: "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300",
  };

  return (
    <div
      className={`rounded-lg border p-3 ${
        status
          ? statusStyles[status]
          : "border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
      }`}
    >
      <p className="text-xs font-medium uppercase opacity-75">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function TradeSummaryCard({
  teamName,
  sourceTeamName,
  players,
  tradeNotes,
}: {
  teamName: string;
  sourceTeamName: string;
  players: PlayerSeasonWithRelations[];
  tradeNotes: string;
}) {
  const trimmedNotes = tradeNotes.trim();

  return (
    <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
      <p className="text-xs font-semibold uppercase text-brand-700 dark:text-brand-300">
        Trade Summary
      </p>
      <h3 className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
        {teamName} receives
      </h3>
      {players.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          No players selected from {sourceTeamName}.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {players.map((season) => (
            <li
              key={season.id}
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              {season.player?.player_api_id ? <Link to={`/player-profile?playerId=${season.player.player_api_id}`} className="font-medium text-brand-500 hover:underline">{getPlayerName(season)}</Link> : <span className="font-medium">{getPlayerName(season)}</span>}
              <span className="text-gray-500 dark:text-gray-400">
                {" "}
                ({getContractLine(season)})
              </span>
            </li>
          ))}
        </ul>
      )}
      {trimmedNotes && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-white/70 p-3 dark:border-brand-500/20 dark:bg-gray-950/30">
          <p className="text-xs font-semibold uppercase text-brand-700 dark:text-brand-300">
            Notes
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
            {trimmedNotes}
          </p>
        </div>
      )}
    </div>
  );
}

function TradeOfferPlayerList({ players }: { players: TradeOfferPlayer[] }) {
  if (!players.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Notes-only offer.
      </p>
    );
  }

  return (
    <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
      {players.map((player) => (
        <li key={player.id}>
          <span className="font-medium">
            {player.player_season?.player?.full_name || "Unknown Player"}
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            {" "}
            ({player.from_team?.abbreviation || "?"} to{" "}
            {player.to_team?.abbreviation || "?"})
          </span>
          {player.retention_requested && <span className="ml-2 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Retention requested</span>}
        </li>
      ))}
    </ul>
  );
}

function TradeOfferCard({
  offer,
  canRespond,
  canRevoke,
  canDismiss,
  responding,
  onAccept,
  onDecline,
  onCounter,
  onRevoke,
  onDismiss,
}: {
  offer: TradeOffer;
  canRespond: boolean;
  canRevoke: boolean;
  canDismiss: boolean;
  responding: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCounter: () => void;
  onRevoke: () => void;
  onDismiss: () => void;
}) {
  const statusStyles = {
    pending: "bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-500/10 dark:text-warning-300 dark:ring-warning-500/30",
    accepted: "bg-success-50 text-success-700 ring-success-200 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-500/30",
    declined: "bg-error-50 text-error-700 ring-error-200 dark:bg-error-500/10 dark:text-error-300 dark:ring-error-500/30",
    admin_declined: "bg-error-50 text-error-700 ring-error-200 dark:bg-error-500/10 dark:text-error-300 dark:ring-error-500/30",
    completed: "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30",
    countered: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
    revoked: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
  };

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {[offer.from_team?.team_name, offer.to_team?.team_name, offer.third_team?.team_name].filter(Boolean).join(" / ") || "Unknown Teams"}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 ${
                statusStyles[offer.status]
              }`}
            >
              {offer.status.replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Offer #{offer.id} | {offer.season_year}
          </p>
        </div>

        {canRespond && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAccept}
              disabled={responding}
              className="rounded-lg bg-success-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-success-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={onDecline}
              disabled={responding}
              className="rounded-lg border border-error-200 px-3 py-2 text-xs font-semibold text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-500/30 dark:text-error-300 dark:hover:bg-error-500/10"
            >
              Decline
            </button>
            {!offer.third_team_id && <button type="button" onClick={onCounter} disabled={responding} className="rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-500/30 dark:text-brand-300 dark:hover:bg-brand-500/10">Counter</button>}
          </div>
        )}

        {canRevoke && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRevoke}
              disabled={responding}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Revoke
            </button>
          </div>
        )}

        {canDismiss && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDismiss}
              disabled={responding}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Discard Notification
            </button>
          </div>
        )}
      </div>

      {offer.third_team_id && offer.status === "pending" && <p className="mt-3 text-xs font-medium text-gray-500">Approvals: {offer.to_team?.abbreviation || "Team 2"} {offer.to_team_accepted_at ? "✓" : "pending"} · {offer.third_team?.abbreviation || "Team 3"} {offer.third_team_accepted_at ? "✓" : "pending"}</p>}
      <div className={`mt-4 grid gap-4 ${offer.third_team_id ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            {offer.to_team?.team_name || "Receiving Team"} receives
          </p>
          <TradeOfferPlayerList
            players={offer.trade_offer_players.filter(
              (player) => player.to_team_id === offer.to_team_id,
            )}
          />
        </div>
        {offer.third_team && <div><p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{offer.third_team.team_name} receives</p><TradeOfferPlayerList players={offer.trade_offer_players.filter((player) => player.to_team_id === offer.third_team_id)} /></div>}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            {offer.from_team?.team_name || "Offering Team"} receives
          </p>
          <TradeOfferPlayerList
            players={offer.trade_offer_players.filter(
              (player) => player.to_team_id === offer.from_team_id,
            )}
          />
        </div>
      </div>

      {offer.notes && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30">
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Notes
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
            {offer.notes}
          </p>
        </div>
      )}
    </article>
  );
}

type TeamColumnProps = {
  label: string;
  teams: FantasyTeam[];
  selectedTeamId: string;
  otherTeamId: string;
  excludedTeamIds?: string[];
  onTeamChange: (teamId: string) => void;
  roster: PlayerSeasonWithRelations[];
  selectedIds: Set<number>;
  onTogglePlayer: (playerSeasonId: number, checked: boolean) => void;
  loading: boolean;
  nhlPlayerStats: NhlPlayerStatMaps;
  salaryGoingOut: number;
  salaryComingIn: number;
  netSalaryChange: number;
  netRosterChange: number;
  currentSalary: number;
  currentRosterCount: number;
  teamName: string;
  sourceTeamName: string;
  incomingPlayers: PlayerSeasonWithRelations[];
  tradeNotes: string;
  salaryCap: number;
  destinationTeams?: FantasyTeam[];
  destinations?: Record<number, string>;
  onDestinationChange?: (playerSeasonId: number, teamId: string) => void;
  retentionRequestedIds: Set<number>;
  onRetentionRequestedChange: (playerSeasonId: number, requested: boolean) => void;
};

function TeamColumn({
  label,
  teams,
  selectedTeamId,
  otherTeamId,
  excludedTeamIds,
  onTeamChange,
  roster,
  selectedIds,
  onTogglePlayer,
  loading,
  nhlPlayerStats,
  salaryGoingOut,
  salaryComingIn,
  netSalaryChange,
  netRosterChange,
  currentSalary,
  currentRosterCount,
  teamName,
  sourceTeamName,
  incomingPlayers,
  tradeNotes,
  salaryCap,
  destinationTeams,
  destinations,
  onDestinationChange,
  retentionRequestedIds,
  onRetentionRequestedChange,
}: TeamColumnProps) {
  const selectedTeam = teams.find((team) => String(team.id) === selectedTeamId);
  const tradeableRoster = useMemo(() => getTradeableRoster(roster), [roster]);
  const sortedRoster = useMemo(
    () => sortRoster(tradeableRoster, nhlPlayerStats),
    [tradeableRoster, nhlPlayerStats],
  );
  const projectedSalary = currentSalary + netSalaryChange;
  const projectedCapSpace = salaryCap - projectedSalary;
  const currentCapSpace = salaryCap - currentSalary;
  const projectedRosterCount = currentRosterCount + netRosterChange;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {selectedTeam?.team_name || "Select a team"}
          </h2>
        </div>
        {selectedTeam?.logo && (
          <img
            src={selectedTeam.logo}
            alt={`${selectedTeam.team_name} logo`}
            className="h-10 w-10 rounded object-contain"
          />
        )}
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Team
        </label>
        <select
          value={selectedTeamId}
          onChange={(event) => onTeamChange(event.target.value)}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Choose a team</option>
          {teams.map((team) => (
            <option
              key={team.id}
              value={team.id}
              disabled={(excludedTeamIds || [otherTeamId]).includes(String(team.id))}
            >
              {team.team_name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Going Out
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {formatCurrency(salaryGoingOut)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Coming In
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {formatCurrency(salaryComingIn)}
          </p>
        </div>
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
          <p className="text-xs font-medium uppercase text-brand-700 dark:text-brand-300">
            Net Impact
          </p>
          <p className="mt-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
            {formatImpact(netSalaryChange, netRosterChange)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <ComplianceItem label="Salary Cap" value={formatCurrency(salaryCap)} />
        <ComplianceItem
          label="Salary Spent"
          value={formatProjectedValue(
            formatCurrency(currentSalary),
            formatCurrency(projectedSalary),
          )}
          status={projectedSalary <= salaryCap ? "good" : "bad"}
        />
        <ComplianceItem
          label={projectedCapSpace >= 0 ? "Cap Space" : "Over Cap"}
          value={formatProjectedValue(
            formatCurrency(Math.abs(currentCapSpace)),
            formatCurrency(Math.abs(projectedCapSpace)),
          )}
          status={projectedCapSpace >= 0 ? "good" : "bad"}
        />
        <ComplianceItem
          label="Roster Size"
          value={formatProjectedValue(
            `${currentRosterCount} / ${rosterLimit}`,
            `${projectedRosterCount} / ${rosterLimit}`,
          )}
          status={projectedRosterCount <= rosterLimit ? "good" : "bad"}
        />
      </div>

      <TradeSummaryCard
        teamName={teamName}
        sourceTeamName={sourceTeamName}
        players={incomingPlayers}
        tradeNotes={tradeNotes}
      />

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Roster
          </p>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {tradeableRoster.length} Tradeable Players
          </span>
        </div>

        {!selectedTeamId ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Select a team to preview its roster.
          </div>
        ) : loading ? (
          <div className="rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            Loading roster...
          </div>
        ) : tradeableRoster.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No tradeable active-roster players found for this team and season.
          </div>
        ) : (
          <div className="space-y-2">
            {sortedRoster.map((season) => {
              const checked = selectedIds.has(season.id);
              const record = getDisplayRecord(season, nhlPlayerStats);
              const score = getScore(season, nhlPlayerStats);

              return (
                <div
                  key={season.id}
                  className={`rounded-lg border p-3 transition ${
                    checked
                      ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
                      : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={checked}
                      onChange={(nextChecked) =>
                        onTogglePlayer(season.id, nextChecked)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
                            {record?.teamAbbrevs ? (
                              <img
                                src={`https://assets.nhle.com/logos/nhl/svg/${record.teamAbbrevs.split(',')[0]}_light.svg`}
                                alt={`${record.teamAbbrevs} logo`}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <span className="text-[10px] font-semibold text-gray-500">
                                NHL
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{season.player?.player_api_id ? <Link to={`/player-profile?playerId=${season.player.player_api_id}`} className="text-brand-500 hover:underline">{getPlayerName(season)}</Link> : getPlayerName(season)}</p>
                            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                              {getContractLine(season)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <PositionBadge position={getPosition(season)} className="px-2 py-1 text-xs" />
                          <span className="w-fit rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                            Score {formatScore(score)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {checked && destinationTeams && onDestinationChange && (
                      <div className="mt-3 pl-9">
                        <label className="mb-1 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Traded to</label>
                        <select
                          value={destinations?.[season.id] || ""}
                          onChange={(event) => onDestinationChange(season.id, event.target.value)}
                          className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                        >
                          <option value="">Choose destination</option>
                          {destinationTeams.map((team) => <option key={team.id} value={team.id}>{team.team_name}</option>)}
                        </select>
                      </div>
                    )}
                    {checked && (season.salary || 0) > 0 && (
                      <label className="mt-3 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
                        <input type="checkbox" checked={retentionRequestedIds.has(season.id)} onChange={(event) => onRetentionRequestedChange(season.id, event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-violet-300 text-violet-600" />
                        <span><strong className="block">Request retained salary</strong><span className="mt-0.5 block opacity-80">Admin will set the final amount, up to 25% of {formatCurrency(season.salary)}.</span></span>
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function TradeManager() {
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [team1Id, setTeam1Id] = useState(() => searchParams.get("fromTeam") || "");
  const [team2Id, setTeam2Id] = useState(() => searchParams.get("toTeam") || "");
  const [threeTeamMode, setThreeTeamMode] = useState(false);
  const [team3Id, setTeam3Id] = useState("");
  const [selectedSeason, setSelectedSeason] = useState(() => {
    const requestedSeason = Number(searchParams.get("season"));
    return Number.isInteger(requestedSeason) && requestedSeason >= 2026
      ? requestedSeason
      : CURRENT_LEAGUE_SEASON;
  });
  const [team1Roster, setTeam1Roster] = useState<PlayerSeasonWithRelations[]>([]);
  const [team2Roster, setTeam2Roster] = useState<PlayerSeasonWithRelations[]>([]);
  const [team3Roster, setTeam3Roster] = useState<PlayerSeasonWithRelations[]>([]);
  const [buyoutPenaltyTotals, setBuyoutPenaltyTotals] = useState<Record<string, number>>({});
  const [retentionAdjustmentTotals, setRetentionAdjustmentTotals] = useState<Record<string, number>>({});
  const [tradeOffers, setTradeOffers] = useState<TradeOffer[]>([]);
  const [dismissedTradeOfferIds, setDismissedTradeOfferIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [counteringOffer, setCounteringOffer] = useState<TradeOffer | null>(null);
  const [pendingCounterSelection, setPendingCounterSelection] = useState<{
    offerId: number;
    team1Id: string;
    team2Id: string;
    team1PlayerSeasonIds: number[];
    team2PlayerSeasonIds: number[];
  } | null>(null);
  const [team1SelectedIds, setTeam1SelectedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [team2SelectedIds, setTeam2SelectedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [team3SelectedIds, setTeam3SelectedIds] = useState<Set<number>>(() => new Set());
  const [playerDestinations, setPlayerDestinations] = useState<Record<number, string>>({});
  const [retentionRequestedIds, setRetentionRequestedIds] = useState<Set<number>>(() => new Set());
  const [tradeNotes, setTradeNotes] = useState("");
  const [nhlPlayerStats, setNhlPlayerStats] = useState<NhlPlayerStatMaps>(
    emptyNhlPlayerStatMaps,
  );
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingTeam1Roster, setLoadingTeam1Roster] = useState(false);
  const [loadingTeam2Roster, setLoadingTeam2Roster] = useState(false);
  const [loadingTeam3Roster, setLoadingTeam3Roster] = useState(false);
  const [loadingNhlStats, setLoadingNhlStats] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [respondingOfferId, setRespondingOfferId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [marketPrefillApplied, setMarketPrefillApplied] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadTeams() {
      setLoadingTeams(true);
      setError("");

      try {
        const [teamRows, branding] = await Promise.all([fetchFantasyTeams(), fetchTeamBrandingHistory()]);
        if (active) setTeams(teamRows.map((team) => applyTeamBranding(team, branding, selectedSeason)));
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load teams.");
        }
      } finally {
        if (active) setLoadingTeams(false);
      }
    }

    loadTeams();

    return () => {
      active = false;
    };
  }, [selectedSeason]);

  useEffect(() => {
    let active = true;

    async function preloadAssignedTeam() {
      if (!user) return;

      try {
        const assignment =
          (await fetchUserTeamAssignment(user.id, selectedSeason)) ||
          (await fetchLatestUserTeamAssignment(user.id));

        if (!active || !assignment?.fantasy_team_id) return;

        const assignedTeamId = String(assignment.fantasy_team_id);
        setTeam1Id((currentTeam1Id) => searchParams.get("fromTeam") || currentTeam1Id || assignedTeamId);
        setTeam2Id((currentTeam2Id) =>
          currentTeam2Id === assignedTeamId ? "" : currentTeam2Id,
        );
      } catch {
        // If a user has no readable assignment, leave the selectors manual.
      }
    }

    preloadAssignedTeam();

    return () => {
      active = false;
    };
  }, [searchParams, selectedSeason, user]);

  useEffect(() => {
    let active = true;

    async function loadOffers() {
      setLoadingOffers(true);

      try {
        const [offers, dismissals] = await Promise.all([
          fetchTradeOffers(selectedSeason),
          user ? fetchTradeOfferDismissals(user.id) : Promise.resolve([]),
        ]);

        if (active) {
          setTradeOffers(offers);
          setDismissedTradeOfferIds(
            new Set(dismissals.map((dismissal) => dismissal.trade_offer_id)),
          );
        }
      } catch {
        if (active) {
          setTradeOffers([]);
          setDismissedTradeOfferIds(new Set());
        }
      } finally {
        if (active) setLoadingOffers(false);
      }
    }

    loadOffers();

    return () => {
      active = false;
    };
  }, [selectedSeason, success, user]);

  useEffect(() => {
    let active = true;

    async function loadNhlData() {
      setLoadingNhlStats(true);

      try {
        const [currentSkaters, currentGoalies, previousSkaters, previousGoalies] = await Promise.all([
          fetchNhlSkaterStats(nhlSeasonId(selectedSeason)).catch(() => [] as NhlSkaterRecord[]),
          fetchNhlGoalieStats(nhlSeasonId(selectedSeason)).catch(() => [] as NhlGoalieRecord[]),
          fetchNhlSkaterStats(nhlSeasonId(selectedSeason - 1)).catch(() => [] as NhlSkaterRecord[]),
          fetchNhlGoalieStats(nhlSeasonId(selectedSeason - 1)).catch(() => [] as NhlGoalieRecord[]),
        ]);

        if (active) {
          const skaters = new Map(previousSkaters.map((record) => [String(record.playerId), record]));
          const goalies = new Map(previousGoalies.map((record) => [String(record.playerId), record]));
          currentSkaters.forEach((record) => skaters.set(String(record.playerId), record));
          currentGoalies.forEach((record) => goalies.set(String(record.playerId), record));
          setNhlPlayerStats({
            skaters,
            goalies,
          });
        }
      } catch {
        if (active) setNhlPlayerStats(emptyNhlPlayerStatMaps());
      } finally {
        if (active) setLoadingNhlStats(false);
      }
    }

    loadNhlData();

    return () => {
      active = false;
    };
  }, [selectedSeason]);

  useEffect(() => {
    let active = true;

    async function loadRoster() {
      setTeam1SelectedIds(new Set());

      if (!team1Id) {
        setTeam1Roster([]);
        return;
      }

      setLoadingTeam1Roster(true);
      setError("");

      try {
        const [rows, penalties, adjustments] = await Promise.all([
          fetchPlayerSeasonsByTeamAndSeason(Number(team1Id), selectedSeason),
          fetchBuyoutPenalties(selectedSeason, Number(team1Id)),
          fetchRetentionAdjustments(selectedSeason, Number(team1Id)),
        ]);
        if (active) {
          setTeam1Roster(rows);
          setBuyoutPenaltyTotals((current) => ({ ...current, [team1Id]: penalties.reduce((sum, penalty) => sum + penalty.amount, 0) }));
          setRetentionAdjustmentTotals((current) => ({ ...current, [team1Id]: adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0) }));
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load Team 1 roster.",
          );
        }
      } finally {
        if (active) setLoadingTeam1Roster(false);
      }
    }

    loadRoster();

    return () => {
      active = false;
    };
  }, [team1Id, selectedSeason]);

  useEffect(() => {
    let active = true;

    async function loadRoster() {
      setTeam2SelectedIds(new Set());

      if (!team2Id) {
        setTeam2Roster([]);
        return;
      }

      setLoadingTeam2Roster(true);
      setError("");

      try {
        const [rows, penalties, adjustments] = await Promise.all([
          fetchPlayerSeasonsByTeamAndSeason(Number(team2Id), selectedSeason),
          fetchBuyoutPenalties(selectedSeason, Number(team2Id)),
          fetchRetentionAdjustments(selectedSeason, Number(team2Id)),
        ]);
        if (active) {
          setTeam2Roster(rows);
          setBuyoutPenaltyTotals((current) => ({ ...current, [team2Id]: penalties.reduce((sum, penalty) => sum + penalty.amount, 0) }));
          setRetentionAdjustmentTotals((current) => ({ ...current, [team2Id]: adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0) }));
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load Team 2 roster.",
          );
        }
      } finally {
        if (active) setLoadingTeam2Roster(false);
      }
    }

    loadRoster();

    return () => {
      active = false;
    };
  }, [team2Id, selectedSeason]);

  useEffect(() => {
    let active = true;
    async function loadRoster() {
      setTeam3SelectedIds(new Set());
      if (!threeTeamMode || !team3Id) {
        setTeam3Roster([]);
        return;
      }
      setLoadingTeam3Roster(true);
      setError("");
      try {
        const [rows, penalties, adjustments] = await Promise.all([
          fetchPlayerSeasonsByTeamAndSeason(Number(team3Id), selectedSeason),
          fetchBuyoutPenalties(selectedSeason, Number(team3Id)),
          fetchRetentionAdjustments(selectedSeason, Number(team3Id)),
        ]);
        if (active) {
          setTeam3Roster(rows);
          setBuyoutPenaltyTotals((current) => ({ ...current, [team3Id]: penalties.reduce((sum, penalty) => sum + penalty.amount, 0) }));
          setRetentionAdjustmentTotals((current) => ({ ...current, [team3Id]: adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0) }));
        }
      } catch (err) {
        if (active) setError(getErrorMessage(err, "Unable to load Team 3 roster."));
      } finally {
        if (active) setLoadingTeam3Roster(false);
      }
    }
    loadRoster();
    return () => { active = false; };
  }, [team3Id, selectedSeason, threeTeamMode]);

  useEffect(() => {
    if (
      !pendingCounterSelection ||
      pendingCounterSelection.team1Id !== team1Id ||
      pendingCounterSelection.team2Id !== team2Id
    ) {
      return;
    }

    setTeam1SelectedIds(new Set(pendingCounterSelection.team1PlayerSeasonIds));
    setTeam2SelectedIds(new Set(pendingCounterSelection.team2PlayerSeasonIds));
    setPendingCounterSelection(null);
  }, [pendingCounterSelection, team1Id, team2Id]);

  useEffect(() => {
    if (marketPrefillApplied) return;
    const requestedPlayerSeasonId = Number(searchParams.get("playerSeason"));
    if (!Number.isInteger(requestedPlayerSeasonId) || !team1Id || !team2Id) return;

    if (team1Roster.some((season) => season.id === requestedPlayerSeasonId)) {
      setTeam1SelectedIds(new Set([requestedPlayerSeasonId]));
      setMarketPrefillApplied(true);
      setSuccess("Trade Market player selected. Add another player or notes, then send the offer.");
    } else if (team2Roster.some((season) => season.id === requestedPlayerSeasonId)) {
      setTeam2SelectedIds(new Set([requestedPlayerSeasonId]));
      setMarketPrefillApplied(true);
      setSuccess("Trade Market player selected. Add another player or notes, then send the offer.");
    }
  }, [marketPrefillApplied, searchParams, team1Id, team1Roster, team2Id, team2Roster]);

  const team1OutgoingPlayers = useMemo(
    () =>
      getTradeableRoster(team1Roster).filter((season) =>
        team1SelectedIds.has(season.id),
      ),
    [team1Roster, team1SelectedIds],
  );
  const team2OutgoingPlayers = useMemo(
    () =>
      getTradeableRoster(team2Roster).filter((season) =>
        team2SelectedIds.has(season.id),
      ),
    [team2Roster, team2SelectedIds],
  );
  const team3OutgoingPlayers = useMemo(
    () => getTradeableRoster(team3Roster).filter((season) => team3SelectedIds.has(season.id)),
    [team3Roster, team3SelectedIds],
  );

  const teamIds = [team1Id, team2Id, ...(threeTeamMode ? [team3Id] : [])].filter(Boolean);
  const selectedPlayers = [...team1OutgoingPlayers, ...team2OutgoingPlayers, ...team3OutgoingPlayers];
  const incomingFor = (teamId: string) => threeTeamMode
    ? selectedPlayers.filter((season) => playerDestinations[season.id] === teamId)
    : teamId === team1Id ? team2OutgoingPlayers : team1OutgoingPlayers;

  const team1CurrentSalary = sumSalary(team1Roster) + (buyoutPenaltyTotals[team1Id] || 0) + (retentionAdjustmentTotals[team1Id] || 0);
  const team2CurrentSalary = sumSalary(team2Roster) + (buyoutPenaltyTotals[team2Id] || 0) + (retentionAdjustmentTotals[team2Id] || 0);
  const team1CurrentRosterCount = getRosterCount(team1Roster);
  const team2CurrentRosterCount = getRosterCount(team2Roster);
  const team3CurrentSalary = sumSalary(team3Roster) + (buyoutPenaltyTotals[team3Id] || 0) + (retentionAdjustmentTotals[team3Id] || 0);
  const team3CurrentRosterCount = getRosterCount(team3Roster);
  const team1OutgoingSalary = sumSalary(team1OutgoingPlayers);
  const team2OutgoingSalary = sumSalary(team2OutgoingPlayers);
  const team3OutgoingSalary = sumSalary(team3OutgoingPlayers);
  const team1IncomingPlayers = incomingFor(team1Id);
  const team2IncomingPlayers = incomingFor(team2Id);
  const team3IncomingPlayers = incomingFor(team3Id);
  const team1NetSalaryChange = sumSalary(team1IncomingPlayers) - team1OutgoingSalary;
  const team2NetSalaryChange = sumSalary(team2IncomingPlayers) - team2OutgoingSalary;
  const team3NetSalaryChange = sumSalary(team3IncomingPlayers) - team3OutgoingSalary;
  const team1NetRosterChange = getActivePlayerCount(team1IncomingPlayers) - getActivePlayerCount(team1OutgoingPlayers);
  const team2NetRosterChange = getActivePlayerCount(team2IncomingPlayers) - getActivePlayerCount(team2OutgoingPlayers);
  const team3NetRosterChange = getActivePlayerCount(team3IncomingPlayers) - getActivePlayerCount(team3OutgoingPlayers);
  const selectedSalaryCap = salaryCapForSeason(selectedSeason);

  function toggleTeam1Player(playerSeasonId: number, checked: boolean) {
    setTeam1SelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(playerSeasonId);
      else next.delete(playerSeasonId);
      return next;
    });
    if (!checked) setRetentionRequestedIds((current) => { const next = new Set(current); next.delete(playerSeasonId); return next; });
  }

  function toggleTeam2Player(playerSeasonId: number, checked: boolean) {
    setTeam2SelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(playerSeasonId);
      else next.delete(playerSeasonId);
      return next;
    });
    if (!checked) setRetentionRequestedIds((current) => { const next = new Set(current); next.delete(playerSeasonId); return next; });
  }

  function toggleTeam3Player(playerSeasonId: number, checked: boolean) {
    setTeam3SelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(playerSeasonId); else next.delete(playerSeasonId);
      return next;
    });
    if (!checked) setRetentionRequestedIds((current) => { const next = new Set(current); next.delete(playerSeasonId); return next; });
  }

  function setRetentionRequest(playerSeasonId: number, requested: boolean, roster: PlayerSeasonWithRelations[]) {
    setRetentionRequestedIds((current) => {
      const next = new Set(current);
      roster.forEach((season) => next.delete(season.id));
      if (requested) next.add(playerSeasonId);
      return next;
    });
  }

  function setDestination(playerSeasonId: number, teamId: string) {
    setPlayerDestinations((current) => ({ ...current, [playerSeasonId]: teamId }));
  }

  function handleTeam1Change(nextTeamId: string) {
    setTeam1Id(nextTeamId);
    setSuccess("");
    setCounteringOffer(null);
    setPendingCounterSelection(null);
    if (nextTeamId && nextTeamId === team2Id) setTeam2Id("");
    if (nextTeamId && nextTeamId === team3Id) setTeam3Id("");
  }

  function handleTeam2Change(nextTeamId: string) {
    setTeam2Id(nextTeamId);
    setSuccess("");
    setCounteringOffer(null);
    setPendingCounterSelection(null);
    if (nextTeamId && nextTeamId === team1Id) setTeam1Id("");
    if (nextTeamId && nextTeamId === team3Id) setTeam3Id("");
  }

  function handleTeam3Change(nextTeamId: string) {
    setTeam3Id(nextTeamId);
    setSuccess("");
    setPlayerDestinations({});
    if (nextTeamId && nextTeamId === team1Id) setTeam1Id("");
    if (nextTeamId && nextTeamId === team2Id) setTeam2Id("");
  }

  async function handleSendOffer() {
    if (!user || !team1Id || !team2Id || (threeTeamMode && !team3Id)) return;

    const twoTeamMoves = [
      ...team1OutgoingPlayers.map((season) => ({
        playerSeasonId: season.id,
        fromTeamId: Number(team1Id),
        toTeamId: Number(team2Id),
      })),
      ...team2OutgoingPlayers.map((season) => ({
        playerSeasonId: season.id,
        fromTeamId: Number(team2Id),
        toTeamId: Number(team1Id),
      })),
    ];
    const threeTeamPlayers = [
      ...team1OutgoingPlayers.map((season) => ({ season, fromTeamId: Number(team1Id) })),
      ...team2OutgoingPlayers.map((season) => ({ season, fromTeamId: Number(team2Id) })),
      ...team3OutgoingPlayers.map((season) => ({ season, fromTeamId: Number(team3Id) })),
    ];
    if (threeTeamMode && threeTeamPlayers.some(({ season }) => !playerDestinations[season.id])) {
      setError("Choose a destination team for every selected player.");
      return;
    }
    const playerMoves = threeTeamMode
      ? threeTeamPlayers.map(({ season, fromTeamId }) => ({
          playerSeasonId: season.id,
          fromTeamId,
          toTeamId: Number(playerDestinations[season.id]),
        }))
      : twoTeamMoves;
    const retentionRequestedPlayerSeasonIds = playerMoves.map((move) => move.playerSeasonId).filter((id) => retentionRequestedIds.has(id));

    if (playerMoves.length === 0 && !tradeNotes.trim()) {
      setError("Select at least one player or add trade notes before sending an offer.");
      return;
    }

    setSendingOffer(true);
    setError("");
    setSuccess("");

    try {
      if (isAdmin && threeTeamMode && !counteringOffer) {
        await createAdminThreeTeamTrade({
          seasonYear: selectedSeason,
          team1Id: Number(team1Id),
          team2Id: Number(team2Id),
          team3Id: Number(team3Id),
          notes: tradeNotes.trim() || null,
          playerMoves,
          retentionRequestedPlayerSeasonIds,
        });
      } else if (threeTeamMode && !counteringOffer) {
        await createThreeTeamTradeOffer({
          seasonYear: selectedSeason,
          team1Id: Number(team1Id),
          team2Id: Number(team2Id),
          team3Id: Number(team3Id),
          notes: tradeNotes.trim() || null,
          playerMoves,
          retentionRequestedPlayerSeasonIds,
        });
      } else if (isAdmin && !counteringOffer) {
        await createAdminTradeOffer({
          seasonYear: selectedSeason,
          fromTeamId: Number(team1Id),
          toTeamId: Number(team2Id),
          notes: tradeNotes.trim() || null,
          playerMoves,
          retentionRequestedPlayerSeasonIds,
        });
      } else {
        await createTradeOffer({
          seasonYear: selectedSeason,
          fromTeamId: Number(team1Id),
          toTeamId: Number(team2Id),
          createdBy: user.id,
          notes: tradeNotes.trim() || null,
          parentTradeOfferId: counteringOffer?.id ?? null,
          playerMoves,
          retentionRequestedPlayerSeasonIds,
        });
      }

      if (counteringOffer) {
        await updateTradeOfferStatus({
          tradeOfferId: counteringOffer.id,
          status: "countered",
        });
      }

      setTeam1SelectedIds(new Set());
      setTeam2SelectedIds(new Set());
      setTeam3SelectedIds(new Set());
      setPlayerDestinations({});
      setRetentionRequestedIds(new Set());
      setTradeNotes("");
      setCounteringOffer(null);
      setSuccess(
        isAdmin && !counteringOffer
          ? "Agreed trade submitted to Trade Admin for final approval."
          : threeTeamMode
          ? `Three-team offer sent to ${team2Name} and ${team3Name}.`
          : counteringOffer
          ? `Counter offer sent to ${team2Name}.`
          : `Trade offer sent to ${team2Name}.`,
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to send trade offer."));
    } finally {
      setSendingOffer(false);
    }
  }

  async function handleRespondToOffer(
    offer: TradeOffer,
    status: "accepted" | "declined",
  ) {
    setRespondingOfferId(offer.id);
    setError("");
    setSuccess("");

    try {
      if (offer.third_team_id) {
        await respondToThreeTeamTradeOffer(offer.id, status === "accepted");
        setTradeOffers(await fetchTradeOffers(selectedSeason));
      } else {
        const nextOffer = await updateTradeOfferStatus({ tradeOfferId: offer.id, status });
        setTradeOffers((current) => status === "declined" ? current.filter((row) => row.id !== nextOffer.id) : current.map((row) => (row.id === nextOffer.id ? nextOffer : row)));
      }
      setSuccess(
        status === "accepted"
          ? offer.third_team_id
            ? "Approval recorded. The trade goes to admin after both receiving teams accept."
            : "Trade accepted and sent to admin for approval."
          : "Trade offer declined.",
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to update trade offer."));
    } finally {
      setRespondingOfferId(null);
    }
  }

  function handleStartCounterOffer(offer: TradeOffer) {
    const nextTeam1Id = String(offer.to_team_id);
    const nextTeam2Id = String(offer.from_team_id);
    const team1PlayerSeasonIds = offer.trade_offer_players
      .filter((player) => player.from_team_id === offer.to_team_id)
      .map((player) => player.player_season_id);
    const team2PlayerSeasonIds = offer.trade_offer_players
      .filter((player) => player.from_team_id === offer.from_team_id)
      .map((player) => player.player_season_id);

    setTeam1Id(nextTeam1Id);
    setTeam2Id(nextTeam2Id);
    setCounteringOffer(offer);
    setPendingCounterSelection({
      offerId: offer.id,
      team1Id: nextTeam1Id,
      team2Id: nextTeam2Id,
      team1PlayerSeasonIds,
      team2PlayerSeasonIds,
    });
    setTradeNotes(offer.notes ? `Counter to offer #${offer.id}\n\n${offer.notes}` : "");
    setSuccess(`Countering offer #${offer.id}. Adjust the players below and submit the counter offer.`);
    setError("");
  }

  async function handleRevokeOffer(tradeOfferId: number) {
    setRespondingOfferId(tradeOfferId);
    setError("");
    setSuccess("");

    try {
      const nextOffer = await updateTradeOfferStatus({
        tradeOfferId,
        status: "revoked",
      });
      setTradeOffers((current) =>
        current.filter((offer) => offer.id !== nextOffer.id),
      );
      setSuccess("Trade offer revoked.");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to revoke trade offer."));
    } finally {
      setRespondingOfferId(null);
    }
  }

  async function handleDismissOffer(tradeOfferId: number) {
    if (!user) return;

    setRespondingOfferId(tradeOfferId);
    setError("");
    setSuccess("");

    try {
      await dismissTradeOffer(tradeOfferId, user.id);
      setDismissedTradeOfferIds((current) => {
        const next = new Set(current);
        next.add(tradeOfferId);
        return next;
      });
      setSuccess("Trade notification discarded.");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to discard trade notification."));
    } finally {
      setRespondingOfferId(null);
    }
  }

  const team1Name =
    teams.find((team) => String(team.id) === team1Id)?.team_name || "Team 1";
  const team2Name =
    teams.find((team) => String(team.id) === team2Id)?.team_name || "Team 2";
  const team3Name =
    teams.find((team) => String(team.id) === team3Id)?.team_name || "Team 3";
  const visibleTradeOffers = tradeOffers.filter(
    (offer) =>
      !["declined", "revoked"].includes(offer.status) &&
      !dismissedTradeOfferIds.has(offer.id) &&
      !(
        dismissableTradeStatuses.has(offer.status) &&
        isOlderThanOneDay(
          offer.completed_at ||
            offer.admin_reviewed_at ||
            offer.declined_at ||
            offer.updated_at,
        )
      ),
  );
  const pendingOffers = visibleTradeOffers.filter(
    (offer) => offer.status === "pending",
  );
  const otherOffers = visibleTradeOffers.filter(
    (offer) => offer.status !== "pending",
  );

  return (
    <>
      <PageMeta
        title="Great Lakes Dynasty Hockey League"
        description="Manage GLDHL fantasy hockey trades"
      />
      <PageBreadcrumb pageTitle="Trade Manager" />

      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Preview Only
              </p>
              <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                Trade Manager
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Simulate roster and salary impact without saving changes.
              </p>
            </div>

            <div className="w-full lg:w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Season
              </label>
              <select
                value={selectedSeason}
                onChange={(event) => setSelectedSeason(Number(event.target.value))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {seasonOptions.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(loadingTeams || loadingNhlStats) && (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Loading trade data...
            </p>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300">
              {success}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
        <section className="order-2 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Trade Offers
              </p>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Inbox and Sent Offers
              </h2>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {visibleTradeOffers.length} Offers
            </span>
          </div>

          {loadingOffers ? (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Loading trade offers...
            </p>
          ) : visibleTradeOffers.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No trade offers for this season yet.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {pendingOffers.map((offer) => (
                <TradeOfferCard
                  key={offer.id}
                  offer={offer}
                  canRespond={(String(offer.to_team_id) === team1Id && !offer.to_team_accepted_at) || (String(offer.third_team_id) === team1Id && !offer.third_team_accepted_at)}
                  canRevoke={String(offer.from_team_id) === team1Id}
                  canDismiss={false}
                  responding={respondingOfferId === offer.id}
                  onAccept={() => handleRespondToOffer(offer, "accepted")}
                  onDecline={() => handleRespondToOffer(offer, "declined")}
                  onCounter={() => handleStartCounterOffer(offer)}
                  onRevoke={() => handleRevokeOffer(offer.id)}
                  onDismiss={() => undefined}
                />
              ))}
              {otherOffers.map((offer) => (
                <TradeOfferCard
                  key={offer.id}
                  offer={offer}
                  canRespond={false}
                  canRevoke={false}
                  canDismiss={dismissableTradeStatuses.has(offer.status)}
                  responding={respondingOfferId === offer.id}
                  onAccept={() => undefined}
                  onDecline={() => undefined}
                  onCounter={() => undefined}
                  onRevoke={() => undefined}
                  onDismiss={() => handleDismissOffer(offer.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          {!counteringOffer && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
              <Checkbox
                checked={threeTeamMode}
                onChange={(checked) => {
                  setThreeTeamMode(checked);
                  setTeam3Id("");
                  setTeam3SelectedIds(new Set());
                  setPlayerDestinations({});
                }}
              />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Add Third Team</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Select a destination for every player. Both other managers must accept before admin review.</p>
              </div>
            </div>
          )}
          <label
            htmlFor="trade-notes"
            className="block text-sm font-semibold text-gray-900 dark:text-white"
          >
            Trade Notes
          </label>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add prospects, non-rostered pieces, picks, conditions, or other context.
          </p>
          {counteringOffer && (
            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Countering offer #{counteringOffer.id}. The original players are selected below.
              </span>
              <button
                type="button"
                onClick={() => {
                  setCounteringOffer(null);
                  setPendingCounterSelection(null);
                  setTeam1SelectedIds(new Set());
                  setTeam2SelectedIds(new Set());
                  setTradeNotes("");
                  setSuccess("");
                }}
                className="w-fit rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold transition hover:bg-white/70 dark:border-brand-500/30 dark:hover:bg-gray-950/30"
              >
                Cancel Counter
              </button>
            </div>
          )}
          <textarea
            id="trade-notes"
            value={tradeNotes}
            onChange={(event) => setTradeNotes(event.target.value)}
            rows={4}
            placeholder="Example: Team 1 also receives non-rostered prospect Roman Anthony."
            className="mt-3 min-h-28 w-full resize-y rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
          <div className="sticky bottom-2 z-20 mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:static sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none dark:border-gray-700 dark:bg-gray-900/95 sm:dark:bg-transparent">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isAdmin
                ? "Admin Trade submits an agreed deal to Trade Admin. Players move only after final approval."
                : "Sending creates a pending offer for the other manager. Players move only after admin approval."}
            </p>
            <button
              type="button"
              onClick={handleSendOffer}
              disabled={
                sendingOffer ||
                !team1Id ||
                !team2Id ||
                (threeTeamMode && !team3Id) ||
                (!team1OutgoingPlayers.length &&
                  !team2OutgoingPlayers.length &&
                  !team3OutgoingPlayers.length &&
                  !tradeNotes.trim())
              }
              className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingOffer
                ? "Sending..."
                : counteringOffer
                  ? "Submit Counter Offer"
                  : isAdmin
                    ? "Admin Trade"
                    : "Send Offer"}
            </button>
          </div>
        </section>

        <div className={`order-1 grid gap-6 ${threeTeamMode ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
          <TeamColumn
            label="Team 1"
            teams={teams}
            selectedTeamId={team1Id}
            otherTeamId={team2Id}
            excludedTeamIds={[team2Id, ...(threeTeamMode ? [team3Id] : [])]}
            onTeamChange={handleTeam1Change}
            roster={team1Roster}
            selectedIds={team1SelectedIds}
            onTogglePlayer={toggleTeam1Player}
            loading={loadingTeam1Roster}
            nhlPlayerStats={nhlPlayerStats}
            salaryGoingOut={team1OutgoingSalary}
            salaryComingIn={sumSalary(team1IncomingPlayers)}
            netSalaryChange={team1NetSalaryChange}
            netRosterChange={team1NetRosterChange}
            currentSalary={team1CurrentSalary}
            currentRosterCount={team1CurrentRosterCount}
            teamName={team1Name}
            sourceTeamName={threeTeamMode ? "the other teams" : team2Name}
            incomingPlayers={team1IncomingPlayers}
            tradeNotes={tradeNotes}
            salaryCap={selectedSalaryCap}
            destinationTeams={threeTeamMode ? teams.filter((team) => ![team1Id].includes(String(team.id)) && teamIds.includes(String(team.id))) : undefined}
            destinations={playerDestinations}
            onDestinationChange={setDestination}
            retentionRequestedIds={retentionRequestedIds}
            onRetentionRequestedChange={(playerSeasonId, requested) => setRetentionRequest(playerSeasonId, requested, team1Roster)}
          />

          <TeamColumn
            label="Team 2"
            teams={teams}
            selectedTeamId={team2Id}
            otherTeamId={team1Id}
            excludedTeamIds={[team1Id, ...(threeTeamMode ? [team3Id] : [])]}
            onTeamChange={handleTeam2Change}
            roster={team2Roster}
            selectedIds={team2SelectedIds}
            onTogglePlayer={toggleTeam2Player}
            loading={loadingTeam2Roster}
            nhlPlayerStats={nhlPlayerStats}
            salaryGoingOut={team2OutgoingSalary}
            salaryComingIn={sumSalary(team2IncomingPlayers)}
            netSalaryChange={team2NetSalaryChange}
            netRosterChange={team2NetRosterChange}
            currentSalary={team2CurrentSalary}
            currentRosterCount={team2CurrentRosterCount}
            teamName={team2Name}
            sourceTeamName={threeTeamMode ? "the other teams" : team1Name}
            incomingPlayers={team2IncomingPlayers}
            tradeNotes={tradeNotes}
            salaryCap={selectedSalaryCap}
            destinationTeams={threeTeamMode ? teams.filter((team) => ![team2Id].includes(String(team.id)) && teamIds.includes(String(team.id))) : undefined}
            destinations={playerDestinations}
            onDestinationChange={setDestination}
            retentionRequestedIds={retentionRequestedIds}
            onRetentionRequestedChange={(playerSeasonId, requested) => setRetentionRequest(playerSeasonId, requested, team2Roster)}
          />

          {threeTeamMode && (
            <TeamColumn
              label="Team 3"
              teams={teams}
              selectedTeamId={team3Id}
              otherTeamId={team1Id}
              excludedTeamIds={[team1Id, team2Id]}
              onTeamChange={handleTeam3Change}
              roster={team3Roster}
              selectedIds={team3SelectedIds}
              onTogglePlayer={toggleTeam3Player}
              loading={loadingTeam3Roster}
              nhlPlayerStats={nhlPlayerStats}
              salaryGoingOut={team3OutgoingSalary}
              salaryComingIn={sumSalary(team3IncomingPlayers)}
              netSalaryChange={team3NetSalaryChange}
              netRosterChange={team3NetRosterChange}
              currentSalary={team3CurrentSalary}
              currentRosterCount={team3CurrentRosterCount}
              teamName={team3Name}
              sourceTeamName="the other teams"
              incomingPlayers={team3IncomingPlayers}
              tradeNotes={tradeNotes}
              salaryCap={selectedSalaryCap}
              destinationTeams={teams.filter((team) => String(team.id) !== team3Id && teamIds.includes(String(team.id)))}
              destinations={playerDestinations}
              onDestinationChange={setDestination}
              retentionRequestedIds={retentionRequestedIds}
              onRetentionRequestedChange={(playerSeasonId, requested) => setRetentionRequest(playerSeasonId, requested, team3Roster)}
            />
          )}
        </div>
        </div>
      </div>
    </>
  );
}
