import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { useLeague } from "../../context/LeagueContext";
import { addLeagueMember, administrationError, fetchAccountLeagues, fetchLeagueDirectory, removeLeagueMember, saveLeagueMember, type LeagueDirectory, type LeagueMember, type LeagueOverview } from "../../lib/leagueAdministration";

const inputClass = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white";

function MemberRow({ member, directory, platformAdmin, busy, onSave, onRemove }: { member: LeagueMember; directory: LeagueDirectory; platformAdmin: boolean; busy: boolean; onSave: (value: LeagueMember) => void; onRemove: () => void }) {
  const [value, setValue] = useState(member);
  const dirty = value.display_name !== member.display_name || value.role !== member.role || value.team_id !== member.team_id;
  return <tr className="align-top hover:bg-gray-50 dark:hover:bg-white/[0.02]">
    <td className="px-3 py-3"><p className="font-semibold text-gray-900 dark:text-white">{member.account_name || member.email}</p><p className="mt-1 text-xs text-gray-400">{member.email}</p></td>
    <td className="w-48 px-3 py-3"><input aria-label={`League display name for ${member.email}`} maxLength={100} value={value.display_name || ""} placeholder={member.account_name || "League name"} onChange={event=>setValue({...value,display_name:event.target.value})} className={inputClass} /></td>
    <td className="w-40 px-3 py-3">{platformAdmin ? <select aria-label={`Role for ${member.email}`} value={value.role} onChange={event=>setValue({...value,role:event.target.value as LeagueMember["role"]})} className={inputClass}><option value="member">Member</option><option value="commissioner">Commissioner</option></select> : <span className="text-xs capitalize text-gray-500">{member.role}</span>}</td>
    <td className="w-56 px-3 py-3"><select aria-label={`Team for ${member.email}`} value={value.team_id ?? ""} onChange={event=>setValue({...value,team_id:event.target.value ? Number(event.target.value) : null})} className={inputClass}><option value="">Unassigned</option>{directory.teams.map(team=><option key={team.id} value={team.id}>{team.team_name}</option>)}</select></td>
    <td className="whitespace-nowrap px-3 py-3"><button type="button" disabled={busy || !dirty} onClick={()=>onSave(value)} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Save</button><button type="button" disabled={busy || (!platformAdmin && member.role==='commissioner')} onClick={onRemove} className="ml-3 text-xs font-semibold text-error-600 disabled:opacity-40">Remove</button></td>
  </tr>;
}

