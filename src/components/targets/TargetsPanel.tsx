import { validTargetEstimate } from "../../lib/managerTargets";
import { useState } from "react";
import { Link } from "react-router";
import type { ManagerTarget, useManagerTargets } from "../../hooks/useManagerTargets";

function TargetCard({ target, list, available, onPlan }: { target: ManagerTarget; list: ReturnType<typeof useManagerTargets>; available: boolean; onPlan: (target: ManagerTarget) => void }) {
  const [salary, setSalary] = useState(target.estimated_salary);
  const [term, setTerm] = useState(target.term);
  const valid = validTargetEstimate(salary, term);
  const dirty = salary !== target.estimated_salary || term !== target.term;
  const inputClass = "mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900";
  return <article className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
    <div className="flex items-start justify-between gap-3"><div><Link to={`/baseball-player-profile?playerId=${target.player_api_id}&type=${target.stat_group}`} className="font-bold text-brand-500 hover:underline">{target.player_name}</Link><p className="mt-1 text-xs text-gray-500">{target.position} · {available ? "Available for mock signing" : "Unavailable in this season / scenario"}</p></div><button type="button" disabled={list.busy} onClick={() => void list.remove(target.player_api_id)} aria-label={`Remove ${target.player_name} from targets`} className="text-xs font-bold text-gray-500 hover:text-error-500 disabled:opacity-40">Remove</button></div>
    <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">Est. annual salary<input type="number" min="250000" step="50000" value={salary} onChange={(event) => setSalary(Number(event.target.value))} className={inputClass} /></label><label className="text-xs text-gray-500">Term (years)<input type="number" min="1" max="5" step="1" value={term} onChange={(event) => setTerm(Number(event.target.value))} className={inputClass} /></label></div>
    {!valid && <p className="mt-2 text-xs text-error-500">Minimum $250,000; term must be 1–5 whole years.</p>}
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!valid || !dirty || list.busy} onClick={() => void list.save({ ...target, estimated_salary: salary, term })} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold disabled:opacity-40 dark:border-gray-700">Save estimate</button><button type="button" disabled={!valid || !available || list.busy} onClick={() => onPlan({ ...target, estimated_salary: salary, term })} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Plan signing</button></div>
  </article>;
}

export default function TargetsPanel({ list, availableIds, onPlan }: { list: ReturnType<typeof useManagerTargets>; availableIds: Set<string>; onPlan: (target: ManagerTarget) => void }) {
  return <section id="my-targets" className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
    <h2 className="text-xl font-black text-gray-900 dark:text-white">★ My Targets <span className="text-sm text-gray-400">({list.targets.length})</span></h2>
    <p className="mt-1 text-sm text-gray-500">Your private shortlist. Star players on the <Link to="/batter-stats" className="text-brand-500 hover:underline">batter</Link> or <Link to="/pitcher-stats" className="text-brand-500 hover:underline">pitcher stats</Link> pages, then estimate their cap hit and term here. Plan signing fills in Mock Move for your selected team and season.</p>
    {list.error && <p role="alert" className="mt-3 text-sm text-error-500">{list.error}</p>}
    {list.loading ? <p className="mt-4 text-sm text-gray-500">Loading targets…</p> : !list.targets.length ? <p className="mt-4 text-sm text-gray-500">{list.signedIn ? "No targets yet. Start with an unowned player you want to pursue." : "Sign in to save your private targets."}</p> : <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.targets.map((target) => <TargetCard key={`${target.player_api_id}:${target.estimated_salary}:${target.term}`} target={target} list={list} available={availableIds.has(target.player_api_id)} onPlan={onPlan} />)}</div>}
  </section>;
}
