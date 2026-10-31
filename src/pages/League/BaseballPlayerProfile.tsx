import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import PositionBadge from "../../components/hockey/PositionBadge";
import { fetchMlbPlayerProfile, formatStatValue, type MlbPlayerProfile } from "../../lib/mlb";
import { fetchMlbInitialSigning, type MlbInitialSigning } from "../../lib/mlbFarmSystems";

const MLB_STATS_SEASON = 2026;

const battingStats = [
  ["Games", "gamesPlayed"], ["At Bats", "atBats"], ["Runs", "runs"], ["Hits", "hits"],
  ["Doubles", "doubles"], ["Triples", "triples"], ["Home Runs", "homeRuns"], ["RBI", "rbi"],
  ["Walks", "baseOnBalls"], ["Strikeouts", "strikeOuts"], ["Stolen Bases", "stolenBases"], ["Average", "avg"],
  ["Score", "fantasyScore"], ["PPG", "fantasyPpg"],
] as const;

const pitchingStats = [
  ["Games", "gamesPlayed"], ["Starts", "gamesStarted"], ["Innings", "inningsPitched"], ["Wins", "wins"],
  ["Losses", "losses"], ["Saves", "saves"], ["Strikeouts", "strikeOuts"], ["ERA", "era"],
  ["WHIP", "whip"], ["Complete Games", "completeGames"], ["Shutouts", "shutouts"], ["Home Runs", "homeRuns"],
  ["Score", "fantasyScore"], ["PPG", "fantasyPpg"],
] as const;

