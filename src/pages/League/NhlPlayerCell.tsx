import type { PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import type { PlayerAward } from "../../lib/awards";
import PlayerAwardBadges from "./PlayerAwardBadges";
import { Link } from "react-router";
import type { ProspectRight } from "../../lib/prospectRights";
import InjuryDesignationBadge from "../../components/hockey/InjuryDesignationBadge";

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function ageFromBirthDate(birthDate?: string) {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age;
}

export default function NhlPlayerCell({
  playerName,
  playerId,
  teamAbbreviation,
  birthDate,
  fantasySeason,
  prospectRight,
  showNhlTeam = true,
  awards = [],
  leadingAction,
  leadershipRole,
}: {
  playerName: string;
  playerId?: string | number;
  teamAbbreviation: string;
  birthDate?: string;
  fantasySeason?: PlayerSeasonWithRelations;
  prospectRight?: ProspectRight;
  showNhlTeam?: boolean;
  awards?: PlayerAward[];
  leadingAction?: React.ReactNode;
  leadershipRole?: "C" | "A";
}) {
  const salary = fantasySeason?.salary;
  const age = ageFromBirthDate(birthDate);
  const profilePlayerId = fantasySeason?.player?.player_api_id || playerId;
  const displayedTeam = fantasySeason?.fantasy_team || prospectRight?.team;
  const isProspectSeason = fantasySeason ? ["PROSPECT", "AP"].includes((fantasySeason.position || "").toUpperCase()) : false;
  const displaysProspectRights = Boolean(prospectRight && !fantasySeason?.fantasy_team) || isProspectSeason;
  const isExpiring = Boolean(
    fantasySeason?.term_end_year
    && fantasySeason.term_end_year === fantasySeason.season_year,
  );

  return (
    <div className="flex min-w-52 items-center gap-2">
      {leadingAction}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        {displayedTeam?.logo ? (
          <img
            src={displayedTeam.logo}
            alt={`${displayedTeam.team_name} logo`}
            title={displaysProspectRights ? `${displayedTeam.team_name} prospect` : displayedTeam.team_name}
            className="h-full w-full object-contain p-0.5"
          />
        ) : (
          <span className="text-[10px] font-semibold text-gray-500">
            {displayedTeam?.abbreviation || "FA"}
          </span>
        )}
      </div>
      <div className="text-left">
        {profilePlayerId ? <Link to={`/player-profile?playerId=${profilePlayerId}`} className="font-medium text-brand-500 hover:text-brand-600 hover:underline">{playerName}</Link> : <span className="font-medium text-gray-800 dark:text-white/90">{playerName}</span>}
        <InjuryDesignationBadge position={fantasySeason?.position} />
        {leadershipRole && <span title={leadershipRole === "C" ? "Team Captain" : "Alternate Captain"} className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 align-middle text-[10px] font-black ring-1 ${leadershipRole === "C" ? "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/40" : "bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/40"}`}>{leadershipRole}</span>}
        <PlayerAwardBadges awards={awards} includeMonthly={false} />
        <p className={`mt-0.5 text-[11px] font-medium ${isExpiring ? "text-orange-600 dark:text-orange-400" : "text-gray-500 dark:text-gray-400"}`}>
          {[
            showNhlTeam ? teamAbbreviation : null,
            age === null ? null : `AGE ${age}`,
            displaysProspectRights
              ? `${displayedTeam?.abbreviation || prospectRight?.team.abbreviation} PROSPECT`
              : salary === null || salary === undefined
              ? "No salary"
              : currencyFormatter.format(salary),
            fantasySeason?.term_end_year,
          ]
            .filter(Boolean)
            .join(" | ")}
          {isExpiring && (
            <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
              Expiring
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
