import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import {
  approveTradeOffer,
  fetchTradeOffers,
  updateTradeOfferStatus,
  type TradeOffer,
} from "../../lib/tradeOffers";
import { fetchPlayerSeasonsByTeamAndSeason } from "../../lib/fantasyPlayers";
import { fetchBuyoutPenalties } from "../../lib/buyouts";
import { fetchRetentionAdjustments } from "../../lib/retentions";

const seasonOptions = Array.from({ length: 10 }, (_, index) => 2026 + index);
const rosterLimit = 23;
const activePositions = new Set(["C", "LW", "RW", "D", "G"]);
const capPositions = new Set([...activePositions, "W", "IR", "RETENTION"]);
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

type TeamImpact = {
  currentPayroll: number;
  projectedPayroll: number;
  currentRoster: number;
  projectedRoster: number;
  cap: number;
};

function salaryCapForSeason(_year: number) { return 47_000_000; }
function position(value?: string | null) { return (value || "").toUpperCase(); }
function signed(value: number, formatter: (amount: number) => string = String) { return value === 0 ? "No change" : `${value > 0 ? "+" : "−"}${formatter(Math.abs(value))}`; }

function ComplianceMetric({ label, current, projected, limit, format = String }: { label: string; current: number; projected: number; limit: number; format?: (value: number) => string }) {
  const valid = projected <= limit;
  return <div className={`rounded-lg border p-3 ${valid ? "border-success-200 bg-success-50/70 dark:border-success-500/25 dark:bg-success-500/10" : "border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10"}`}>
    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wide text-gray-500">{label}</p><span className={`text-[9px] font-black uppercase ${valid ? "text-success-700 dark:text-success-300" : "text-error-700 dark:text-error-300"}`}>{valid ? "Within limit" : "Over limit"}</span></div>
    <p className="mt-1 text-sm font-black text-gray-900 dark:text-white">{format(current)} → {format(projected)}</p>
    <p className="mt-1 text-[10px] text-gray-500">{signed(projected - current, format)} · Limit {format(limit)}</p>
  </div>;
}

