import type { FantasyTeam } from "../../lib/fantasyTeams";

export type RightsFilter = "all" | "owned" | "unowned";
export type PlayerTypeFilter = "all" | "rostered" | "prospects";

export default function StatsRightsFilters({
  search,
  onSearchChange,
  positions,
  position,
  onPositionChange,
  rights,
  onRightsChange,
  playerType,
  onPlayerTypeChange,
  teams,
  selectedTeamIds,
  onToggleTeam,
  onClear,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  positions?: string[];
  position?: string;
  onPositionChange?: (position: string) => void;
  rights: RightsFilter;
  onRightsChange: (rights: RightsFilter) => void;
  playerType: PlayerTypeFilter;
  onPlayerTypeChange: (playerType: PlayerTypeFilter) => void;
  teams: FantasyTeam[];
  selectedTeamIds: Set<number>;
  onToggleTeam: (teamId: number) => void;
  onClear: () => void;
}) {
  return <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
    <div className={`grid gap-4 md:items-end ${positions ? "md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_120px_130px_150px_minmax(0,1fr)_auto]" : "md:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_140px_150px_minmax(0,1fr)_auto]"}`}>
      <div><label htmlFor="player-search" className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Player Search</label><div className="relative"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">⌕</span><input id="player-search" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by player name…" autoComplete="off" className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></div></div>
      {positions && <div><label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Position</label><select value={position || "all"} onChange={(event) => onPositionChange?.(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="all">All Positions</option>{positions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>}
      <div><label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Rights</label><select value={rights} onChange={(event) => onRightsChange(event.target.value as RightsFilter)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="all">All Players</option><option value="owned">Owned</option><option value="unowned">Not Owned</option></select></div>
      <div><label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Player Type</label><select value={playerType} onChange={(event) => onPlayerTypeChange(event.target.value as PlayerTypeFilter)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="all">All Types</option><option value="rostered">Rostered Only</option><option value="prospects">Prospects Only</option></select></div>
      <div><p className="mb-1.5 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">User Team <span className="normal-case font-normal">(select multiple)</span></p><div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">{teams.map((team) => { const checked = selectedTeamIds.has(team.id); return <button key={team.id} type="button" onClick={() => onToggleTeam(team.id)} className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${checked ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"}`}>{team.abbreviation}</button>; })}</div></div>
      <button type="button" onClick={onClear} className="h-10 whitespace-nowrap rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-600 hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900">Clear Filters</button>
    </div>
  </div>;
}
