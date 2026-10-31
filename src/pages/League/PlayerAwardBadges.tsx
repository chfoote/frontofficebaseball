import type { PlayerAward } from "../../lib/awards";

const awardOrder = ["championship", "mvp", "rookie of the year", "top c", "top lw", "top rw", "top d"];

function awardPriority(assignment: PlayerAward) {
  const index = awardOrder.indexOf((assignment.award?.name || "").trim().toLowerCase());
  return index === -1 ? awardOrder.length : index;
}

export default function PlayerAwardBadges({ awards, includeMonthly = true }: { awards: PlayerAward[]; includeMonthly?: boolean }) {
  const visibleAwards = includeMonthly ? awards : awards.filter((assignment) => !assignment.is_monthly);
  if (!visibleAwards.length) return null;
  const monthlyIcon = (name: string) => name.startsWith("Forward") ? "🏒" : name.startsWith("Defenceman") ? "🛡️" : "🥅";
  const months = ["October", "November", "December", "January", "February", "March", "April"];
  return <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
    {[...visibleAwards].sort((a, b) => awardPriority(a) - awardPriority(b) || b.season_year - a.season_year).map((assignment) => assignment.award?.image_url ? (
      <img
        key={assignment.id}
        src={assignment.award.image_url}
        alt={assignment.award.name}
        title={`${assignment.award.name} · ${assignment.season_year}`}
        className="inline-block h-6 w-6 rounded object-contain"
      />
    ) : (
      <span key={assignment.id} title={`${assignment.award?.name || "Award"}${assignment.is_monthly && assignment.month_index !== undefined ? ` · ${months[assignment.month_index]}` : ""} · ${assignment.season_year}`} className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${assignment.is_monthly ? "bg-violet-100 dark:bg-violet-500/20" : "bg-amber-100"}`}>{assignment.is_monthly ? monthlyIcon(assignment.award?.name || "") : "🏆"}</span>
    ))}
  </span>;
}
