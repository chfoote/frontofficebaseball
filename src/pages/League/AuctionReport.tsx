import { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import {
  compareAuctionBids,
  fetchAuctions,
  type Auction,
} from "../../lib/auctions";
import {
  fetchAuctionBidHistory,
  type AuctionBidHistory,
} from "../../lib/auctionReports";

const seasons = Array.from({ length: 10 }, (_, index) => 2026 + index);
const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function localDateKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function playerName(auction: Auction) {
  return (
    auction.player?.full_name ||
    auction.player_season?.player?.full_name ||
    auction.player_name
  );
}

function newestBidFirst(a: AuctionBidHistory, b: AuctionBidHistory) {
  const timeDifference =
    new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
  return timeDifference || b.id - a.id;
}

function TeamLogo({ bid, compact = false }: { bid: { fantasy_team: AuctionBidHistory["fantasy_team"] }; compact?: boolean }) {
  const team = bid.fantasy_team;
  return team?.logo ? (
    <img src={team.logo} alt="" className={`${compact ? "h-6 w-6 rounded" : "h-9 w-9 rounded-lg"} object-contain`} />
  ) : (
    <span className={`flex ${compact ? "h-6 w-6 rounded text-[8px]" : "h-9 w-9 rounded-lg text-xs"} items-center justify-center bg-gray-100 font-black text-gray-500 dark:bg-gray-800`}>
      {team?.abbreviation?.slice(0, 3) || "—"}
    </span>
  );
}

function TimerStamp({ seconds }: { seconds: number | null | undefined }) {
  if (seconds === null || seconds === undefined) return <span className="text-gray-400">Not recorded</span>;
  const snipe = seconds <= 7;
  return <span className={snipe ? "font-black text-rose-600" : "text-gray-600"}>{seconds}s{snipe ? " · SNIPE" : ""}</span>;
}

function CompactPrintReport({ auctions, history, tab }: { auctions: Auction[]; history: AuctionBidHistory[]; tab: "results" | "timeline" }) {
  return <section className="auction-report-print-only hidden overflow-hidden rounded-lg border border-gray-300 bg-white">
    <table className="w-full border-collapse text-[9px]">
      <thead className="bg-gray-100 text-[8px] uppercase text-gray-600"><tr><th className="px-2 py-1.5 text-left">Player</th><th className="px-2 py-1.5 text-left">Team</th><th className="px-2 py-1.5 text-right">AAV</th><th className="px-2 py-1.5 text-right">Years</th><th className="px-2 py-1.5 text-right">Total</th><th className="px-2 py-1.5 text-right">Bid timestamp</th><th className="px-2 py-1.5 text-right">Timer</th></tr></thead>
      <tbody>
        {auctions.flatMap((auction) => {
          const auctionHistory = history
            .filter((entry) => entry.auction_id === auction.id)
            .sort(newestBidFirst);
          const resultRows = [...auction.auction_bids].sort(compareAuctionBids).map((bid) => {
            const snapshots = auctionHistory.filter((entry) => entry.bid_id === bid.id);
            const timing = snapshots[0];
            return { key: `bid-${bid.id}`, team: bid.fantasy_team, aav: bid.aav, years: bid.years, total: bid.aav * bid.years, timestamp: bid.created_at, seconds: timing?.seconds_remaining, winner: bid.id === (auction.winning_bid?.id || [...auction.auction_bids].sort(compareAuctionBids)[0]?.id) };
          });
          const timelineRows = auctionHistory.map((entry) => ({ key: `history-${entry.id}`, team: entry.fantasy_team, aav: entry.aav, years: entry.years, total: entry.total_value, timestamp: entry.recorded_at, seconds: entry.seconds_remaining, winner: false }));
          const rows = tab === "results" ? resultRows : timelineRows;
          if (!rows.length) return [<tr key={`empty-${auction.id}`} className="border-t border-gray-300"><td className="px-2 py-2 font-black">{playerName(auction)}</td><td colSpan={6} className="px-2 py-2 text-gray-500">No bids recorded</td></tr>];
          return rows.map((row, index) => <tr key={row.key} className={`border-t border-gray-200 ${row.winner ? "bg-emerald-50" : ""}`}>
            {index === 0 && <td rowSpan={rows.length} className="w-[21%] border-r border-gray-200 px-2 py-1.5 align-top"><p className="font-black">{playerName(auction)}</p><p className="text-[8px] uppercase text-gray-500">{auction.roster_position} · {auction.auction_type}{auction.is_test ? " · TEST" : ""}</p></td>}
            <td className="px-2 py-1"><div className="flex items-center gap-1.5"><TeamLogo bid={{ fantasy_team: row.team }} compact /><span className="font-bold">{row.team?.abbreviation || row.team?.team_name || "Team"}{row.winner ? " · WINNER" : ""}</span></div></td>
            <td className="px-2 py-1 text-right font-bold">{money.format(row.aav)}</td><td className="px-2 py-1 text-right">{row.years}</td><td className="px-2 py-1 text-right font-bold">{money.format(row.total)}</td><td className="whitespace-nowrap px-2 py-1 text-right">{new Date(row.timestamp).toLocaleString()}</td><td className="whitespace-nowrap px-2 py-1 text-right"><TimerStamp seconds={row.seconds} /></td>
          </tr>);
        })}
      </tbody>
    </table>
  </section>;
}

export default function AuctionReport() {
  const [season, setSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [auctionDate, setAuctionDate] = useState("");
  const [includeTests, setIncludeTests] = useState(false);
  const [tab, setTab] = useState<"results" | "timeline">("results");
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [history, setHistory] = useState<AuctionBidHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const auctionRows = await fetchAuctions(season);
      const historyRows = await fetchAuctionBidHistory(auctionRows.map((row) => row.id));
      setAuctions(auctionRows);
      setHistory(historyRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load bidding report.");
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const filteredAuctions = useMemo(
    () =>
      auctions.filter(
        (auction) =>
          (includeTests || !auction.is_test) &&
          (!auctionDate || localDateKey(auction.created_at) === auctionDate),
      ),
    [auctionDate, auctions, includeTests],
  );
  const filteredIds = useMemo(
    () => new Set(filteredAuctions.map((auction) => auction.id)),
    [filteredAuctions],
  );
  const visibleHistory = history.filter((entry) => filteredIds.has(entry.auction_id));
  const latestHistoryByBidId = useMemo(() => {
    const latest = new Map<number, AuctionBidHistory>();
    visibleHistory.forEach((entry) => {
      if (entry.bid_id !== null) latest.set(entry.bid_id, entry);
    });
    return latest;
  }, [visibleHistory]);
  const historicalSnapshotCount = visibleHistory.filter(
    (entry) => entry.event_type === "backfilled",
  ).length;

  function handlePrintReport() {
    const previousTitle = document.title;
    const reportLabel = auctionDate || `Season ${season}`;
    document.title = `GLDHL Free Agency Bidding Report - ${reportLabel}`;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
  }

  return (
    <>
      <PageMeta title="Free Agency Bidding Report" description="Auction results and complete bid timeline" />
      <PageBreadcrumb pageTitle="Free Agency Bidding Report" />

      <div id="auction-report-print-area" className="auction-report-print-area space-y-5">
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-600">Auction Admin</p>
              <h1 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">Free Agency Bidding Report</h1>
              <p className="mt-1 text-sm text-gray-500">Review every player result and every recorded offer from your free-agency session.</p>
            </div>
            <div className="auction-report-no-print flex flex-wrap items-end gap-3">
              <label className="text-xs font-bold uppercase text-gray-500">Season
                <select value={season} onChange={(event) => setSeason(Number(event.target.value))} className="mt-1 block h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                  {seasons.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold uppercase text-gray-500">Free Agency Date
                <input type="date" value={auctionDate} onChange={(event) => setAuctionDate(event.target.value)} className="mt-1 block h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </label>
              <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-semibold dark:border-gray-700">
                <input type="checkbox" checked={includeTests} onChange={(event) => setIncludeTests(event.target.checked)} /> Include TEST auctions
              </label>
              <button type="button" onClick={() => void loadReport()} className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-bold text-white">Refresh</button>
              <button type="button" onClick={handlePrintReport} disabled={loading || filteredAuctions.length === 0} className="h-11 rounded-lg bg-gray-900 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900">Save / Print PDF</button>
            </div>
          </div>
          <div className="auction-report-print-only mt-4 hidden border-t border-gray-200 pt-4 text-sm text-gray-600">
            <div className="flex items-center justify-between gap-4">
              <p><strong>{tab === "results" ? "Final Results" : "Complete Bid Timeline"}</strong> · {filteredAuctions.length} {filteredAuctions.length === 1 ? "player" : "players"}</p>
              <p>Season {season}{auctionDate ? ` · ${new Date(`${auctionDate}T12:00:00`).toLocaleDateString()}` : ""}{includeTests ? " · Includes test auctions" : ""}</p>
            </div>
          </div>
          <div className="auction-report-no-print mt-5 flex gap-2 border-b border-gray-200 dark:border-gray-800">
            {([[
              "results",
              "Final Results",
            ], ["timeline", "Complete Bid Timeline"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setTab(value)} className={`border-b-2 px-4 py-3 text-sm font-bold ${tab === value ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500"}`}>{label}</button>
            ))}
          </div>
        </section>

        <CompactPrintReport auctions={filteredAuctions} history={visibleHistory} tab={tab} />

        <div className="auction-report-screen-only space-y-5">
        {error && <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>}
        {loading ? <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading bidding report…</div> : filteredAuctions.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">No auctions match these filters.</div> : tab === "results" ? (
          <div className="space-y-5">
            {filteredAuctions.map((auction) => {
              const ranked = [...auction.auction_bids].sort(compareAuctionBids);
              const winner = auction.winning_bid || ranked[0];
              return <section key={auction.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
                <header className="flex flex-col gap-2 bg-gray-900 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{playerName(auction)}</h2>{auction.is_test && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-gray-950">TEST</span>}</div><p className="text-xs font-bold uppercase tracking-wider text-gray-300">{auction.auction_type} · {auction.roster_position} · {auction.status.replace(/_/g, " ")}</p></div>
                  <div className="text-sm text-gray-300">Nominated {new Date(auction.created_at).toLocaleString()}</div>
                </header>
                {winner && <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10"><p className="text-xs font-black uppercase tracking-widest text-emerald-700">{auction.status === "completed" ? "Final winning contract" : "Current leading contract"}</p><div className="mt-2 flex items-center gap-3"><TeamLogo bid={winner} /><div><p className="font-black text-gray-900 dark:text-white">{winner.fantasy_team?.team_name || "Team"}</p><p className="text-lg font-black text-emerald-700">{money.format(winner.aav)} for {winner.years} {winner.years === 1 ? "year" : "years"} · {money.format(winner.aav * winner.years)} total</p></div></div></div>}
                <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900"><tr><th className="px-4 py-3 text-left">Rank</th><th className="px-4 py-3 text-left">Team</th><th className="px-4 py-3 text-right">AAV</th><th className="px-4 py-3 text-right">Term</th><th className="px-4 py-3 text-right">Total Value</th><th className="px-4 py-3 text-right">Final bid time</th><th className="px-4 py-3 text-right">Timer</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{ranked.length ? ranked.map((bid, index) => <tr key={bid.id} className={bid.id === winner?.id ? "bg-emerald-50/60 dark:bg-emerald-500/5" : ""}><td className="px-4 py-3 font-black">#{index + 1}</td><td className="px-4 py-3"><div className="flex items-center gap-3"><TeamLogo bid={bid} /><span className="font-bold">{bid.fantasy_team?.team_name || "Team"}{bid.is_qualifying_bid ? " (qualifying offer)" : ""}</span></div></td><td className="px-4 py-3 text-right font-semibold">{money.format(bid.aav)}</td><td className="px-4 py-3 text-right">{bid.years} {bid.years === 1 ? "year" : "years"}</td><td className="px-4 py-3 text-right font-black">{money.format(bid.aav * bid.years)}</td><td className="whitespace-nowrap px-4 py-3 text-right text-gray-500">{new Date(bid.created_at).toLocaleString()}</td><td className="whitespace-nowrap px-4 py-3 text-right"><TimerStamp seconds={latestHistoryByBidId.get(bid.id)?.seconds_remaining} /></td></tr>) : <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No bids were placed.</td></tr>}</tbody></table></div>
              </section>;
            })}
          </div>
        ) : (
          <div className="space-y-5">
            {historicalSnapshotCount > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>Historical data note:</strong> {historicalSnapshotCount} older bid {historicalSnapshotCount === 1 ? "record is" : "records are"} shown as a final snapshot. The previous system overwrote earlier offers; every new bid and update is now preserved automatically.</div>}
            {filteredAuctions.map((auction) => {
              const entries = visibleHistory
                .filter((entry) => entry.auction_id === auction.id)
                .sort(newestBidFirst);
              return <section key={auction.id} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-black text-gray-900 dark:text-white">{playerName(auction)}</h2><p className="text-xs font-bold uppercase text-gray-500">{auction.auction_type} · {entries.length} recorded {entries.length === 1 ? "bid" : "bids"} · Newest first</p></div><span className="text-xs text-gray-500">{new Date(auction.created_at).toLocaleString()}</span></div>
                {entries.length === 0 ? <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-900">No bids were recorded.</p> : <ol className="relative ml-4 border-l-2 border-gray-200 dark:border-gray-700">{entries.map((entry, index) => <li key={entry.id} className="relative pb-5 pl-7 last:pb-0"><span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[10px] font-black text-white">{index + 1}</span><div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><TeamLogo bid={entry} /><div><p className="font-bold text-gray-900 dark:text-white">{entry.fantasy_team?.team_name || "Team"}</p><p className="text-xs font-bold uppercase text-gray-500">{entry.event_type === "backfilled" ? "Historical final snapshot" : entry.event_type === "updated" ? "Bid updated" : "Bid submitted"}{entry.is_qualifying_bid ? " · Qualifying offer" : ""}</p></div></div><div className="sm:text-right"><p className="font-black text-brand-600">{money.format(entry.aav)} × {entry.years} {entry.years === 1 ? "year" : "years"}</p><p className="text-sm font-bold">{money.format(entry.total_value)} total value</p><time className="text-xs text-gray-500">{new Date(entry.recorded_at).toLocaleString()}</time><p className="mt-1 text-xs"><TimerStamp seconds={entry.seconds_remaining} /></p></div></div></div></li>)}</ol>}
              </section>;
            })}
          </div>
        )}
        </div>
      </div>
    </>
  );
}
