import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import PositionBadge from "../../components/hockey/PositionBadge";
import { useAuth } from "../../context/AuthContext";
import { deleteLeagueTransaction, fetchLeagueTransactions, type LeagueTransaction } from "../../lib/transactions";

const transactionTypeOptions = [
  { value: "trade", label: "Trades" },
  { value: "signed", label: "Signed" },
  { value: "called_up", label: "Called-up" },
  { value: "waived", label: "Waived" },
  { value: "claimed", label: "Claimed" },
  { value: "bought_out", label: "Bought out" },
  { value: "retained", label: "Retained" },
  { value: "injured_reserve", label: "Injured Reserve" },
  { value: "long_term_injured_reserve", label: "Long Term Injured Reserve" },
  { value: "released_to_rfa_offer", label: "Released to RFA Offer" },
  { value: "matched_rfa_offer", label: "Matched RFA Offer" },
  { value: "competitive_balance_drafted", label: "Competitive Balance Draft" },
  { value: "traded", label: "Acquired via Trade" },
] as const;

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function getPlayerName(transaction: LeagueTransaction) {
  return transaction.player?.full_name
    || [transaction.player?.first_name, transaction.player?.last_name].filter(Boolean).join(" ")
    || "Unknown player";
}

function formatTransactionDate(date: string) {
  const value = new Date(`${date}T00:00:00`);
  const day = value.getDate();
  const lastTwo = day % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13
    ? "TH"
    : day % 10 === 1
      ? "ST"
      : day % 10 === 2
        ? "ND"
        : day % 10 === 3
          ? "RD"
          : "TH";
  const month = value.toLocaleDateString("en-CA", { month: "long" });
  return `${month} ${day}${suffix.toLowerCase()}, ${value.getFullYear()}`;
}

function getTransactionSentence(transaction: LeagueTransaction, fallbackPosition?: string | null) {
  const team = transaction.fantasy_team?.team_name || "Unknown team";
  const position = (transaction.position || transaction.player_season?.position || fallbackPosition)?.toUpperCase();
  const prefixes = {
    signed: `${team} have signed`,
    called_up: `${team} have called-up`,
    waived: `${team} have waived`,
    claimed: `${team} have claimed`,
    bought_out: `${team} have bought out`,
    retained: `${team} have retained`,
    injured_reserve: `${team} have assigned`,
    long_term_injured_reserve: `${team} have assigned`,
    released_to_rfa_offer: `${team} have released`,
    matched_rfa_offer: `${team} have matched an RFA offer for`,
    competitive_balance_drafted: `${team} have selected`,
    traded: `${team} have acquired`,
  };
  const suffixes = {
    signed: "",
    called_up: "",
    waived: "",
    claimed: "",
    bought_out: "",
    retained: "",
    injured_reserve: " to Injured Reserve",
    long_term_injured_reserve: " to Long Term Injured Reserve",
    released_to_rfa_offer: " to an RFA offer",
    matched_rfa_offer: "",
    competitive_balance_drafted: " in the Competitive Balance Draft",
    traded: " via trade",
  };
  const contractYears = transaction.term_end_year
    ? Math.max(transaction.term_end_year - transaction.season_year + 1, 1)
    : null;
  const contractValue = contractYears && transaction.salary !== null
    ? contractYears * transaction.salary
    : null;
  const showsContractTerms = transaction.action === "signed" || transaction.action === "called_up" || transaction.action === "matched_rfa_offer";
  const signingTerms = showsContractTerms && contractYears && transaction.salary !== null
    ? ` for ${contractYears} ${contractYears === 1 ? "Year" : "Years"} at ${money.format(transaction.salary)}${transaction.term_end_year ? ` (${transaction.term_end_year})` : ""}`
    : "";

  return {
    prefix: prefixes[transaction.action] || `${team} have updated`,
    position: transaction.action === "competitive_balance_drafted" ? "prospect" : transaction.action === "traded" && position === "PROSPECT" ? "prospect" : position,
    suffix: `${suffixes[transaction.action] || ""}${signingTerms}.`,
    contractDetail: showsContractTerms && contractValue !== null
      ? `Contract value is ${money.format(contractValue)}.`
      : null,
  };
}

