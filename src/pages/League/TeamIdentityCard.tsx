import type { FantasyTeam } from "../../lib/fantasyTeams";

export default function TeamIdentityCard({ team, season, managerName }: { team: FantasyTeam; season: number; managerName?: string | null }) {
  return <header
    className="relative overflow-hidden rounded-2xl bg-gray-950 p-4 text-white shadow-lg sm:p-5"
    style={{ backgroundImage: `linear-gradient(125deg, #111827 0%, ${team.primary_color || "#1d4ed8"} 76%, ${team.secondary_color || "#f97316"} 150%)` }}
  >
    <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full border-[36px] border-white/5" />
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/25 bg-white p-1.5 shadow-lg sm:h-24 sm:w-24">
          {team.logo ? <img src={team.logo} alt={`${team.team_name} logo`} className="h-full w-full object-contain" /> : <span className="text-xl font-black text-gray-900">{team.abbreviation}</span>}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/75">
            <span>Poolsters Club</span><span className="text-white/30">•</span><span>{team.abbreviation}</span><span className="text-white/30">•</span><span>{season}</span>
          </div>
          <h1 className="mt-1 truncate text-2xl font-black tracking-tight sm:text-3xl">{team.team_name}</h1>
          <p className="mt-1 truncate text-xs text-white/65">Managed by <span className="font-bold text-white/85">{managerName || team.manager_name || "Not set"}</span></p>
        </div>
      </div>
      <div className="hidden shrink-0 rounded-lg border border-white/15 bg-black/15 px-3 py-2 text-right backdrop-blur-sm sm:block">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/50">Franchise</p>
        <p className="mt-0.5 text-xs font-bold">Team #{team.id}</p>
      </div>
    </div>
  </header>;
}
