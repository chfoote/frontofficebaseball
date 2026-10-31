import type { FantasyTeam } from "../../lib/fantasyTeams";

export default function TeamIdentityCard({ team, season, managerName }: { team: FantasyTeam; season: number; managerName?: string | null }) {
  return <header
    className="relative overflow-hidden rounded-2xl bg-gray-950 p-5 text-white shadow-lg sm:p-7"
    style={{ backgroundImage: `linear-gradient(125deg, #111827 0%, ${team.primary_color || "#1d4ed8"} 72%, ${team.secondary_color || "#f97316"} 145%)` }}
  >
    <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border-[48px] border-white/5" />
    <div className="pointer-events-none absolute -bottom-28 right-24 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
    <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white p-2 shadow-xl sm:h-32 sm:w-32">
          {team.logo ? <img src={team.logo} alt={`${team.team_name} logo`} className="h-full w-full object-contain" /> : <span className="text-2xl font-black text-gray-900">{team.abbreviation}</span>}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white/85">FOBL Club</span>
            <span className="rounded-full border border-white/20 bg-black/15 px-3 py-1 text-xs font-bold uppercase tracking-wider">{team.abbreviation}</span>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{team.team_name}</h1>
          <p className="mt-2 text-sm text-white/70">Team #{team.id} · Established FOBL franchise</p>
        </div>
      </div>
      <div className="min-w-56 rounded-xl border border-white/20 bg-black/20 p-4 shadow-sm backdrop-blur-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Team Manager</p>
        <p className="mt-1 text-lg font-bold">{managerName || team.manager_name || "Not set"}</p>
        <p className="mt-1 text-xs text-white/65">{season} season</p>
      </div>
    </div>
    <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
      <div className="flex items-center gap-4 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-black">EAST</div>
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">MLB Farm System 1</p><p className="mt-1 truncate font-semibold">Seasonal assignment</p></div>
      </div>
      <div className="flex items-center gap-4 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-black">WEST</div>
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">MLB Farm System 2</p><p className="mt-1 truncate font-semibold">Seasonal assignment</p></div>
      </div>
    </div>
  </header>;
}
