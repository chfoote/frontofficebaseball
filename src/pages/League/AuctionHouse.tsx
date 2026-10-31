import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import {
  compareAuctionBids,
  fetchAuctions,
  placeAuctionBid,
  respondRfaMatch,
  respondRfaQualification,
  setAuctionPaused,
  type Auction,
  type AuctionBid,
} from "../../lib/auctions";
import {
  fetchPlayerSeasonsByTeamAndSeason,
  type PlayerSeasonWithRelations,
} from "../../lib/fantasyPlayers";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import { fetchBuyoutPenalties, type BuyoutPenalty } from "../../lib/buyouts";
import { fetchRetentionAdjustments, type RetentionAdjustment } from "../../lib/retentions";
import {
  fetchLatestUserTeamAssignment,
  fetchUserTeamAssignment,
  type TeamUserAssignmentWithTeam,
} from "../../lib/teamUserAssignments";
import {
  fetchNhlGoalieStats,
  fetchNhlPlayerLanding,
  fetchNhlSkaterStats,
  formatFantasyPoints,
  formatNhlStat,
  getGoalieScore,
  getSkaterScore,
  type NhlGoalieRecord,
  type NhlPlayerLanding,
  type NhlSkaterRecord,
} from "../../lib/nhl";
import {
  applyTeamBranding,
  fetchFantasyTeams,
  fetchTeamBrandingHistory,
  type FantasyTeam,
} from "../../lib/fantasyTeams";
import { supabase } from "../../lib/supabase";

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const requiredRoster = { C: 3, LW: 3, RW: 3, D: 6, G: 2 } as const;
const minimumSalaryPerOpening = 750_000;
const allowedAuctionYears = [1, 2, 3, 5] as const;
type RosterPosition = keyof typeof requiredRoster;

function allowedAuctionTerm(years: number | undefined) {
  return allowedAuctionYears.includes(years as (typeof allowedAuctionYears)[number]) ? years! : 1;
}

function BidSnipeBadge({ seconds }: { seconds: number | null | undefined }) {
  if (seconds === null || seconds === undefined || seconds > 7) return null;
  return <span className="inline-flex rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm">🎯 Snipe · {seconds}s</span>;
}

function nextWinningAav(highBid: AuctionBid | undefined, years: number, minimum: number, increment: number) {
  if (!highBid) return minimum;
  const highTotal = highBid.aav * highBid.years;
  // An equal total wins only when the new contract has a shorter term.
  const requiredTotal = highTotal + (years < highBid.years ? 0 : 1);
  const rawAav = Math.ceil(requiredTotal / years);
  const amountAboveMinimum = Math.max(rawAav - minimum, 0);
  return minimum + Math.ceil(amountAboveMinimum / increment) * increment;
}