function getActionLabel(transaction: LeagueTransaction) {
  if (transaction.trade_offer_id) return "Trade";
  return {
    signed: "Signed",
    called_up: "Called-up",
    waived: "Waived",
    claimed: "Claimed",
    bought_out: "Bought out",
    retained: "Retained",
    injured_reserve: "Injured Reserve",
    long_term_injured_reserve: "Long Term IR",
    released_to_rfa_offer: "RFA Offer",
    matched_rfa_offer: "RFA Matched",
    competitive_balance_drafted: "Competitive Balance Draft",
    traded: "Traded",
  }[transaction.action] || "Transaction";
}

function getTransactionAnchor(transaction: LeagueTransaction) {
  return transaction.trade_offer_id
    ? `trade-${transaction.trade_offer_id}`
    : `transaction-${transaction.id}`;
}

function getFallbackPosition(transaction: LeagueTransaction, transactions: LeagueTransaction[]) {
  return transactions.find((candidate) =>
    candidate.id !== transaction.id
    && candidate.player_id === transaction.player_id
    && candidate.season_year === transaction.season_year
    && Boolean(candidate.position),
  )?.position;
}

function getWhatsAppMessage(transaction: LeagueTransaction, transactions: LeagueTransaction[]) {
  const heading = transaction.trade_offer_id ? "FOBL TRADE" : "FOBL TRANSACTION";
  const lines = [`🏒 *${heading}*`, ""];

  if (transaction.trade_offer_id && transaction.trade_offer) {
    const trade = transaction.trade_offer;
    const teams = [trade.from_team, trade.to_team, trade.third_team].filter(
      (team): team is NonNullable<typeof team> => Boolean(team),
    );

    teams.forEach((team, index) => {
      if (index > 0) lines.push("");
      lines.push(`*${team.team_name} receive:*`);
      const acquired = trade.trade_offer_players.filter((move) => move.to_team_id === team.id);
      if (acquired.length === 0) {
        lines.push("• No players listed");
      } else {
        acquired.forEach((move) => {
          const player = move.player_season?.player;
          const playerName = player?.full_name
            || [player?.first_name, player?.last_name].filter(Boolean).join(" ")
            || "Unknown player";
          const position = move.player_season?.position?.toUpperCase();
          lines.push(`• ${position ? `${position} ` : ""}${playerName}`);
        });
      }
    });

    if (transaction.notes) lines.push("", transaction.notes);
  } else {
    const sentence = getTransactionSentence(
      transaction,
      getFallbackPosition(transaction, transactions),
    );
    lines.push(
      `${sentence.prefix} ${sentence.position ? `${sentence.position} ` : ""}${getPlayerName(transaction)}${sentence.suffix}`,
    );
    if (sentence.contractDetail) lines.push(sentence.contractDetail);
    if (transaction.notes) lines.push("", transaction.notes);
  }

  const transactionUrl = new URL(
    `/transactions#${getTransactionAnchor(transaction)}`,
    window.location.origin,
  ).toString();
  lines.push("", `View transaction: ${transactionUrl}`);
  return lines.join("\n");
}

function findRelatedTradeId(
  transaction: LeagueTransaction,
  transactions: LeagueTransaction[],
) {
  if (transaction.related_trade_offer_id) return transaction.related_trade_offer_id;
  if (transaction.action !== "traded" || transaction.trade_offer_id) return null;

  const playerApiId = transaction.player?.player_api_id?.toLowerCase();
  const playerName = getPlayerName(transaction).toLowerCase();
  const matchingTrade = transactions.find((candidate) => {
    if (!candidate.trade_offer_id || candidate.transaction_date !== transaction.transaction_date) return false;
    const tradeText = `${candidate.description || ""} ${candidate.notes || ""}`.toLowerCase();
    return Boolean(
      (playerApiId && tradeText.includes(playerApiId))
      || (playerName !== "unknown player" && tradeText.includes(playerName)),
    );
  });

  return matchingTrade?.trade_offer_id || null;
}