function TradeAdminOfferCard({
  offer,
  busy,
  transactionDate,
  onTransactionDateChange,
  onApprove,
  onDecline,
  impacts,
  retentionAmounts,
  onRetentionAmountChange,
}: {
  offer: TradeOffer;
  busy: boolean;
  transactionDate: string;
  onTransactionDateChange: (date: string) => void;
  onApprove: () => void;
  onDecline: () => void;
  impacts: Record<number, TeamImpact>;
  retentionAmounts: Record<number, string>;
  onRetentionAmountChange: (playerSeasonId: number, amount: string) => void;
}) {
  const participatingTeams = [offer.from_team, offer.to_team, offer.third_team].filter(Boolean);
  const adjustedImpacts = Object.fromEntries(Object.entries(impacts).map(([teamId, impact]) => [teamId, { ...impact }]));
  offer.trade_offer_players.forEach((move) => {
    const amount = Number(retentionAmounts[move.player_season_id]) || 0;
    if (amount > 0) {
      if (adjustedImpacts[move.from_team_id]) adjustedImpacts[move.from_team_id].projectedPayroll += amount;
      if (adjustedImpacts[move.to_team_id]) adjustedImpacts[move.to_team_id].projectedPayroll -= amount;
    }
  });
  const complianceReady = participatingTeams.length > 0 && participatingTeams.every((team) => team && adjustedImpacts[team.id]);
  const retentionRequestComplete = offer.trade_offer_players.every((move) => !move.retention_requested || Number(retentionAmounts[move.player_season_id]) > 0);
  const tradeCompliant = complianceReady && participatingTeams.every((team) => {
    if (!team) return false;
    const impact = adjustedImpacts[team.id];
    return impact.projectedPayroll <= impact.cap && impact.projectedRoster <= rosterLimit;
  });
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {participatingTeams.map((team) => team?.team_name).join(" / ") || "Unknown Teams"}
            </h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {offer.status.replace("_", " ")}
            </span>
            {complianceReady && <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ring-1 ${tradeCompliant ? "bg-success-50 text-success-700 ring-success-200 dark:bg-success-500/10 dark:text-success-300" : "bg-error-50 text-error-700 ring-error-200 dark:bg-error-500/10 dark:text-error-300"}`}>{tradeCompliant ? "All teams compliant" : "Limit issue"}</span>}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Offer #{offer.id} | Season {offer.season_year}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`trade-date-${offer.id}`} className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Date of Transaction
            </label>
            <input
              id={`trade-date-${offer.id}`}
              type="date"
              value={transactionDate}
              onChange={(event) => onTransactionDateChange(event.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy || offer.status !== "accepted" || !transactionDate || !tradeCompliant || !retentionRequestComplete}
            className="rounded-lg bg-success-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-success-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {!retentionRequestComplete ? "Enter Retention Amount" : tradeCompliant ? "Approve & Move Players" : "Resolve Limit Issue"}
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={busy || offer.status === "completed"}
            className="rounded-lg border border-error-200 px-3 py-2 text-xs font-semibold text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-500/30 dark:text-error-300 dark:hover:bg-error-500/10"
          >
            Admin Decline
          </button>
        </div>
      </div>

      <div className={`mt-4 grid gap-4 ${participatingTeams.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
        {participatingTeams.map((team) => team && (
          <div key={team.id}>
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{team.team_name} receives</p>
            <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              {offer.trade_offer_players.filter((player) => player.to_team_id === team.id).map((player) => {
                const salary = player.player_season?.salary || 0;
                const maximum = Math.round(salary * 0.25);
                const anotherFromTeamRetention = offer.trade_offer_players.some((candidate) => candidate.from_team_id === player.from_team_id && candidate.player_season_id !== player.player_season_id && Number(retentionAmounts[candidate.player_season_id]) > 0);
                return <li key={player.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-950/30">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{player.player_season?.player?.full_name || "Unknown Player"}</span><span className="flex items-center gap-2">{player.retention_requested && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black uppercase text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Manager requested retention</span>}<span className="text-xs text-gray-500">{money.format(salary)} AAV</span></span></div>
                  {salary > 0 && <label className="mt-2 block text-[10px] font-black uppercase tracking-wide text-violet-600 dark:text-violet-300">Annual salary retained {player.retention_requested ? "(required)" : "(optional)"}
                    <input type="number" min="0" max={maximum} step="1" value={retentionAmounts[player.player_season_id] || ""} disabled={anotherFromTeamRetention} onChange={(event) => onRetentionAmountChange(player.player_season_id, event.target.value)} placeholder={`Up to ${money.format(maximum)}`} className="mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                    <span className="mt-1 block font-normal normal-case tracking-normal text-gray-500">Maximum 25%. One retained contract per team this season.</span>
                  </label>}
                </li>;
              })}
            </ul>
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/30">
        <div className="mb-3"><p className="text-xs font-black uppercase tracking-wide text-gray-700 dark:text-gray-200">Post-trade compliance</p><p className="mt-0.5 text-[11px] text-gray-500">Includes active contracts, buyout penalties, and retained-salary adjustments.</p></div>
        <div className={`grid gap-3 ${participatingTeams.length === 3 ? "xl:grid-cols-3" : "lg:grid-cols-2"}`}>
          {participatingTeams.map((team) => team && <div key={team.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"><p className="mb-2 text-xs font-bold text-gray-800 dark:text-white">{team.team_name}</p>{adjustedImpacts[team.id] ? <div className="grid gap-2 sm:grid-cols-2"><ComplianceMetric label="Payroll" current={adjustedImpacts[team.id].currentPayroll} projected={adjustedImpacts[team.id].projectedPayroll} limit={adjustedImpacts[team.id].cap} format={(value) => money.format(value)} /><ComplianceMetric label="Active roster" current={adjustedImpacts[team.id].currentRoster} projected={adjustedImpacts[team.id].projectedRoster} limit={rosterLimit} /></div> : <p className="text-xs text-gray-400">Compliance data unavailable.</p>}</div>)}
        </div>
      </section>

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

export default function TradeAdmin() {
  const [selectedSeason, setSelectedSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyOfferId, setBusyOfferId] = useState<number | null>(null);
  const [transactionDates, setTransactionDates] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [offerImpacts, setOfferImpacts] = useState<Record<number, Record<number, TeamImpact>>>({});
  const [retentionAmounts, setRetentionAmounts] = useState<Record<number, Record<number, string>>>({});

  async function loadOffers() {
    setLoading(true);
    setError("");

    try {
      const rows = await fetchTradeOffers(selectedSeason);
      setOffers(rows);
      const cap = salaryCapForSeason(selectedSeason);
      const teamIds = [...new Set(rows.flatMap((offer) => [offer.from_team_id, offer.to_team_id, offer.third_team_id].filter((id): id is number => id !== null)))];
      const baselines = new Map(await Promise.all(teamIds.map(async (teamId) => {
        const [roster, penalties, adjustments] = await Promise.all([
          fetchPlayerSeasonsByTeamAndSeason(teamId, selectedSeason),
          fetchBuyoutPenalties(selectedSeason, teamId),
          fetchRetentionAdjustments(selectedSeason, teamId),
        ]);
        return [teamId, {
          payroll: roster.filter((row) => capPositions.has(position(row.position))).reduce((sum, row) => sum + (row.salary || 0), 0) + penalties.reduce((sum, row) => sum + row.amount, 0) + adjustments.reduce((sum, row) => sum + row.amount, 0),
          roster: roster.filter((row) => activePositions.has(position(row.position))).length,
        }] as const;
      })));
      setOfferImpacts(Object.fromEntries(rows.map((offer) => {
        const participatingIds = [offer.from_team_id, offer.to_team_id, offer.third_team_id].filter((id): id is number => id !== null);
        return [offer.id, Object.fromEntries(participatingIds.map((teamId) => {
          const baseline = baselines.get(teamId) || { payroll: 0, roster: 0 };
          let payrollDelta = 0;
          let rosterDelta = 0;
          offer.trade_offer_players.forEach((move) => {
            const salary = move.player_season?.salary || 0;
            const playerPosition = position(move.player_season?.position);
            const direction = move.to_team_id === teamId ? 1 : move.from_team_id === teamId ? -1 : 0;
            if (capPositions.has(playerPosition)) payrollDelta += direction * salary;
            if (activePositions.has(playerPosition)) rosterDelta += direction;
          });
          return [teamId, { currentPayroll: baseline.payroll, projectedPayroll: baseline.payroll + payrollDelta, currentRoster: baseline.roster, projectedRoster: baseline.roster + rosterDelta, cap }];
        }))];
      })));
      setTransactionDates((current) => Object.fromEntries(
        rows.map((offer) => [offer.id, current[offer.id] || new Date().toLocaleDateString("en-CA")]),
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load trade offers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason]);

  async function handleApprove(offer: TradeOffer) {
    setBusyOfferId(offer.id);
    setError("");
    setSuccess("");

    try {
      const transactionDate = transactionDates[offer.id];
      if (!transactionDate) throw new Error("Date of Transaction is required.");
      const retentions = Object.entries(retentionAmounts[offer.id] || {}).filter(([, amount]) => Number(amount) > 0).map(([playerSeasonId, amount]) => ({ playerSeasonId: Number(playerSeasonId), retainedAmount: Number(amount) }));
      for (const retention of retentions) {
        const move = offer.trade_offer_players.find((candidate) => candidate.player_season_id === retention.playerSeasonId);
        const maximum = Math.round((move?.player_season?.salary || 0) * 0.25);
        if (!Number.isInteger(retention.retainedAmount) || retention.retainedAmount <= 0 || retention.retainedAmount > maximum) throw new Error(`Retention must be a whole-dollar amount no greater than ${money.format(maximum)}.`);
      }
      await approveTradeOffer(offer.id, transactionDate, retentions);
      setSuccess(`Trade #${offer.id} approved and posted with a ${transactionDate} transaction date.`);
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to approve trade.");
    } finally {
      setBusyOfferId(null);
    }
  }

  async function handleDecline(offer: TradeOffer) {
    setBusyOfferId(offer.id);
    setError("");
    setSuccess("");

    try {
      await updateTradeOfferStatus({
        tradeOfferId: offer.id,
        status: "admin_declined",
      });
      setSuccess(`Trade #${offer.id} declined by admin.`);
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to decline trade.");
    } finally {
      setBusyOfferId(null);
    }
  }

  const reviewableOffers = offers.filter((offer) => offer.status === "accepted");

  return (
    <>
      <PageMeta
        title="Great Lakes Dynasty Hockey League"
        description="Approve or decline fantasy baseball trades"
      />
      <PageBreadcrumb pageTitle="Trade Admin" />

      <div className="space-y-6">
        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Admin Only
              </p>
              <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                Trade Approval
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Complete accepted trades or decline offers before they move players.
              </p>
            </div>

            <div className="w-full sm:w-40">
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
        </section>

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
            Loading trade offers...
          </div>
        ) : reviewableOffers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No accepted trades are waiting for admin review.
          </div>
        ) : (
          <div className="space-y-5">
            {reviewableOffers.map((offer) => (
              <TradeAdminOfferCard
                key={offer.id}
                offer={offer}
                busy={busyOfferId === offer.id}
                transactionDate={transactionDates[offer.id] || ""}
                onTransactionDateChange={(date) => setTransactionDates((current) => ({ ...current, [offer.id]: date }))}
                onApprove={() => handleApprove(offer)}
                onDecline={() => handleDecline(offer)}
                impacts={offerImpacts[offer.id] || {}}
                retentionAmounts={retentionAmounts[offer.id] || {}}
                onRetentionAmountChange={(playerSeasonId, amount) => setRetentionAmounts((current) => ({ ...current, [offer.id]: { ...(current[offer.id] || {}), [playerSeasonId]: amount } }))}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
