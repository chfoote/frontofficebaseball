import { FormEvent, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  fetchPlayerBuyouts,
  processPlayerBuyout,
  type PlayerBuyout,
} from "../../lib/buyouts";
import {
  fetchPlayerSeasons,
  type PlayerSeasonWithRelations,
} from "../../lib/fantasyPlayers";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const positionOrder = ["C", "LW", "RW", "D", "G"];

function name(row: PlayerSeasonWithRelations) {
  return row.player?.full_name || "Unknown Player";
}

function buyoutRate(yearsRemaining: number) {
  if (yearsRemaining >= 3) return 0.5;
  if (yearsRemaining >= 2) return 0.4;
  return 0.3;
}

function calculatedPenalties(contract: PlayerSeasonWithRelations, firstSeason: number) {
  const yearsRemaining = Math.max(1, (contract.term_end_year || firstSeason) - firstSeason + 1);
  const rate = buyoutRate(yearsRemaining);
  const amount = Math.round((contract.salary || 0) * rate);
  return {
    yearsRemaining,
    rate,
    rows: Array.from({ length: yearsRemaining }, (_, index) => ({
      season: firstSeason + index,
      amount: String(amount),
    })),
  };
}

export default function BuyoutAdmin() {
  const [contracts, setContracts] = useState<PlayerSeasonWithRelations[]>([]);
  const [buyouts, setBuyouts] = useState<PlayerBuyout[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [buyoutDate, setBuyoutDate] = useState(
    new Date().toLocaleDateString("en-CA"),
  );
  const [freeAgentSeason, setFreeAgentSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [penalties, setPenalties] = useState([{ season: CURRENT_LEAGUE_SEASON, amount: "" }]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [seasonRows, buyoutRows] = await Promise.all([
        fetchPlayerSeasons(),
        fetchPlayerBuyouts(),
      ]);
      setContracts(
        seasonRows.filter(
          (row) =>
            row.season_year === CURRENT_LEAGUE_SEASON &&
            row.fantasy_team_id &&
            row.salary != null &&
            row.term_end_year != null,
        ),
      );
      setBuyouts(buyoutRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load buyouts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(
    () => contracts.find((row) => row.id === Number(selectedId)) || null,
    [contracts, selectedId],
  );
  const contractsByTeam = useMemo(() => {
    const groups = new Map<string, PlayerSeasonWithRelations[]>();
    contracts.forEach((contract) => {
      const teamName = contract.fantasy_team?.team_name || "Unassigned";
      const group = groups.get(teamName) || [];
      group.push(contract);
      groups.set(teamName, group);
    });
    return [...groups.entries()]
      .sort(([teamA], [teamB]) => teamA.localeCompare(teamB))
      .map(([teamName, rows]) => ({
        teamName,
        rows: rows.sort((a, b) => {
          const aPosition = (a.position || "").toUpperCase();
          const bPosition = (b.position || "").toUpperCase();
          const aRank = positionOrder.includes(aPosition)
            ? positionOrder.indexOf(aPosition)
            : positionOrder.length;
          const bRank = positionOrder.includes(bPosition)
            ? positionOrder.indexOf(bPosition)
            : positionOrder.length;
          return aRank - bRank || name(a).localeCompare(name(b));
        }),
      }));
  }, [contracts]);

  function selectContract(value: string) {
    setSelectedId(value);
    const contract = contracts.find((row) => row.id === Number(value));
    if (!contract) return;
    const firstSeason = contract.season_year;
    setFreeAgentSeason(firstSeason);
    const calculation = calculatedPenalties(contract, firstSeason);
    setPenalties(calculation.rows);
    setNotes(`${Math.round(calculation.rate * 100)}% of ${money.format(contract.salary || 0)} · ${calculation.yearsRemaining} contract ${calculation.yearsRemaining === 1 ? "year" : "years"} remaining`);
  }

  function changeFreeAgentSeason(firstSeason: number) {
    setFreeAgentSeason(firstSeason);
    if (!selected) return;
    const calculation = calculatedPenalties(selected, firstSeason);
    setPenalties(calculation.rows);
    setNotes(`${Math.round(calculation.rate * 100)}% of ${money.format(selected.salary || 0)} · ${calculation.yearsRemaining} contract ${calculation.yearsRemaining === 1 ? "year" : "years"} remaining`);
  }

  function addPenalty() {
    const lastSeason = penalties[penalties.length - 1]?.season || freeAgentSeason - 1;
    setPenalties((current) => [
      ...current,
      { season: lastSeason + 1, amount: "" },
    ]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const rows = penalties
      .filter((row) => row.amount !== "")
      .map((row) => ({ season_year: row.season, amount: Number(row.amount) }));
    if (!rows.length) {
      setError("Enter at least one season penalty amount.");
      return;
    }
    if (!window.confirm(`Process the buyout of ${name(selected)} from ${selected.fantasy_team?.team_name}? This will publish the transaction immediately.`)) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await processPlayerBuyout({
        playerSeasonId: selected.id,
        buyoutDate,
        freeAgentSeason,
        penalties: rows,
        notes: notes.trim() || null,
      });
      setSuccess(`${selected.fantasy_team?.team_name} bought out ${name(selected)}. The transaction and cap penalties are now active.`);
      setSelectedId("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process buyout.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageMeta title="Buyout Admin" description="Process player contract buyouts and cap penalties" />
      <PageBreadcrumb pageTitle="Buyout Admin" />
      <div className="space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs font-black uppercase tracking-widest text-brand-600">Contract Buyout</p>
          <h1 className="mt-1 text-xl font-black text-gray-900 dark:text-white">Process a real player buyout</h1>
          <p className="mt-1 text-sm text-gray-500">The player becomes a free agent without creating a placeholder. Penalties remain attached to the original team and count against its cap.</p>
          {error && <p className="mt-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700">{error}</p>}
          {success && <p className="mt-4 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700">{success}</p>}
          <form onSubmit={submit} className="mt-5 space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="text-sm font-semibold">Player contract
                <select value={selectedId} onChange={(event) => selectContract(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-700 dark:bg-gray-900" disabled={loading}>
                  <option value="">Choose player and contract</option>
                  {contractsByTeam.map((group) => <optgroup key={group.teamName} label={group.teamName}>{group.rows.map((row) => <option key={row.id} value={row.id}>[{(row.position || "—").toUpperCase()}] {name(row)} — {money.format(row.salary || 0)} through {row.term_end_year}</option>)}</optgroup>)}
                </select>
              </label>
              <label className="text-sm font-semibold">Buyout date
                <input type="date" value={buyoutDate} onChange={(event) => setBuyoutDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="text-sm font-semibold">First free-agent season
                <input type="number" min={selected?.season_year || CURRENT_LEAGUE_SEASON} max={selected?.term_end_year || 2035} value={freeAgentSeason} onChange={(event) => changeFreeAgentSeason(Number(event.target.value))} className="mt-1 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900" />
              </label>
            </div>
            {selected && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>{name(selected)}</strong> remains the only player record. Original contract: {money.format(selected.salary || 0)} through {selected.term_end_year}. Starting in {freeAgentSeason}, the player is released from {selected.fantasy_team?.team_name} and becomes available for bidding.</div>}
            <div>
              <div className="mb-2 flex items-center justify-between"><div><h2 className="font-black">Season-by-season cap penalties</h2><p className="text-xs text-gray-500">Automatically calculated: 3+ years = 50%, 2 years = 40%, 1 year = 30%. You can still adjust an amount before publishing.</p></div><button type="button" onClick={addPenalty} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold">+ Add season</button></div>
              <div className="space-y-2">{penalties.map((row, index) => <div key={index} className="grid grid-cols-[1fr_2fr_auto] gap-2"><input aria-label="Penalty season" type="number" value={row.season} onChange={(event) => setPenalties((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, season: Number(event.target.value) } : item))} className="h-11 rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900" /><input aria-label="Penalty amount" type="number" min="0" step="1" value={row.amount} placeholder="Penalty amount" onChange={(event) => setPenalties((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} className="h-11 rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900" /><button type="button" aria-label="Remove penalty" onClick={() => setPenalties((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border border-error-200 px-3 text-error-600">Remove</button></div>)}</div>
            </div>
            <label className="block text-sm font-semibold">Notes
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Formula or commissioner notes" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
            </label>
            <button type="submit" disabled={!selected || saving} className="rounded-lg bg-error-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? "Processing…" : "Process Buyout and Publish Transaction"}</button>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-lg font-black">Buyout Register</h2>
          <p className="text-sm text-gray-500">Permanent player-linked buyouts and their team cap charges.</p>
          <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900"><tr><th className="px-3 py-3 text-left">Player</th><th className="px-3 py-3 text-left">Original Team</th><th className="px-3 py-3">Original Contract</th><th className="px-3 py-3">Free Agent</th><th className="px-3 py-3 text-left">Cap Penalties</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{buyouts.map((buyout) => <tr key={buyout.id}><td className="px-3 py-3 font-bold">{buyout.player?.full_name}</td><td className="px-3 py-3">{buyout.fantasy_team?.team_name}</td><td className="px-3 py-3 text-center">{money.format(buyout.original_aav)} through {buyout.original_term_end_year}</td><td className="px-3 py-3 text-center">{buyout.free_agent_season}</td><td className="px-3 py-3">{[...buyout.buyout_cap_penalties].sort((a, b) => a.season_year - b.season_year).map((penalty) => <div key={penalty.id}>{penalty.season_year}: <strong>{money.format(penalty.amount)}</strong></div>)}</td><td className="px-3 py-3 text-center capitalize">{buyout.status}</td></tr>)}{!buyouts.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">No buyouts have been processed.</td></tr>}</tbody></table></div>
        </section>
      </div>
    </div>
  );
}