function withFantasyScore(stats: Record<string, string | number | null>, type: "hitting" | "pitching") {
  const score = type === "pitching"
    ? Number(stats.wins ?? 0) * 8 + Number(stats.strikeOuts ?? 0) + Number(stats.saves ?? 0) * 6 + Number(stats.completeGames ?? 0) * 5 + Number(stats.shutouts ?? 0) * 5
    : Number(stats.runs ?? 0) + Number(stats.hits ?? 0) + Number(stats.doubles ?? 0) + Number(stats.triples ?? 0) * 2 + Number(stats.homeRuns ?? 0) * 3 + Number(stats.rbi ?? 0) + Number(stats.stolenBases ?? 0) * 2;
  const games = Number(stats.gamesPlayed ?? 0);
  return { ...stats, fantasyScore: score, fantasyPpg: games ? (score / games).toFixed(2) : null };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function BioItem({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 px-4 py-3 first:pl-0 last:pr-0"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">{label}</dt><dd className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{value || "—"}</dd></div>;
}

function StatsLine({ title, stats, fields }: { title: string; stats: Record<string, string | number | null>; fields: readonly (readonly [string, string])[] }) {
  return <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex items-end justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-500">{MLB_STATS_SEASON} regular season</p><h2 className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">{title}</h2></div><span className="text-xs font-semibold text-gray-400">MLB</span></div><div className="overflow-x-auto"><table className="min-w-full whitespace-nowrap"><thead><tr className="border-b border-gray-100 bg-gray-50 text-center dark:border-gray-800 dark:bg-white/[0.025]">{fields.map(([label, key]) => <th key={key} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</th>)}</tr></thead><tbody><tr className="text-center">{fields.map(([, key]) => <td key={key} className="px-4 py-4 text-base font-bold tabular-nums text-gray-900 dark:text-white">{formatStatValue(stats[key])}</td>)}</tr></tbody></table></div></section>;
}

function AcquisitionLine({ profile, signing }: { profile: MlbPlayerProfile; signing: MlbInitialSigning | null }) {
  const drafted = Boolean(profile.draftYear);
  const items = drafted
    ? [["Organization", profile.draftTeam], ["Year", profile.draftYear], ["Round", profile.draftRound ? `Round ${profile.draftRound}` : null], ["Overall Pick", profile.draftPick ? `#${profile.draftPick}` : null], ["School", profile.draftSchool], ["Signing Bonus", profile.draftSigningBonus ? `$${Number(profile.draftSigningBonus).toLocaleString()}` : null]]
    : signing
      ? [["Organization", signing.mlb_team_name], ["Year", signing.signing_year], ["Signing Type", signing.signing_type === "INTERNATIONAL" ? "International free agent" : signing.signing_type === "UDFA" ? "Undrafted free agent" : "Initial signing"]]
      : [];
  if (!items.length) return null;
  return <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3 dark:border-gray-800"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-black text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">{drafted ? "D" : "FA"}</span><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Player Acquisition</p><h2 className="text-sm font-bold text-gray-900 dark:text-white">{drafted ? `${profile.draftYear} MLB Draft` : `${signing?.signing_year} Initial Signing`}</h2></div></div><dl className="flex flex-wrap divide-x divide-gray-100 px-5 py-3 dark:divide-gray-800">{items.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => <BioItem key={String(label)} label={String(label)} value={String(value)} />)}</dl></section>;
}

export default function BaseballPlayerProfile() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const playerId = Number(params.get("playerId"));
  const source = params.get("type") === "pitching" ? "pitching" : "hitting";
  const [profile, setProfile] = useState<MlbPlayerProfile | null>(null);
  const [initialSigning, setInitialSigning] = useState<MlbInitialSigning | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!Number.isInteger(playerId) || playerId <= 0) { setError("No valid MLB player ID was provided."); setLoading(false); return; }
    setLoading(true); setError("");
    Promise.all([fetchMlbPlayerProfile(playerId, MLB_STATS_SEASON), fetchMlbInitialSigning(playerId).catch(() => null)])
      .then(([row, signing]) => { if (active) { setProfile(row); setInitialSigning(signing); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load MLB player profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [playerId]);

  const name = profile?.playerName || "Baseball Player";
  return <div><PageMeta title={`${name} | Front Office Baseball League`} description={`${name} MLB player profile`} /><PageBreadcrumb pageTitle={name} /><div className="space-y-5">
    {loading && <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">Loading MLB player profile…</div>}
    {error && <div className="rounded-xl border border-error-200 bg-error-50 p-4 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{error}</div>}
    {!loading && !error && profile && <>
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="h-2 bg-gradient-to-r from-brand-500 via-blue-500 to-cyan-400" /><div className="p-5 sm:p-7"><div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-4 sm:gap-6"><div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-md dark:border-gray-800 dark:bg-gray-800"><img src={`https://img.mlbstatic.com/mlb-photos/image/upload/w_240,q_auto:best,f_auto/v1/people/${profile.playerId}/headshot/67/current`} alt={`${profile.playerName} headshot`} className="h-full w-full object-cover" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white sm:text-4xl">{profile.playerName}</h1><PositionBadge position={profile.position} /></div><div className="mt-2 flex items-center gap-2 text-sm font-semibold text-gray-500">{profile.teamLogoUrl && <img src={profile.teamLogoUrl} alt="" className="h-7 w-7 object-contain" />}<span>{profile.teamName}</span><span className="text-gray-300">•</span><span>{profile.primaryPosition || profile.position}</span></div></div></div><Link to={source === "pitching" ? "/pitcher-stats" : "/batter-stats"} className="self-start rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-600 transition hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">← Back to {source === "pitching" ? "pitchers" : "batters"}</Link></div><dl className="mt-6 grid divide-y divide-gray-100 border-t border-gray-200 dark:divide-gray-800 dark:border-gray-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5"><BioItem label="Birthday" value={<>{formatDate(profile.birthDate)}{profile.currentAge != null && <span className="ml-1.5 font-normal text-gray-400">({profile.currentAge})</span>}</>} /><BioItem label="Birthplace" value={[profile.birthCity, profile.birthCountry].filter(Boolean).join(", ") || "—"} /><BioItem label="Bats / Throws" value={`${profile.batSide || "—"} / ${profile.pitchHand || "—"}`} /><BioItem label="Height / Weight" value={`${profile.height || "—"}${profile.weight ? ` / ${profile.weight} lb` : ""}`} /><BioItem label="MLB Debut" value={formatDate(profile.debutDate)} /></dl></div></section>
      <AcquisitionLine profile={profile} signing={initialSigning} />
      {profile.hittingStats && <StatsLine title="Batting" stats={withFantasyScore(profile.hittingStats, "hitting")} fields={battingStats} />}
      {profile.pitchingStats && <StatsLine title="Pitching" stats={withFantasyScore(profile.pitchingStats, "pitching")} fields={pitchingStats} />}
      {!profile.hittingStats && !profile.pitchingStats && <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">No {MLB_STATS_SEASON} MLB statistics were returned for this player.</div>}
    </>}
  </div></div>;
}
