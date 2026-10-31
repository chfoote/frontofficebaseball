import { FormEvent, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchFantasyTeams, type FantasyTeam } from "../../lib/fantasyTeams";
import { fetchLeagueTransactions } from "../../lib/transactions";
import { fetchContractRetentions, processContractRetention, type ContractRetention } from "../../lib/retentions";
import type { PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
type EligibleMove = { tradeOfferId: number; transactionDate: string; seasonYear: number; season: PlayerSeasonWithRelations; fromTeam: FantasyTeam; toTeam: FantasyTeam };
function playerName(row: PlayerSeasonWithRelations) { return row.player?.full_name || "Unknown Player"; }

export default function RetentionAdmin() {
  const [moves, setMoves] = useState<EligibleMove[]>([]);
  const [retentions, setRetentions] = useState<ContractRetention[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [retentionDate, setRetentionDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [firstSeason, setFirstSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [retentionAmount, setRetentionAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [transactions, teams, retentionRows] = await Promise.all([fetchLeagueTransactions(), fetchFantasyTeams(true), fetchContractRetentions()]);
      const teamMap = new Map(teams.map((team) => [team.id, team]));
      const used = new Set(retentionRows.map((row) => `${row.trade_offer_id}:${row.source_player_season_id}`));
      const available: EligibleMove[] = [];
      transactions.filter((transaction) => transaction.transaction_type === "trade" && transaction.trade_offer_id && transaction.trade_offer).forEach((transaction) => {
        transaction.trade_offer!.trade_offer_players.forEach((move) => {
          const season = move.player_season;
          const fromTeam = teamMap.get(move.from_team_id);
          const toTeam = teamMap.get(move.to_team_id);
          if (!season || !fromTeam || !toTeam || season.salary == null || season.term_end_year == null || used.has(`${transaction.trade_offer_id}:${season.id}`)) return;
          available.push({ tradeOfferId: transaction.trade_offer_id!, transactionDate: transaction.transaction_date, seasonYear: transaction.season_year, season, fromTeam, toTeam });
        });
      });
      setMoves(available); setRetentions(retentionRows);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load retention records."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const selected = useMemo(() => moves.find((move) => `${move.tradeOfferId}:${move.season.id}` === selectedKey) || null, [moves, selectedKey]);
  const maximumAmount = selected ? Math.round((selected.season.salary || 0) * 0.25) : 0;
  const amount = Number(retentionAmount) || 0;
  const retentionPercentage = selected?.season.salary ? amount / selected.season.salary * 100 : 0;
  const previewYears = selected ? Array.from({ length: Math.max(0, (selected.season.term_end_year || firstSeason) - firstSeason + 1) }, (_, index) => firstSeason + index) : [];

  function chooseMove(key: string) {
    setSelectedKey(key);
    const move = moves.find((candidate) => `${candidate.tradeOfferId}:${candidate.season.id}` === key);
    if (!move) return;
    setRetentionDate(move.transactionDate); setFirstSeason(move.seasonYear);
    setRetentionAmount(String(Math.round((move.season.salary || 0) * 0.25)));
    setNotes(`Retained salary on trade #${move.tradeOfferId}.`);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (amount <= 0 || amount > maximumAmount) { setError(`Enter a retention amount between ${money.format(1)} and ${money.format(maximumAmount)}.`); return; }
    if (!window.confirm(`Apply ${money.format(amount)} in retained salary to ${playerName(selected.season)}? ${selected.fromTeam.team_name} will carry the charge and ${selected.toTeam.team_name} will receive matching relief.`)) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await processContractRetention({ tradeOfferId: selected.tradeOfferId, playerSeasonId: selected.season.id, retentionDate, firstSeasonYear: firstSeason, retainedAmount: amount, notes: notes.trim() || null });
      setSuccess(`Retention activated: ${money.format(amount)} charged to ${selected.fromTeam.team_name} and credited to ${selected.toTeam.team_name} each season.`);
      setSelectedKey(""); setRetentionAmount(""); setNotes(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to process retention."); }
    finally { setSaving(false); }
  }

  return <div><PageMeta title="Retention Admin" description="Create and audit retained salary agreements" /><PageBreadcrumb pageTitle="Retention Admin" /><div className="space-y-6">
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-xs font-black uppercase tracking-widest text-brand-600">Retained Salary</p><h1 className="mt-1 text-xl font-black text-gray-900 dark:text-white">Create a retention agreement</h1><p className="mt-1 text-sm text-gray-500">Choose an annual amount up to 25% of the player’s AAV. The player keeps their full contract while matching charge and relief entries run through its original end year.</p>{error && <p className="mt-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700">{error}</p>}{success && <p className="mt-4 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700">{success}</p>}
      <form onSubmit={submit} className="mt-5 space-y-5"><div className="grid gap-4 lg:grid-cols-3"><label className="text-sm font-semibold lg:col-span-2">Completed trade and player<select value={selectedKey} onChange={(event) => chooseMove(event.target.value)} disabled={loading} className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-700 dark:bg-gray-900"><option value="">Choose a traded player</option>{moves.map((move) => <option key={`${move.tradeOfferId}:${move.season.id}`} value={`${move.tradeOfferId}:${move.season.id}`}>Trade #{move.tradeOfferId} · {playerName(move.season)} · {move.fromTeam.abbreviation} → {move.toTeam.abbreviation} · {money.format(move.season.salary || 0)} through {move.season.term_end_year}</option>)}</select></label><label className="text-sm font-semibold">Retention date<input type="date" value={retentionDate} onChange={(event) => setRetentionDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900" /></label></div>
      {selected && <><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Annual retention amount<input type="number" min="1" max={maximumAmount} step="1" value={retentionAmount} onChange={(event) => setRetentionAmount(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900" /><span className="mt-1 block text-xs font-normal text-gray-500">Maximum 25%: {money.format(maximumAmount)}</span></label><label className="text-sm font-semibold">First retention season<input type="number" min={selected.seasonYear} max={selected.season.term_end_year || selected.seasonYear} value={firstSeason} onChange={(event) => setFirstSeason(Number(event.target.value))} className="mt-1 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900" /></label></div><div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/30 dark:bg-violet-500/10"><div className="grid gap-3 sm:grid-cols-4"><div><p className="text-[10px] font-bold uppercase text-violet-500">Player AAV</p><p className="font-black">{money.format(selected.season.salary || 0)}</p></div><div><p className="text-[10px] font-bold uppercase text-violet-500">Retained</p><p className="font-black">{retentionPercentage.toFixed(2)}% · {money.format(amount)}</p></div><div><p className="text-[10px] font-bold uppercase text-violet-500">Former team</p><p className="font-black">{selected.fromTeam.abbreviation} +{money.format(amount)}</p></div><div><p className="text-[10px] font-bold uppercase text-violet-500">Receiving team</p><p className="font-black">{selected.toTeam.abbreviation} −{money.format(amount)}</p></div></div></div><div><h2 className="font-black">Season-by-season preview</h2><div className="mt-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900"><tr><th className="px-3 py-2">Season</th><th className="px-3 py-2">{selected.fromTeam.abbreviation} charge</th><th className="px-3 py-2">{selected.toTeam.abbreviation} relief</th></tr></thead><tbody>{previewYears.map((year) => <tr key={year} className="border-t border-gray-100 text-center dark:border-gray-800"><td className="px-3 py-2 font-bold">{year}</td><td className="px-3 py-2 font-bold text-error-600">+{money.format(amount)}</td><td className="px-3 py-2 font-bold text-success-600">−{money.format(amount)}</td></tr>)}</tbody></table></div></div></>}
      <label className="block text-sm font-semibold">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900" /></label><button type="submit" disabled={!selected || saving || amount <= 0 || amount > maximumAmount} className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? "Creating…" : "Activate Retention"}</button></form>
    </section>
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><h2 className="text-lg font-black">Retention Register</h2><p className="text-sm text-gray-500">Permanent double-entry cap adjustments tied to completed trades.</p><div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900"><tr><th className="px-3 py-3 text-left">Player</th><th className="px-3 py-3">Teams</th><th className="px-3 py-3">Contract</th><th className="px-3 py-3">Annual retention</th><th className="px-3 py-3">Seasons</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{retentions.map((row) => <tr key={row.id}><td className="px-3 py-3 font-bold">{row.player?.full_name}</td><td className="px-3 py-3 text-center">{row.retaining_team?.abbreviation} → {row.receiving_team?.abbreviation}</td><td className="px-3 py-3 text-center">{money.format(row.original_aav)} through {row.term_end_year}</td><td className="px-3 py-3 text-center font-bold">{Number(row.retention_percentage).toFixed(2)}% · {money.format(row.annual_retained_amount)}</td><td className="px-3 py-3 text-center">{row.first_season_year}–{row.term_end_year}</td><td className="px-3 py-3 text-center capitalize">{row.status}</td></tr>)}{!retentions.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">No retention agreements yet.</td></tr>}</tbody></table></div></section>
  </div></div>;
}