export default function UserAdmin() {
  const { isPlatformAdmin } = useAuth();
  const { league } = useLeague();
  const [params,setParams] = useSearchParams();
  const [leagues,setLeagues] = useState<LeagueOverview[]>([]);
  const [directory,setDirectory] = useState<LeagueDirectory|null>(null);
  const [season,setSeason] = useState(league.current_season);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [email,setEmail] = useState("");
  const [attempt,setAttempt] = useState(0);
  const requestVersion = useRef(0);
  const selectedId=params.get('league') || league.id;
  useEffect(()=>{
    let active=true;
    fetchAccountLeagues().then(rows=>{if(active)setLeagues(rows.filter(item=>isPlatformAdmin || item.membership_role==='commissioner'));}).catch(reason=>{if(active){setError(administrationError(reason));setLoading(false);}});
    return()=>{active=false;};
  },[isPlatformAdmin,attempt]);
  useEffect(()=>{
    const selected=leagues.find(item=>item.id===selectedId);
    if(selected)setSeason(selected.current_season);
  },[selectedId,leagues]);
  const load=useCallback(async()=>{
    const request = ++requestVersion.current;
    const selected=leagues.find(item=>item.id===selectedId);
    if(!selected){setDirectory(null);setLoading(false);return;}
    setLoading(true);setError("");
    try{const result=await fetchLeagueDirectory(selectedId,season);if(request===requestVersion.current)setDirectory(result);}catch(reason){if(request===requestVersion.current){setError(administrationError(reason));setDirectory(null);}}finally{if(request===requestVersion.current)setLoading(false);}
  },[leagues,selectedId,season]);
  const invalidateRequest=useCallback(()=>{requestVersion.current++;},[]);
  useEffect(()=>{void load();return invalidateRequest;},[load,invalidateRequest]);
  async function perform(action:()=>Promise<void>,success:string){
    setBusy(true);setError("");setNotice("");
    try{await action();setNotice(success);await load();}catch(reason){setError(administrationError(reason));}finally{setBusy(false);}
  }
  function add(event:FormEvent){event.preventDefault();void perform(async()=>{await addLeagueMember(selectedId,email.trim());setEmail("");},"Member added.");}
  return <div className="space-y-5"><PageMeta title="User Admin | Front Office Baseball" description="Manage league members, commissioners and team assignments" />
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-500">League administration</p><h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">User Admin</h1><p className="mt-2 text-sm text-gray-500">Manage membership, league display names, and team access.</p></div><Link to={isPlatformAdmin ? '/admin/leagues' : '/'} className="text-sm font-semibold text-brand-500 hover:underline">{isPlatformAdmin ? '← Site Administration' : '← My Leagues'}</Link></header>
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-64 text-xs font-semibold text-gray-500">League<select disabled={busy} value={selectedId} onChange={event=>{setDirectory(null);setNotice("");setParams({league:event.target.value});}} className={`${inputClass} mt-1`}><option value="" disabled>Choose a managed league</option>{leagues.map(item=><option key={item.id} value={item.id}>{item.name}{item.is_enabled ? '' : ' · In setup'}</option>)}</select></label><label className="text-xs font-semibold text-gray-500">Assignment season<input disabled={busy} type="number" min={1900} max={2200} value={season} onChange={event=>setSeason(Number(event.target.value))} className={`${inputClass} mt-1 max-w-28`} /></label><button type="button" onClick={()=>{setAttempt(value=>value+1);void load();}} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-500 dark:border-gray-700">Refresh</button></div>
    {error && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-600">{error}</p>}{notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {loading ? <p role="status" className="text-sm text-gray-500">Loading members…</p> : !directory ? !error && <p className="text-sm text-gray-500">Select a league you administer. Only site administrators and that league’s commissioners can manage its users.</p> : <>
      <form onSubmit={add} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><h2 className="font-bold text-gray-900 dark:text-white">Add a member to {directory.league.name}</h2><p className="mt-1 text-xs text-gray-500">The user must register first. Adding membership does not create or delete their account.</p><div className="mt-3 flex max-w-xl flex-wrap items-end gap-2"><label className="min-w-56 flex-1 text-xs font-semibold text-gray-500">Registered account email<input required type="email" value={email} onChange={event=>setEmail(event.target.value)} className={`${inputClass} mt-1`} /></label><button disabled={busy} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Add member</button></div></form>
      {!directory.league.is_enabled && <p className="text-xs text-gray-500">This league is in setup. Members and commissioners can be arranged now; team assignments become available when its teams are configured.</p>}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800"><h2 className="font-bold text-gray-900 dark:text-white">{directory.league.name} Members</h2><span className="text-xs text-gray-500">{directory.members.length} members · {directory.teams.length} teams</span></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 dark:bg-gray-950"><tr>{['Account','League display name','Role','Team','Actions'].map(label=><th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{directory.members.map(member=><MemberRow key={`${selectedId}:${season}:${member.user_id}:${member.display_name}:${member.role}:${member.team_id}`} member={member} directory={directory} platformAdmin={isPlatformAdmin} busy={busy} onSave={value=>void perform(()=>saveLeagueMember(selectedId,season,value),'Member saved.')} onRemove={()=>{if(window.confirm(`Remove ${member.email} from ${directory.league.name}? Their team access in this league will be removed. Their account and other leagues will remain.`))void perform(()=>removeLeagueMember(selectedId,member.user_id),'Membership and team access removed.');}} />)}</tbody></table></div></section>
    </>}
  </div>;
}