function OpenBidLeaderboard({
  bids,
  endsAt,
  now,
  pausedAt,
  pausedSecondsRemaining,
}: {
  bids: AuctionBid[];
  endsAt: string;
  now: number;
  pausedAt: string | null;
  pausedSecondsRemaining: number | null;
}) {
  const ranked = [...bids].sort(compareAuctionBids);
  const top = ranked[0];
  const others = ranked.slice(1);

  if (!top) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        No bids yet. The first submitted contract becomes the top bid.
      </p>
    );
  }

  const topValue = top.aav * top.years;
  const pausedSeconds = Math.max(pausedSecondsRemaining || 0, 0);
  const countdown = pausedAt
    ? `${Math.floor(pausedSeconds / 60)}:${String(pausedSeconds % 60).padStart(2, "0")}`
    : remaining(endsAt, now);
  const ended = !pausedAt && new Date(endsAt).getTime() <= now;
  return (
    <div className="mt-4 space-y-4">
      <div className="relative overflow-hidden rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-gray-950 via-gray-900 to-amber-950 p-5 text-white shadow-lg ring-2 ring-amber-300/30">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-400/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-gray-950">
              🔥 Top Bid — Contract to Beat
            </span>
            <span className="text-xs font-bold uppercase tracking-wide text-amber-300">
              #1 Overall
            </span>
            <BidSnipeBadge seconds={top.submitted_seconds_remaining} />
          </div>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white p-1.5 shadow-md">
              {top.fantasy_team?.logo ? (
                <img
                  src={top.fantasy_team.logo}
                  alt={`${top.fantasy_team.team_name} logo`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-sm font-black text-gray-700">
                  {top.fantasy_team?.abbreviation || "TEAM"}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-black sm:text-2xl">
                {top.fantasy_team?.team_name || "Unknown team"}
              </p>
              <p className="mt-1 text-lg font-bold text-amber-300 sm:text-xl">
                {money.format(top.aav)} for {top.years}{" "}
                {top.years === 1 ? "year" : "years"}
              </p>
              <p className="mt-2 text-sm font-semibold text-white/70">
                Total contract value
              </p>
              <p className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                {money.format(topValue)}
              </p>
            </div>
            <div
              className={`shrink-0 rounded-2xl border px-5 py-4 text-center shadow-inner ${pausedAt ? "border-warning-400/60 bg-warning-500/15" : ended ? "border-error-400/60 bg-error-500/15" : "border-amber-300/50 bg-black/30"}`}
            >
              <p
                className={`text-[10px] font-black uppercase tracking-[0.2em] ${pausedAt ? "text-warning-300" : ended ? "text-error-300" : "text-amber-300"}`}
              >
                {pausedAt
                  ? "Auction Paused"
                  : ended
                    ? "Bidding Ended"
                    : "Time Remaining"}
              </p>
              <p
                className={`mt-1 whitespace-nowrap font-mono text-5xl font-black leading-none tabular-nums sm:text-6xl ${pausedAt ? "text-warning-300" : ended ? "text-error-300" : "text-white"}`}
              >
                {countdown}
              </p>
              {!pausedAt && !ended && (
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-white/50">
                  Submit before zero
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {others.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-gray-500">
            Other teams’ best bids
          </p>
          <div className="space-y-2">
            {others.map((bid, index) => (
              <div
                key={bid.id}
                className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-xs font-black text-gray-400">
                    #{index + 2}
                  </span>
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700">
                    {bid.fantasy_team?.logo ? (
                      <img
                        src={bid.fantasy_team.logo}
                        alt={`${bid.fantasy_team.team_name} logo`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-[9px] font-black text-gray-500">
                        {bid.fantasy_team?.abbreviation || "TEAM"}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">
                    {bid.fantasy_team?.team_name || "Unknown team"}
                  </p>
                  <BidSnipeBadge seconds={bid.submitted_seconds_remaining} />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {money.format(bid.aav)} for {bid.years}{" "}
                    {bid.years === 1 ? "year" : "years"}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    Contract value
                  </p>
                  <p className="text-lg font-black text-gray-800 dark:text-white">
                    {money.format(bid.aav * bid.years)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function name(a: Auction) {
  const p = a.player_season?.player || a.player;
  return (
    p?.full_name ||
    [p?.first_name, p?.last_name].filter(Boolean).join(" ") ||
    a.player_name ||
    "Unknown Player"
  );
}
function message(e: unknown) {
  if (e instanceof Error) return e.message;
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message?: unknown }).message === "string"
  )
    return (e as { message: string }).message;
  return "Unable to update the auction.";
}
function remaining(end: string, now: number) {
  const ms = new Date(end).getTime() - now;
  if (ms <= 0) return "Bidding ended";
  const total = Math.floor(ms / 1000),
    d = Math.floor(total / 86400),
    h = Math.floor((total % 86400) / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60;
  return d
    ? `${d}d ${h}h ${m}m`
    : h
      ? `${h}h ${m}m`
      : `${m}:${String(s).padStart(2, "0")}`;
}
function nhlSeasonId(year: number) {
  return (year - 1) * 10000 + year;
}
function height(value?: number) {
  return value ? `${Math.floor(value / 12)}' ${value % 12}"` : "—";
}
function birthday(value?: string) {
  return value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
}

function AuctionPlayerCard({
  auction,
  landing,
  skater,
  goalie,
}: {
  auction: Auction;
  landing?: NhlPlayerLanding;
  skater?: NhlSkaterRecord;
  goalie?: NhlGoalieRecord;
}) {
  const player = auction.player_season?.player || auction.player;
  const statsSeason = auction.season_year - 1;
  const draft = landing?.draftDetails;
  const score = skater
    ? getSkaterScore(skater)
    : goalie
      ? getGoalieScore(goalie)
      : null;
  const games = skater?.gamesPlayed ?? goalie?.gamesPlayed ?? 0;
  const profileUrl = player?.player_api_id
    ? `/player-profile?playerId=${player.player_api_id}`
    : "";
  const metrics = skater
    ? [
        ["GP", skater.gamesPlayed],
        ["G", skater.goals],
        ["A", skater.assists],
        ["+/-", skater.plusMinus],
        ["PIM", skater.penaltyMinutes],
        ["PPP", skater.ppPoints],
        ["S", skater.shots],
        ["B", skater.blockedShots],
        ["H", skater.hits],
        ["FOW", skater.totalFaceoffWins],
      ]
    : goalie
      ? [
          ["GP", goalie.gamesPlayed],
          ["GS", goalie.gamesStarted],
          ["W", goalie.wins],
          ["L", goalie.losses],
          ["OTL", goalie.otLosses],
          ["SV", goalie.saves],
          ["SO", goalie.shutouts],
          ["G", goalie.goals],
          ["A", goalie.assists],
          ["SV%", goalie.savePct?.toFixed(3) ?? "—"],
          ["GAA", formatNhlStat(goalie.goalsAgainstAverage, 2)],
        ]
      : [];
  return (
    <div className="border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5 dark:border-gray-800 dark:from-gray-900 dark:to-gray-950">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            {landing?.headshot && (
              <img
                src={landing.headshot}
                alt={`${name(auction)} headshot`}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              {profileUrl ? (
                <Link
                  to={profileUrl}
                  className="text-2xl font-bold text-brand-600 hover:underline dark:text-brand-400"
                >
                  {name(auction)}
                </Link>
              ) : (
                <h3 className="text-2xl font-bold">{name(auction)}</h3>
              )}
              {landing?.sweaterNumber != null && (
                <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  #{landing.sweaterNumber}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              {landing?.teamLogo && (
                <img
                  src={landing.teamLogo}
                  alt=""
                  className="h-8 w-8 object-contain"
                />
              )}
              <span>
                {auction.roster_position} ·{" "}
                {landing?.fullTeamName?.default ||
                  landing?.currentTeamAbbrev ||
                  "NHL club unavailable"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-400">
                  Born
                </p>
                <p className="text-xs font-semibold">
                  {birthday(landing?.birthDate)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-400">
                  Height / Weight
                </p>
                <p className="text-xs font-semibold">
                  {height(landing?.heightInInches)} ·{" "}
                  {landing?.weightInPounds
                    ? `${landing.weightInPounds} lb`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-400">
                  Shoots / Catches
                </p>
                <p className="text-xs font-semibold">
                  {landing?.shootsCatches || "—"}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] font-bold uppercase text-gray-400">
                  Birthplace
                </p>
                <p className="text-xs font-semibold">
                  {[
                    landing?.birthCity?.default,
                    landing?.birthStateProvince?.default,
                    landing?.birthCountry,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] font-bold uppercase text-gray-400">
                  Draft
                </p>
                <p className="text-xs font-semibold">
                  {draft
                    ? `${draft.year || "—"} ${draft.teamAbbrev || ""} · Round ${draft.round || "—"} · Pick ${draft.pickInRound || "—"}${draft.overallPick ? ` (${draft.overallPick} overall)` : ""}`
                    : "Undrafted"}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="min-w-0 xl:w-[620px]">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {statsSeason} NHL Stats
              </p>
              <p className="text-xs text-gray-400">
                Most recent completed season
              </p>
            </div>
            {score != null && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase text-gray-400">
                  Fantasy Score
                </p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatFantasyPoints(score)}{" "}
                  <span className="text-xs font-medium text-gray-500">
                    · {games ? formatFantasyPoints(score / games) : "—"} FPPG
                  </span>
                </p>
              </div>
            )}
          </div>
          {metrics.length ? (
            <div className="mt-3 grid grid-cols-5 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              {metrics.map(([label, value]) => (
                <div
                  key={String(label)}
                  className="border-b border-r border-gray-100 px-2 py-2 text-center last:border-r-0 dark:border-gray-800"
                >
                  <p className="text-[10px] font-bold text-gray-400">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">
              No {statsSeason} NHL statistics were returned.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuctionHouse() {
  const { user, isAdmin } = useAuth();
  const season = CURRENT_LEAGUE_SEASON;
  const [assignment, setAssignment] =
    useState<TeamUserAssignmentWithTeam | null>(null);
  const [roster, setRoster] = useState<PlayerSeasonWithRelations[]>([]);
  const [buyoutPenalties, setBuyoutPenalties] = useState<BuyoutPenalty[]>([]);
  const [retentionAdjustments, setRetentionAdjustments] = useState<RetentionAdjustment[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [leagueTeams, setLeagueTeams] = useState<FantasyTeam[]>([]);
  const [activeTeamIds, setActiveTeamIds] = useState<Set<number>>(new Set());
  const [showLobby, setShowLobby] = useState(false);
  // Browsers require audio to be unlocked by a user gesture on every page load,
  // especially on iOS. Never show sound as enabled before that has happened.
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const auctionSoundSnapshot = useRef<Map<number, { status: Auction["status"]; bidSignature: string }> | null>(null);
  const lastCountdownTone = useRef("");
  const completedSoundIds = useRef<Set<number>>(new Set());
  const [landings, setLandings] = useState<Record<number, NhlPlayerLanding>>(
    {},
  );
  const [skaters, setSkaters] = useState<Record<number, NhlSkaterRecord>>({});
  const [goalies, setGoalies] = useState<Record<number, NhlGoalieRecord>>({});
  const [bidForms, setBidForms] = useState<
    Record<number, { aav: string; years: string; aavTouched?: boolean }>
  >({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [now, setNow] = useState(Date.now());
  const landingRequestsRef = useRef<Set<number>>(new Set());
  async function load() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const assigned =
        (await fetchUserTeamAssignment(user.id, season)) ||
        (await fetchLatestUserTeamAssignment(user.id));
      const [rows, teamRoster, penaltyRows, adjustmentRows] = await Promise.all([
        fetchAuctions(season),
        assigned?.fantasy_team_id
          ? fetchPlayerSeasonsByTeamAndSeason(assigned.fantasy_team_id, season)
          : Promise.resolve([]),
        assigned?.fantasy_team_id
          ? fetchBuyoutPenalties(season, assigned.fantasy_team_id)
          : Promise.resolve([]),
        assigned?.fantasy_team_id
          ? fetchRetentionAdjustments(season, assigned.fantasy_team_id)
          : Promise.resolve([]),
      ]);
      const apiIds = Array.from(
        new Set(
          rows
            .filter((a) => !["completed", "cancelled"].includes(a.status))
            .map((a) =>
              Number((a.player_season?.player || a.player)?.player_api_id),
            )
            .filter(Number.isFinite),
        ),
      );
      const [landingResults, skaterRows, goalieRows] = await Promise.all([
        Promise.all(
          apiIds.map(async (id) => {
            try {
              return [id, await fetchNhlPlayerLanding(id)] as const;
            } catch {
              return null;
            }
          }),
        ),
        fetchNhlSkaterStats(nhlSeasonId(season - 1)).catch(() => []),
        fetchNhlGoalieStats(nhlSeasonId(season - 1)).catch(() => []),
      ]);
      const landingRows = landingResults.filter(
        (row): row is readonly [number, NhlPlayerLanding] => row !== null,
      );
      setAssignment(assigned);
      setAuctions(rows);
      setRoster(teamRoster);
      setBuyoutPenalties(penaltyRows);
      setRetentionAdjustments(adjustmentRows);
      setLandings(Object.fromEntries(landingRows));
      setSkaters(
        Object.fromEntries(skaterRows.map((row) => [row.playerId, row])),
      );
      setGoalies(
        Object.fromEntries(goalieRows.map((row) => [row.playerId, row])),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [season, user]);
  useEffect(() => {
    let mounted = true;
    void Promise.all([fetchFantasyTeams(), fetchTeamBrandingHistory()])
      .then(([teams, branding]) => {
        if (mounted)
          setLeagueTeams(
            teams.map((team) => applyTeamBranding(team, branding, season)),
          );
      })
      .catch(() => {
        /* The auction remains usable if lobby branding cannot load. */
      });
    return () => {
      mounted = false;
    };
  }, [season]);
  useEffect(() => {
    if (!user || !assignment?.fantasy_team_id) return;
    const channel = supabase.channel(`auction-house-presence-${season}`, {
      config: { presence: { key: user.id } },
    });
    const sync = () => {
      const state = channel.presenceState() as Record<
        string,
        Array<{ team_id?: number }>
      >;
      setActiveTeamIds(
        new Set(
          Object.values(state)
            .flat()
            .map((entry) => Number(entry.team_id))
            .filter(Number.isFinite),
        ),
      );
    };
    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED")
          void channel.track({
            team_id: assignment.fantasy_team_id,
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
      });
    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [assignment?.fantasy_team_id, season, user]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = async () => {
      try {
        const rows = await fetchAuctions(season);
        if (active) setAuctions(rows);
      } catch {
        /* Keep the current room visible during a transient refresh failure. */
      }
    };
    const id = window.setInterval(() => void refresh(), 3000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [season, user]);
  useEffect(() => {
    let mounted = true;
    const apiIds = Array.from(
      new Set(
        auctions
          .filter(
            (auction) => !["completed", "cancelled"].includes(auction.status),
          )
          .map((auction) =>
            Number(
              (auction.player_season?.player || auction.player)?.player_api_id,
            ),
          )
          .filter(Number.isFinite),
      ),
    ).filter((id) => !landings[id] && !landingRequestsRef.current.has(id));
    if (!apiIds.length) return;
    apiIds.forEach((id) => landingRequestsRef.current.add(id));
    void Promise.all(
      apiIds.map(async (id) => {
        try {
          return [id, await fetchNhlPlayerLanding(id)] as const;
        } catch {
          landingRequestsRef.current.delete(id);
          return null;
        }
      }),
    ).then((results) => {
      if (!mounted) return;
      const loaded = results.filter(
        (row): row is readonly [number, NhlPlayerLanding] => row !== null,
      );
      if (loaded.length)
        setLandings((current) => ({
          ...current,
          ...Object.fromEntries(loaded),
        }));
    });
    return () => {
      mounted = false;
    };
  }, [auctions, landings]);
  useEffect(() => {
    setBidForms((current) => {
      const next = { ...current };
      for (const auction of auctions) {
        if (auction.status !== "open" || auction.auction_type !== "ufa")
          continue;
        const high = [...auction.auction_bids].sort(compareAuctionBids)[0];
        const minimum = auction.minimum_aav || 500_000;
        const increment = auction.bid_increment || 25_000;
        const existing = next[auction.id];
        if (!existing) {
          const years = allowedAuctionTerm(high?.years);
          next[auction.id] = {
            aav: String(nextWinningAav(high, years, minimum, increment)),
            years: String(years),
            aavTouched: false,
          };
        } else if (!existing.aavTouched) {
          next[auction.id] = {
            ...existing,
            aav: String(nextWinningAav(high, Number(existing.years), minimum, increment)),
          };
        }
      }
      return next;
    });
  }, [auctions]);
  const teamId = assignment?.fantasy_team_id;
  const salary = roster.reduce((sum, row) => sum + (row.salary || 0), 0)
    + buyoutPenalties.reduce((sum, penalty) => sum + penalty.amount, 0)
    + retentionAdjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
  const missingByPosition = Object.fromEntries(
    (Object.keys(requiredRoster) as RosterPosition[]).map((position) => [
      position,
      Math.max(requiredRoster[position] - roster.filter((row) => (row.position || "").toUpperCase() === position).length, 0),
    ]),
  ) as Record<RosterPosition, number>;
  const missingCount = Object.values(missingByPosition).reduce((sum, count) => sum + count, 0);
  const rosterReserve = missingCount * minimumSalaryPerOpening;
  const cap = 47_000_000;
  const active = auctions.filter(
    (a) => !["completed", "cancelled"].includes(a.status),
  );
  const history = auctions.filter((a) =>
    ["completed", "cancelled"].includes(a.status),
  );
  const tone = useCallback((frequency: number, duration = 0.09, delay = 0) => {
    if (!soundEnabledRef.current) return;
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }, []);
  const playCue = useCallback((cue: "nomination" | "bid" | "snipe" | "complete") => {
    if (cue === "nomination") {
      tone(523, 0.12);
      tone(659, 0.12, 0.14);
      tone(784, 0.18, 0.28);
    } else if (cue === "bid") {
      tone(700, 0.1);
      tone(880, 0.12, 0.12);
    } else if (cue === "snipe") {
      tone(980, 0.08);
      tone(760, 0.08, 0.1);
      tone(980, 0.16, 0.2);
    } else {
      tone(784, 0.14);
      tone(659, 0.14, 0.16);
      tone(523, 0.28, 0.32);
    }
  }, [tone]);
  async function toggleSound() {
    const next = !soundEnabled;
    if (next) {
      const context = audioContextRef.current || new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      window.setTimeout(() => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 760;
        gain.gain.setValueAtTime(0.06, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + 0.12,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.13);
      }, 0);
    } else {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
    }
  }
  useEffect(() => {
    const next = new Map(auctions.map((auction) => [auction.id, {
      status: auction.status,
      bidSignature: auction.auction_bids
        .map((bid) => `${bid.id}:${bid.updated_at}:${bid.aav}:${bid.years}`)
        .sort()
        .join("|"),
    }]));
    const previous = auctionSoundSnapshot.current;
    if (previous === null) {
      auctionSoundSnapshot.current = next;
      return;
    }

    for (const auction of auctions) {
      const before = previous.get(auction.id);
      if (!before && !["completed", "cancelled"].includes(auction.status)) {
        playCue("nomination");
        break;
      }
      if (!before) continue;
      if (before.status === "open" && auction.status !== "open" && auction.status !== "cancelled" && !completedSoundIds.current.has(auction.id)) {
        completedSoundIds.current.add(auction.id);
        playCue("complete");
        break;
      }
      const changedBid = before.bidSignature !== next.get(auction.id)?.bidSignature;
      if (changedBid) {
        const newestBid = [...auction.auction_bids].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
        playCue((newestBid?.submitted_seconds_remaining ?? Number.MAX_SAFE_INTEGER) <= 7 ? "snipe" : "bid");
        break;
      }
    }
    auctionSoundSnapshot.current = next;
  }, [auctions, playCue]);
  useEffect(() => {
    const auction = active.find((a) => a.status === "open" && !a.paused_at);
    if (!auction) return;
    const seconds = Math.ceil(
      (new Date(auction.ends_at).getTime() - now) / 1000,
    );
    const key = `${auction.id}-${seconds}`;
    if (seconds <= 0 && !completedSoundIds.current.has(auction.id)) {
      completedSoundIds.current.add(auction.id);
      playCue("complete");
      return;
    }
    if (seconds >= 1 && seconds <= 5 && lastCountdownTone.current !== key) {
      lastCountdownTone.current = key;
      tone(seconds === 1 ? 980 : 760, 0.075);
    }
  }, [active, now, playCue, tone]);
  useEffect(
    () => () => {
      void audioContextRef.current?.close();
    },
    [],
  );
  const reservedByAuction = new Map<number, number>();
  for (const auction of active.filter((row) => !row.is_test)) {
    const ranked = [...auction.auction_bids].sort(compareAuctionBids);
    const committed =
      auction.auction_type === "ufa"
        ? ranked[0]
        : ranked.find((bid) => bid.fantasy_team_id === teamId);
    if (committed && committed.fantasy_team_id === teamId)
      reservedByAuction.set(auction.id, committed.aav);
  }
  const reservedBids = Array.from(reservedByAuction.values()).reduce(
    (sum, aav) => sum + aav,
    0,
  );
  const capSpace = cap - salary - reservedBids;
  const budget = Math.max(capSpace - rosterReserve, 0);
  async function bid(a: Auction) {
    const form = bidForms[a.id] || {
      aav: String(a.minimum_aav || 500_000),
      years: "1",
    };
    setBusy(`bid-${a.id}`);
    setError("");
    setSuccess("");
    try {
      const submittedBid = await placeAuctionBid(a.id, Number(form.aav), Number(form.years));
      setBidForms((current) => ({
        ...current,
        [a.id]: { ...form, aavTouched: true },
      }));
      const seconds = submittedBid.submitted_seconds_remaining;
      setSuccess(seconds !== null && seconds !== undefined
        ? seconds <= 7
          ? `🎯 SNIPE! Bid submitted for ${name(a)} with ${seconds}s remaining.`
          : `Bid submitted for ${name(a)} with ${seconds}s remaining.`
        : `Bid submitted for ${name(a)}.`);
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  async function qualify(a: Auction, value: boolean) {
    setBusy(`q-${a.id}`);
    setError("");
    try {
      await respondRfaQualification(a.id, value);
      setSuccess(
        value
          ? "Qualifying offer accepted. Blind RFA bidding is open."
          : "Rights declined. The player is now in open UFA bidding.",
      );
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  async function match(a: Auction, value: boolean) {
    setBusy(`m-${a.id}`);
    setError("");
    try {
      await respondRfaMatch(a.id, value);
      setSuccess(
        value
          ? "The winning RFA offer was matched."
          : "The player was released to the winning bidder.",
      );
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  async function pause(a: Auction, value: boolean) {
    setBusy(`pause-${a.id}`);
    setError("");
    setSuccess("");
    try {
      await setAuctionPaused(a.id, value);
      setSuccess(
        value
          ? "Auction timer paused. Bidding is disabled."
          : "Auction timer resumed.",
      );
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div>
      <PageMeta
        title="Auction House | Great Lakes Dynasty"
        description="GLDHL immediate player auctions"
      />
      <PageBreadcrumb pageTitle="Auction House" />
      <div className="space-y-6">
        {error && (
          <p className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700">
            {success}
          </p>
        )}
        {loading ? (
          <p className="rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-500">
            Loading auctions…
          </p>
        ) : !assignment ? (
          <p className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-sm text-warning-700">
            Your account is not assigned to a team.
          </p>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[92px_minmax(0,1fr)] xl:items-start">
            <section className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03] xl:sticky xl:top-4">
              <div className="flex items-center justify-between gap-2 xl:mb-3 xl:flex-col">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white xl:text-center">
                    Lobby
                  </h2>
                  <p className="text-xs text-gray-500 xl:hidden">
                    Team logos light up while a manager has the Auction House
                    open.
                  </p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-success-50 px-2 py-1 text-[10px] font-bold text-success-700">
                  {activeTeamIds.size}/{leagueTeams.length}
                </span>
                <button type="button" onClick={() => setShowLobby((current) => !current)} aria-expanded={showLobby} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[10px] font-bold uppercase text-gray-600 dark:border-gray-700 dark:text-gray-300 xl:hidden">{showLobby ? "Hide" : "View"}</button>
              </div>
              <div className={`${showLobby ? "grid" : "hidden"} mt-3 grid-cols-5 gap-2 sm:grid-cols-10 xl:mt-0 xl:grid xl:grid-cols-1`}>
                {leagueTeams.map((team) => {
                  const online = activeTeamIds.has(team.id);
                  return (
                    <div
                      key={team.id}
                      title={`${team.team_name} — ${online ? "Active" : "Not in lobby"}`}
                      className={`relative flex min-w-0 flex-col items-center rounded-xl border px-1 py-1.5 transition-all ${online ? "border-success-300 bg-success-50 shadow-sm dark:border-success-500/40 dark:bg-success-500/10" : "border-gray-200 bg-gray-50 opacity-40 grayscale dark:border-gray-700 dark:bg-gray-900"}`}
                    >
                      <span
                        className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-white dark:ring-gray-900 ${online ? "bg-success-500" : "bg-gray-400"}`}
                      />
                      {team.logo ? (
                        <img
                          src={team.logo}
                          alt={`${team.team_name} logo`}
                          className="h-9 w-9 object-contain"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold">
                          {team.abbreviation}
                        </div>
                      )}
                      <span
                        className={`mt-0.5 truncate text-[9px] font-bold ${online ? "text-success-700 dark:text-success-300" : "text-gray-500"}`}
                      >
                        {team.abbreviation}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void toggleSound()}
                className={`mt-3 w-full rounded-lg px-2 py-2 text-[10px] font-bold uppercase ${soundEnabled ? "bg-brand-500 text-white" : "border border-gray-300 text-gray-500 dark:border-gray-700"}`}
              >
                {soundEnabled ? "🔊 On" : "🔇 Sound"}
              </button>
            </section>
            <div className="min-w-0 space-y-6">
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-3 sm:col-span-1 sm:p-4">
                  <p className="text-xs uppercase text-gray-500">Your Team</p>
                  <p className="mt-1 font-semibold">
                    {assignment.fantasy_team?.team_name}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                  <p className="text-xs uppercase text-gray-500">
                    Cap Space After Active Bids
                  </p>
                  <p className="mt-1 font-semibold">{money.format(capSpace)}</p>
                  {reservedBids > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {money.format(reservedBids)} reserved by leading or sealed
                      bids
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                  <p className="text-xs uppercase text-gray-500">
                    Available After Roster Reserve
                  </p>
                  <p className="mt-1 font-semibold">{money.format(budget)}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {money.format(rosterReserve)} reserved for {missingCount} required {missingCount === 1 ? "spot" : "spots"} at {money.format(minimumSalaryPerOpening)} each
                  </p>
                  {missingCount > 0 && <p className="mt-1 text-xs text-gray-500">
                    {(Object.keys(requiredRoster) as RosterPosition[]).filter((position) => missingByPosition[position] > 0).map((position) => `${position} ${missingByPosition[position]}`).join(" · ")} still needed
                  </p>}
                </div>
              </section>
              <section>
                <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                  Active Auctions
                </h2>
                {active.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
                    No player is currently nominated.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {active.map((a) => {
                      const mine = a.auction_bids.find(
                        (b) => b.fantasy_team_id === teamId,
                      );
                      const visible = [...a.auction_bids].sort(
                        compareAuctionBids,
                      );
                      const ownsRights = a.rights_team_id === teamId;
                      const high = visible[0];
                      const increment = a.bid_increment || 25_000;
                      const minimum =
                        a.auction_type === "rfa" && ownsRights
                          ? Math.max(
                              a.minimum_aav || 500_000,
                              a.qualifying_aav || 500_000,
                            )
                          : a.minimum_aav || 500_000;
                      const defaultYears = allowedAuctionTerm(a.auction_type === "ufa" && high
                        ? high.years
                        : mine?.years);
                      const suggestedAav = a.auction_type === "ufa"
                        ? nextWinningAav(high, defaultYears, minimum, increment)
                        : mine?.aav || minimum;
                      const form = bidForms[a.id] || {
                        aav: String(suggestedAav),
                        years: String(
                          a.auction_type === "ufa" && high
                            ? allowedAuctionTerm(high.years)
                            : allowedAuctionTerm(mine?.years),
                        ),
                      };
                      const auctionPosition = a.roster_position.toUpperCase() as RosterPosition;
                      const fillsRequiredSpot = (missingByPosition[auctionPosition] || 0) > 0;
                      const auctionBudget = Math.max(
                        capSpace + (reservedByAuction.get(a.id) || 0) - rosterReserve + (fillsRequiredSpot ? minimumSalaryPerOpening : 0),
                        0,
                      );
                      const apiId = Number(
                        a.player_season?.player?.player_api_id,
                      );
                      return (
                        <article
                          key={a.id}
                          className={`overflow-hidden rounded-2xl border bg-white dark:bg-white/[0.03] ${a.is_test ? "border-amber-300 dark:border-amber-500/50" : "border-gray-200 dark:border-gray-800"}`}
                        >
                          <div className="border-b border-gray-200 p-5 dark:border-gray-800">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {a.is_test && (
                                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-amber-800">
                                      TEST · Practice only
                                    </span>
                                  )}
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${a.auction_type === "ufa" ? "bg-brand-50 text-brand-700" : "bg-violet-50 text-violet-700"}`}
                                  >
                                    {a.auction_type}
                                  </span>
                                  {a.paused_at && (
                                    <span className="rounded-full bg-warning-50 px-2.5 py-1 text-xs font-bold uppercase text-warning-700">
                                      Paused
                                    </span>
                                  )}
                                </div>
                                {a.is_test && (
                                  <p className="mt-2 text-xs font-semibold text-amber-700">
                                    Bids are simulated. This result will not
                                    affect rosters, contracts, transactions, or
                                    Discord.
                                  </p>
                                )}
                                <p className="mt-1 text-sm text-gray-500">
                                  {a.roster_position}
                                  {a.rights_team
                                    ? ` · Rights: ${a.rights_team.team_name}`
                                    : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 sm:text-right">
                                <div>
                                  <p className="text-xs uppercase text-gray-500">
                                    Timer
                                  </p>
                                  <p className="font-semibold text-gray-900 dark:text-white">
                                    {a.paused_at
                                      ? `Paused · ${a.paused_seconds_remaining || 0}s remaining`
                                      : remaining(a.ends_at, now)}
                                  </p>
                                </div>
                                {isAdmin && a.status === "open" && (
                                  <button
                                    type="button"
                                    disabled={busy === `pause-${a.id}`}
                                    onClick={() => void pause(a, !a.paused_at)}
                                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${a.paused_at ? "bg-success-600 text-white" : "border border-warning-300 bg-warning-50 text-warning-700"}`}
                                  >
                                    {a.paused_at
                                      ? "Resume Timer"
                                      : "Pause Timer"}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <AuctionPlayerCard
                            auction={a}
                            landing={landings[apiId]}
                            skater={skaters[apiId]}
                            goalie={goalies[apiId]}
                          />
                          {a.status === "awaiting_qualification" && (
                            <div className="p-5">
                              <h4 className="font-semibold">
                                RFA qualification decision
                              </h4>
                              <p className="mt-1 text-sm text-gray-500">
                                {a.rights_team?.team_name} may qualify at{" "}
                                {money.format(a.qualifying_aav || 0)} for one
                                year. Qualifying opens blind bidding; declining
                                converts this to open UFA bidding.
                              </p>
                              {ownsRights && (
                                <div className="mt-4 flex gap-2">
                                  <button
                                    disabled={busy === `q-${a.id}`}
                                    onClick={() => void qualify(a, true)}
                                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
                                  >
                                    Qualify Player
                                  </button>
                                  <button
                                    disabled={busy === `q-${a.id}`}
                                    onClick={() => void qualify(a, false)}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold"
                                  >
                                    Decline Rights
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          {a.status === "open" && (
                            <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_320px]">
                              <div className="order-2 lg:order-1">
                                <h4 className="font-semibold">
                                  {a.auction_type === "ufa"
                                    ? "Open bidding"
                                    : "Blind bidding"}
                                </h4>
                                <p className="mt-1 text-sm text-gray-500">
                                  {a.auction_type === "ufa"
                                    ? "Every manager can see each team’s best offer. Highest total contract value wins; shorter term breaks a tie."
                                    : "Other teams cannot see your bid. Highest total contract value wins; shorter term breaks a tie."}
                                </p>
                                {a.auction_type === "ufa" ? (
                                  <OpenBidLeaderboard
                                    bids={visible}
                                    endsAt={a.ends_at}
                                    now={now}
                                    pausedAt={a.paused_at}
                                    pausedSecondsRemaining={
                                      a.paused_seconds_remaining
                                    }
                                  />
                                ) : (
                                  <div className="mt-4 rounded-lg bg-violet-50 p-3 text-sm text-violet-700">
                                    {mine ? (
                                      <>
                                        Your sealed bid:{" "}
                                        <strong>
                                          {money.format(mine.aav)} for{" "}
                                          {mine.years} year
                                          {mine.years === 1 ? "" : "s"}
                                        </strong>
                                        <span className="mt-1 block text-xs font-semibold">
                                          Total value:{" "}
                                          {money.format(mine.aav * mine.years)}
                                        </span>
                                      </>
                                    ) : (
                                      "You have not submitted a sealed bid."
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="order-1 rounded-xl border-2 border-brand-200 bg-white p-4 shadow-sm dark:border-brand-500/30 dark:bg-gray-900 lg:order-2">
                                <h4 className="font-semibold">
                                  {mine ? "Update Bid" : "Place Bid"}
                                </h4>
                                {a.auction_type === "ufa" && high ? (
                                  <p className="mt-1 text-xs text-gray-500">
                                    Suggested next bid:{" "}
                                    {money.format(nextWinningAav(high, Number(form.years), minimum, increment))} for{" "}
                                    {form.years} year
                                    {Number(form.years) === 1 ? "" : "s"}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-xs text-gray-500">
                                    Minimum offer: {money.format(minimum)}
                                  </p>
                                )}
                                <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">
                                  AAV
                                </label>
                                <input
                                  type="number"
                                  min={minimum}
                                  step={increment}
                                  value={form.aav}
                                  onChange={(e) =>
                                    setBidForms((v) => ({
                                      ...v,
                                      [a.id]: { ...form, aav: e.target.value, aavTouched: true },
                                    }))
                                  }
                                  className="mt-1 h-12 w-full rounded-lg border border-gray-300 px-3 text-base dark:border-gray-700 dark:bg-gray-950"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">
                                  {money.format(increment)} increments
                                </p>
                                <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">
                                  Years
                                </label>
                                <select
                                  value={form.years}
                                  onChange={(e) =>
                                    setBidForms((v) => {
                                      const years = Number(e.target.value);
                                      return {
                                        ...v,
                                        [a.id]: {
                                          ...form,
                                          years: e.target.value,
                                          aav: String(a.auction_type === "ufa" ? nextWinningAav(high, years, minimum, increment) : mine?.aav || minimum),
                                          aavTouched: false,
                                        },
                                      };
                                    })
                                  }
                                  className="mt-1 h-12 w-full rounded-lg border border-gray-300 px-3 text-base dark:border-gray-700 dark:bg-gray-950"
                                >
                                  {allowedAuctionYears.map((y) => (
                                    <option key={y}>{y}</option>
                                  ))}
                                </select>
                                <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
                                  <p className="text-[10px] font-black uppercase tracking-wide text-brand-600 dark:text-brand-300">
                                    Your total contract value
                                  </p>
                                  <p className="mt-0.5 text-2xl font-black text-brand-700 dark:text-brand-200">
                                    {money.format(
                                      Number(form.aav || 0) *
                                        Number(form.years || 0),
                                    )}
                                  </p>
                                  <p className="mt-1 text-xs text-brand-600/80 dark:text-brand-300/80">
                                    {money.format(Number(form.aav || 0))} ×{" "}
                                    {Number(form.years || 0)}{" "}
                                    {Number(form.years) === 1
                                      ? "year"
                                      : "years"}
                                  </p>
                                </div>
                                <p
                                  className={`mt-3 text-xs ${Number(form.aav) <= auctionBudget ? "text-success-600" : "text-error-600"}`}
                                >
                                  {a.paused_at
                                    ? "Bidding is disabled while the timer is paused."
                                    : Number(form.aav) <= auctionBudget
                                      ? "Fits your roster reserve budget."
                                      : "Exceeds your roster reserve budget."}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  Maximum AAV for this auction: {money.format(auctionBudget)}{fillsRequiredSpot ? ` · fills a required ${auctionPosition} spot` : ""}
                                </p>
                                <button
                                  disabled={
                                    Boolean(a.paused_at) ||
                                    busy === `bid-${a.id}` ||
                                    now >= new Date(a.ends_at).getTime() ||
                                    Number(form.aav) > auctionBudget
                                  }
                                  onClick={() => void bid(a)}
                                  className="mt-3 h-12 w-full rounded-lg bg-brand-500 px-4 text-base font-bold text-white shadow-theme-sm disabled:opacity-50"
                                >
                                  {busy === `bid-${a.id}`
                                    ? "Submitting…"
                                    : mine
                                      ? "Update Bid"
                                      : "Submit Bid"}
                                </button>
                              </div>
                            </div>
                          )}
                          {a.status === "awaiting_match" && (
                            <div className="p-5">
                              <h4 className="font-semibold">
                                RFA match decision
                              </h4>
                              <p className="mt-1 text-sm text-gray-500">
                                Winning offer:{" "}
                                <strong>
                                  {a.winning_bid?.fantasy_team?.team_name} —{" "}
                                  {money.format(a.winning_bid?.aav || 0)} for{" "}
                                  {a.winning_bid?.years} years
                                </strong>
                                .
                              </p>
                              {ownsRights && (
                                <div className="mt-4 flex gap-2">
                                  <button
                                    disabled={busy === `m-${a.id}`}
                                    onClick={() => void match(a, true)}
                                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
                                  >
                                    Match Contract
                                  </button>
                                  <button
                                    disabled={busy === `m-${a.id}`}
                                    onClick={() => void match(a, false)}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold"
                                  >
                                    Release Player
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
              {history.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-semibold">
                    Auction History
                  </h2>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Player</th>
                          <th>Type</th>
                          <th>Result</th>
                          <th>Winner</th>
                          <th>Contract</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((a) => (
                          <tr
                            key={a.id}
                            className={`border-t ${a.is_test ? "border-amber-200 bg-amber-50/60" : "border-gray-100"}`}
                          >
                            <td className="px-3 py-3 font-medium">
                              {name(a)}{" "}
                              {a.is_test && (
                                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">
                                  TEST
                                </span>
                              )}
                            </td>
                            <td className="text-center uppercase">
                              {a.auction_type}
                            </td>
                            <td className="text-center capitalize">
                              {a.resolution?.replace("_", " ")}
                            </td>
                            <td className="text-center">
                              {a.winning_bid?.fantasy_team?.team_name || "—"}
                            </td>
                            <td className="text-center">
                              {a.winning_bid
                                ? `${money.format(a.winning_bid.aav)} / ${a.winning_bid.years} yr`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
