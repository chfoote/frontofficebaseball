import PlayerPositionEligibility from "../hockey/PlayerPositionEligibility";
import type { useMlbEligibility } from "../../hooks/useMlbEligibility";
import { formatFantasyPoints } from "../../lib/nhl";
import { validTargetEstimate } from "../../lib/managerTargets";
import { useState } from "react";
import { Link } from "react-router";
import type { ManagerTarget, useManagerTargets } from "../../hooks/useManagerTargets";

type TargetProduction = { points: number; gamesPlayed: number };

function TargetRow({ target, list, available, production, eligibility, onPlan }: { target: ManagerTarget; list: ReturnType<typeof useManagerTargets>; available: boolean; production?: TargetProduction; eligibility: ReturnType<typeof useMlbEligibility>; onPlan: (target: ManagerTarget) => void }) {
  const [salary, setSalary] = useState(target.estimated_salary);
  const [term, setTerm] = useState(target.term);
  const valid = validTargetEstimate(salary, term);
  const dirty = salary !== target.estimated_salary || term !== target.term;
  const inputClass = "h-8 w-full rounded border border-gray-300 bg-white px-2 text-xs tabular-nums dark:border-gray-700 dark:bg-gray-900";
  return <tr className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
    <td className="max-w-36 px-2 py-2"><Link to={`/baseball-player-profile?playerId=${target.player_api_id}&type=${target.stat_group}`} title={target.player_name} className="block truncate font-semibold text-brand-500 hover:underline">{target.player_name}</Link><span className={`mt-0.5 block text-[9px] ${available ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`} title={available ? "Available for mock signing" : "Unavailable in this season / scenario"}>{available ? "Available" : "Unavailable"}</span></td>
    <td className="px-2 py-2 text-center font-semibold text-gray-500">{target.stat_group === "hitting" ? <PlayerPositionEligibility position={target.position} positions={eligibility.positions.get(Number(target.player_api_id))} loading={eligibility.loading} error={eligibility.error} /> : target.position}</td>
    <td className="px-2 py-2 text-right font-semibold tabular-nums text-brand-500">{production ? formatFantasyPoints(production.points) : "—"}</td>
    <td className="px-2 py-2 text-right tabular-nums text-gray-500">{production && production.gamesPlayed > 0 ? (production.points / production.gamesPlayed).toFixed(2) : "—"}</td>
    <td className="w-28 px-2 py-2"><input aria-label={`Estimated annual salary for ${target.player_name}`} aria-invalid={!valid} type="number" min="250000" max="2147483647" step="50000" value={salary} onChange={(event) => setSalary(Number(event.target.value))} className={inputClass} /></td>
    <td className="w-14 px-2 py-2"><input aria-label={`Term in years for ${target.player_name}`} aria-invalid={!valid} type="number" min="1" max="5" step="1" value={term} onChange={(event) => setTerm(Number(event.target.value))} className={inputClass} /></td>
    <td className="px-2 py-2"><div className="flex items-center gap-1 whitespace-nowrap"><button type="button" disabled={!valid || !dirty || list.busy} onClick={() => void list.save({ ...target, estimated_salary: salary, term })} className="rounded border border-gray-300 px-2 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-gray-700">Save</button><button type="button" disabled={!valid || !available || list.busy} onClick={() => onPlan({ ...target, estimated_salary: salary, term })} className="rounded bg-brand-500 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40" aria-label={`Plan signing for ${target.player_name}`} title={available ? "Load estimated contract into Mock Move" : "Unavailable in this season / scenario"}>Plan</button></div>{!valid && <p className="mt-1 text-[10px] text-error-500">Minimum $250,000; 1–5 whole years.</p>}</td>
    <td className="px-2 py-2 text-right"><button type="button" disabled={list.busy} onClick={() => void list.remove(target.player_api_id)} aria-label={`Remove ${target.player_name} from targets`} title="Remove target" className="rounded px-1 py-1.5 text-sm text-gray-400 hover:text-error-500 disabled:opacity-40">×</button></td>
  </tr>;
}

export default function TargetsPanel({ list, availableIds, production, statsSeason, eligibility, onPlan }: { list: ReturnType<typeof useManagerTargets>; availableIds: Set<string>; production: ReadonlyMap<string, TargetProduction>; statsSeason: number; eligibility: ReturnType<typeof useMlbEligibility>; onPlan: (target: ManagerTarget) => void }) {
  const positionOrder = ["C", "1B", "2B", "SS", "3B", "OF", "DH", "SP", "RP"];
  const orderedTargets = [...list.targets].sort((a, b) => {
    const rank = (position: string) => { const index = positionOrder.indexOf(position.toUpperCase()); return index < 0 ? positionOrder.length : index; };
    return rank(a.position) - rank(b.position) || (production.get(b.player_api_id)?.points ?? 0) - (production.get(a.player_api_id)?.points ?? 0) || a.player_name.localeCompare(b.player_name);
  });
  function targetTable(title: string, targets: ManagerTarget[]) {
    return <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between bg-gray-50 px-3 py-2 dark:bg-gray-900"><h3 className="text-xs font-bold text-gray-800 dark:text-gray-200">{title}</h3><span className="text-[10px] text-gray-400">{targets.length} targets</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><caption className="sr-only">{title} targets and estimated contracts, ordered by position and descending fantasy points</caption><thead className="border-y border-gray-200 text-[9px] uppercase tracking-wide text-gray-400 dark:border-gray-800"><tr>{["Player", title === "Position Players" ? "Pos / Eligible" : "Pos", "FPTS", "PPG", "Annual cap hit", "Yrs", "Actions", ""].map((label, index) => <th key={index} scope="col" className="px-2 py-2 font-semibold">{label || <span className="sr-only">Remove target</span>}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{targets.map((target) => <TargetRow key={`${target.player_api_id}:${target.estimated_salary}:${target.term}`} target={target} list={list} available={availableIds.has(target.player_api_id)} production={production.get(target.player_api_id)} eligibility={eligibility} onPlan={onPlan} />)}{!targets.length && <tr><td colSpan={8} className="px-3 py-5 text-center text-gray-400">No targets yet</td></tr>}</tbody></table></div>
    </section>;
  }
  return <section id="my-targets" className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="px-4 py-3"><h2 className="text-base font-bold text-gray-900 dark:text-white">★ My Targets <span className="text-sm text-gray-400">({list.targets.length})</span></h2>
    <p className="mt-1 text-sm text-gray-500">Star players on the <Link to="/batter-stats" className="text-brand-500 hover:underline">batter</Link> or <Link to="/pitcher-stats" className="text-brand-500 hover:underline">pitcher stats</Link> pages. Ordered by position, then highest {statsSeason} score. PPG = points per game. Set cap hit and years, Save estimates, or Plan a mock signing.</p>
    </div>
    {list.error && <p role="alert" className="px-4 pb-3 text-sm text-error-500">{list.error}</p>}
    {list.loading ? <p className="px-4 pb-4 text-sm text-gray-500">Loading targets…</p> : !list.targets.length ? <p className="px-4 pb-4 text-sm text-gray-500">{list.signedIn ? "No targets yet. Start with an unowned player you want to pursue." : "Sign in to save your private targets."}</p> : <div className="grid items-start gap-3 border-t border-gray-100 p-3 dark:border-gray-800 lg:grid-cols-2">{targetTable("Position Players", orderedTargets.filter((target) => target.stat_group === "hitting"))}{targetTable("Pitchers", orderedTargets.filter((target) => target.stat_group === "pitching"))}</div>}

  </section>;
}