function TeamLogo({ team }: { team: LeagueTransaction["fantasy_team"] }) {
  return (
    <Link
      to={team?.id ? `/teams/${team.id}` : "/teams"}
      className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs transition hover:border-brand-300 hover:shadow-theme-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500"
      title={team?.team_name || "View teams"}
    >
      {team?.logo ? (
        <img src={team.logo} alt={`${team.team_name} logo`} className="h-full w-full object-contain p-1" />
      ) : (
        <span className="text-xs font-bold text-gray-500 dark:text-gray-300">{team?.abbreviation || "GLDHL"}</span>
      )}
    </Link>
  );
}

function transactionTeams(transaction: LeagueTransaction) {
  const teams = transaction.trade_offer_id
    ? [transaction.trade_offer?.from_team, transaction.trade_offer?.to_team, transaction.trade_offer?.third_team]
    : [transaction.fantasy_team];
  return teams.filter((team): team is NonNullable<typeof team> => Boolean(team));
}

export function TradeTransactionDetails({ transaction }: { transaction: LeagueTransaction }) {
  const trade = transaction.trade_offer;
  const teams = [trade?.from_team, trade?.to_team, trade?.third_team].filter(Boolean);
  const positionOrder: Record<string, number> = { C: 0, LW: 1, RW: 2, D: 3, G: 4 };

  if (!trade || teams.length === 0) {
    return <p className="text-sm leading-6 text-gray-700 dark:text-gray-300 sm:text-base">{transaction.description || "Trade completed."}</p>;
  }

  return (
    <div className={`mt-4 grid gap-3 ${teams.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
      {teams.map((team) => {
        if (!team) return null;
        const acquired = trade.trade_offer_players
          .filter((move) => move.to_team_id === team.id)
          .sort((a, b) => {
            const aPosition = a.player_season?.position?.toUpperCase() || "";
            const bPosition = b.player_season?.position?.toUpperCase() || "";
            const positionDifference = (positionOrder[aPosition] ?? 99) - (positionOrder[bPosition] ?? 99);
            if (positionDifference !== 0) return positionDifference;
            const aName = a.player_season?.player?.full_name || "";
            const bName = b.player_season?.player?.full_name || "";
            return aName.localeCompare(bName);
          });
        return (
          <section key={team.id} className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center gap-3">
              <TeamLogo team={team} />
              <div className="min-w-0">
                <Link to={team.id ? `/teams/${team.id}` : "/teams"} className="font-semibold text-gray-900 hover:text-brand-500 dark:text-white">
                  {team.team_name}
                </Link>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Acquire</p>
              </div>
            </div>
            <div className="space-y-2">
              {acquired.map((move) => {
                const season = move.player_season;
                const player = season?.player;
                const playerName = player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Unknown player";
                return (
                  <div key={move.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-theme-xs dark:bg-gray-900">
                    <div className="min-w-0">
                      <PositionBadge position={season?.position} className="mr-2" />
                      {player?.player_api_id ? (
                        <Link to={`/player-profile?playerId=${player.player_api_id}`} className="font-medium text-gray-800 hover:text-brand-500 hover:underline dark:text-white/90">
                          {playerName}
                        </Link>
                      ) : <span className="font-medium text-gray-800 dark:text-white/90">{playerName}</span>}
                    </div>
                    <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                      <div className="font-medium text-gray-700 dark:text-gray-300">{season?.salary == null ? "—" : money.format(season.salary)}</div>
                      <div>{season?.term_end_year || "No term"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function Transactions() {
  const { isAdmin } = useAuth();
  const [transactions, setTransactions] = useState<LeagueTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  async function handleDeleteTransaction(transaction: LeagueTransaction) {
    if (transaction.trade_offer_id) return;
    if (!window.confirm(`Delete this ${getActionLabel(transaction).toLowerCase()} transaction? This will not delete the player season.`)) return;
    setDeletingId(transaction.id);
    setError("");
    try {
      await deleteLeagueTransaction(transaction.id);
      setTransactions((current) => current.filter((item) => item.id !== transaction.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete transaction.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    fetchLeagueTransactions()
      .then(setTransactions)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unable to load transactions."))
      .finally(() => setLoading(false));
  }, []);

  const filterTeams = useMemo(() => {
    const teams = new Map<number, ReturnType<typeof transactionTeams>[number]>();
    transactions.forEach((transaction) => transactionTeams(transaction).forEach((team) => teams.set(team.id, team)));
    return [...teams.values()].sort((a, b) => a.id - b.id);
  }, [transactions]);

  const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
    const transactionType = transaction.trade_offer_id ? "trade" : transaction.action;
    if (typeFilter !== "all" && transactionType !== typeFilter) return false;
    if (selectedTeamIds.size && !transactionTeams(transaction).some((team) => selectedTeamIds.has(team.id))) return false;
    return true;
  }), [transactions, typeFilter, selectedTeamIds]);

  function toggleTeam(teamId: number) {
    setSelectedTeamIds((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function handleWhatsAppShare(transaction: LeagueTransaction) {
    const message = getWhatsAppMessage(transaction, transactions);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div>
      <PageMeta title="Transactions | Front Office Baseball League" description="Front Office Baseball League transactions" />
      <PageBreadcrumb pageTitle="Transactions" />
      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-4 py-6 dark:border-gray-800 dark:bg-white/[0.03] sm:px-5 sm:py-7 xl:px-10 xl:py-12">
        <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
          <div>
          <h3 className="font-semibold text-gray-800 text-theme-xl dark:text-white/90 sm:text-2xl">Transactions</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Official FOBL signings and player transactions.</p>
          </div>
          {!loading && !error && transactions.length > 0 && <button type="button" onClick={() => setShowFilters((current) => !current)} aria-expanded={showFilters} className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300 md:hidden">{showFilters ? "Hide filters" : `Filters${typeFilter !== "all" || selectedTeamIds.size ? ` (${(typeFilter !== "all" ? 1 : 0) + selectedTeamIds.size})` : ""}`}</button>}
        </div>

        {!loading && !error && transactions.length > 0 && <div className={`${showFilters ? "block" : "hidden"} mb-6 rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.03] md:block`}>
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
            <div>
              <label htmlFor="transaction-type" className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Transaction Type</label>
              <select id="transaction-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                <option value="all">All Transactions</option>
                {transactionTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">User Team <span className="font-normal normal-case">(select multiple)</span></p>
              <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">{filterTeams.map((team) => {
                const checked = selectedTeamIds.has(team.id);
                return <button key={team.id} type="button" onClick={() => toggleTeam(team.id)} title={team.team_name} className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${checked ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"}`}>{team.abbreviation}</button>;
              })}</div>
            </div>
            <button type="button" onClick={() => { setTypeFilter("all"); setSelectedTeamIds(new Set()); }} className="h-10 whitespace-nowrap rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-600 hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900">Clear Filters</button>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Showing {filteredTransactions.length} of {transactions.length} transactions.</p>
        </div>}

        {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading transactions…</p>}
        {error && <p className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</p>}
        {!loading && !error && transactions.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No transactions have been posted yet.</p>}

        {!loading && !error && transactions.length > 0 && filteredTransactions.length === 0 && <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No transactions match the selected filters.</p>}

        {!loading && !error && filteredTransactions.length > 0 && (
          <div className="space-y-4">
            {filteredTransactions.map((transaction) => (
              <article
                key={transaction.id}
                id={getTransactionAnchor(transaction)}
                className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs transition hover:border-brand-200 hover:shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-500/40 sm:p-5"
              >
                <div
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: transaction.fantasy_team?.primary_color || "#465fff" }}
                />
                {transaction.trade_offer_id ? (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                        Trade
                      </span>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {formatTransactionDate(transaction.transaction_date)}
                      </span>
                    </div>
                    <TradeTransactionDetails transaction={transaction} />
                    {transaction.notes && (
                      <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">{transaction.notes}</p>
                    )}
                  </div>
                ) : <div className="flex items-start gap-3 sm:gap-4">
                  <Link
                    to={transaction.fantasy_team?.id ? `/teams/${transaction.fantasy_team.id}` : "/teams"}
                    className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-theme-xs transition hover:border-brand-300 hover:shadow-theme-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500 sm:h-14 sm:w-14"
                    title={transaction.fantasy_team?.team_name || "View teams"}
                  >
                    {transaction.fantasy_team?.logo ? (
                      <img
                        src={transaction.fantasy_team.logo}
                        alt={`${transaction.fantasy_team.team_name} logo`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-300">
                        {transaction.fantasy_team?.abbreviation || "GLDHL"}
                      </span>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                        {getActionLabel(transaction)}
                      </span>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {formatTransactionDate(transaction.transaction_date)}
                      </span>
                    </div>
                    {(() => {
                      const fallbackPosition = getFallbackPosition(transaction, transactions);
                      const sentence = getTransactionSentence(transaction, fallbackPosition);
                      const apiId = transaction.player?.player_api_id;
                      const relatedTradeId = findRelatedTradeId(transaction, transactions);
                      return (
                        <>
                          <p className="text-sm leading-6 text-gray-700 dark:text-gray-300 sm:text-base">
                            {sentence.prefix} {sentence.position ? <PositionBadge position={sentence.position} className="mx-1 align-middle" /> : null}{" "}
                            {apiId ? (
                              <Link
                                to={`/player-profile?playerId=${apiId}`}
                                className="font-medium text-brand-500 hover:text-brand-600 hover:underline"
                              >
                                {getPlayerName(transaction)}
                              </Link>
                            ) : getPlayerName(transaction)}
                            {sentence.suffix}
                          </p>
                          {sentence.contractDetail && (
                            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                              {sentence.contractDetail}
                            </p>
                          )}
                          {relatedTradeId && (
                            <a
                              href={`#trade-${relatedTradeId}`}
                              className="mt-2 inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600 transition hover:border-brand-300 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
                            >
                              Part of Trade #{relatedTradeId} · View full trade
                            </a>
                          )}
                        </>
                      );
                    })()}
                    {transaction.notes && (
                      <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                        {transaction.notes}
                      </p>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTransaction(transaction)}
                        disabled={deletingId === transaction.id}
                        className="mt-3 text-xs font-semibold text-error-500 hover:text-error-600 hover:underline disabled:opacity-50"
                      >
                        {deletingId === transaction.id ? "Deleting…" : "Delete Transaction"}
                      </button>
                    )}
                  </div>
                </div>}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleWhatsAppShare(transaction)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3.5 py-2 text-xs font-semibold text-white shadow-theme-xs transition hover:bg-[#1ebe5d] focus:outline-none focus:ring-2 focus:ring-[#25D366]/40"
                    aria-label={`Share ${getActionLabel(transaction).toLowerCase()} on WhatsApp`}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                      <path d="M12.04 2a9.84 9.84 0 0 0-8.52 14.77L2 22l5.38-1.41A9.91 9.91 0 1 0 12.04 2Zm0 17.92a8.03 8.03 0 0 1-4.1-1.12l-.3-.18-3.2.84.86-3.11-.2-.32a8.03 8.03 0 1 1 6.94 3.89Zm4.4-6.02c-.24-.12-1.43-.71-1.65-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2a7.25 7.25 0 0 1-1.34-1.67c-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.41-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.43-.59 1.63-1.15.2-.57.2-1.05.14-1.15-.06-.1-.22-.16-.46-.28Z" />
                    </svg>
                    Share on WhatsApp
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
