import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchFantasyTeams, type FantasyTeam } from "../../lib/fantasyTeams";
import { fetchPlayerChanges, type PlayerChange } from "../../lib/playerChangeLog";

const pageSize = 50;
const fieldLabels: Record<string, string> = {
  player_api_id: "NHL player ID",
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name",
  on_trade_block: "Trade block",
  player_id: "Player ID",
  season_year: "Season",
  fantasy_team_id: "Fantasy team",
  salary: "Salary",
  position: "Position",
  term_end_year: "Term ends",
  contract_group: "Contract group",
  notes: "Notes",
};
const hiddenFields = new Set(["id", "created_at", "updated_at"]);
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function formatValue(field: string, value: unknown, teams: FantasyTeam[]) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "fantasy_team_id") {
    const team = teams.find((item) => item.id === Number(value));
    return team ? `${team.team_name} (#${team.id})` : `Team #${value}`;
  }
  if (field === "salary" && typeof value === "number") return money.format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function changedFields(change: PlayerChange) {
  const before = change.old_data || {};
  const after = change.new_data || {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => !hiddenFields.has(field) && JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

export default function PlayerChangeLog() {
  const [changes, setChanges] = useState<PlayerChange[]>([]);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetchPlayerChanges(undefined, appliedSearch, pageSize).then((rows) => {
      if (!active) return;
      setChanges(rows);
      setHasMore(rows.length === pageSize);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to load player changes.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appliedSearch]);

  useEffect(() => {
    fetchFantasyTeams(true).then(setTeams).catch(() => {});
  }, []);

  async function loadMore() {
    const oldestId = changes[changes.length - 1]?.id;
    if (!oldestId || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const rows = await fetchPlayerChanges(oldestId, appliedSearch, pageSize);
      setChanges((current) => [...current, ...rows]);
      setHasMore(rows.length === pageSize);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load older changes.");
    } finally {
      setLoadingMore(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  return <div>
    <PageMeta title="Player Change Log | Great Lakes Dynasty" description="Admin history of player and season changes" />
    <PageBreadcrumb pageTitle="Player Change Log" />
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Player & Season Changes</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Added, edited, and deleted player records are recorded here. This log begins when the database migration is applied.</p>
      <form onSubmit={submitSearch} className="mt-4 flex flex-wrap gap-2">
        <label htmlFor="change-search" className="sr-only">Search player name</label>
        <input id="change-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search player name" className="h-10 min-w-52 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white" />
        <button type="submit" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Search</button>
        {appliedSearch && <button type="button" onClick={() => { setSearch(""); setAppliedSearch(""); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">Clear</button>}
      </form>
    </div>

    {error && <p role="alert" className="mb-4 rounded-lg bg-error-50 p-3 text-sm text-error-700">{error}</p>}
    {loading ? <p role="status" className="text-sm text-gray-500">Loading changes…</p> : changes.length ? <div className="space-y-4">
      {changes.map((change) => <article key={change.id} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{change.operation === "INSERT" ? "Added" : change.operation === "DELETE" ? "Deleted" : "Edited"} {change.table_name === "players" ? "player" : "season"}</span>
              <h2 className="font-semibold text-gray-900 dark:text-white">{change.player_name || `Player #${change.player_id}`}{change.season_year ? ` · ${change.season_year}` : ""}</h2>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{new Date(change.changed_at).toLocaleString("en-CA")} · {change.actor_email || (change.actor_id ? `User ${change.actor_id}` : "System / unknown actor")}</p>
          </div>
          <Link to="/admin/players" className="text-xs font-semibold text-brand-500 hover:underline">Manage players</Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead><tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400"><th className="py-2 pr-4">Field</th><th className="py-2 pr-4">Before</th><th className="py-2">After</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{changedFields(change).map((field) => <tr key={field}>
              <th className="py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">{fieldLabels[field] || field}</th>
              <td className="max-w-72 break-words py-2 pr-4 text-gray-500 dark:text-gray-400">{formatValue(field, change.old_data?.[field], teams)}</td>
              <td className="max-w-72 break-words py-2 text-gray-900 dark:text-white">{formatValue(field, change.new_data?.[field], teams)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </article>)}
      {hasMore && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="w-full rounded-lg border border-gray-300 p-3 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">{loadingMore ? "Loading…" : "Load older changes"}</button>}
    </div> : <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700">No player changes found.</p>}
  </div>;
}
