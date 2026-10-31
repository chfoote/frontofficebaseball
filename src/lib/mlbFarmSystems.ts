import { supabase } from "./supabase";
import type { FantasyTeam } from "./fantasyTeams";

export type MlbAffiliate = { id: number; fantasy_team_id: number; season_year: number; slot: 1 | 2; mlb_team_id: number; mlb_team_name: string };
export type MlbFarmProspect = { key: string; playerId?: number; playerName: string; position: string; birthDate?: string; organizationId: number; organizationName: string; acquiredYear: number; source: "DRAFT" | "UDFA" | "INTERNATIONAL" | "OTHER"; round?: number; pick?: number };
export type AcquiredProspectOwner = { player_name: string; acquisition_note: string | null; fantasy_team: { id: number; team_name: string; abbreviation: string; logo: string | null } };
export type MlbProspectOwner = { team: Pick<FantasyTeam, "id" | "team_name" | "abbreviation" | "logo">; source: "affiliate" | "acquired"; playerId?: number; birthDate?: string };
export type MlbInitialSigning = { player_api_id: string | null; player_name: string; birth_date: string | null; position: string | null; mlb_team_id: number; mlb_team_name: string; signing_year: number; signing_type: "UDFA" | "INTERNATIONAL" | "OTHER" };

const workbookAffiliates: Record<string, Array<[number, string]>> = {
  OCB: [[138, "St. Louis Cardinals"], [110, "Baltimore Orioles"]],
  STM: [[133, "Athletics"], [140, "Texas Rangers"]],
  BBS: [[136, "Seattle Mariners"], [135, "San Diego Padres"]],
  MCW: [[113, "Cincinnati Reds"], [158, "Milwaukee Brewers"]],
  DBG: [[115, "Colorado Rockies"], [145, "Chicago White Sox"]],
  TEX: [[147, "New York Yankees"], [142, "Minnesota Twins"]],
  LBO: [[109, "Arizona Diamondbacks"], [139, "Tampa Bay Rays"]],
  SSV: [[119, "Los Angeles Dodgers"], [141, "Toronto Blue Jays"]],
  DTC: [[119, "Los Angeles Dodgers"], [141, "Toronto Blue Jays"]],
  WAR: [[117, "Houston Astros"], [114, "Cleveland Guardians"]],
};

function fallbackAffiliates(teamId: number, seasonYear: number, abbreviation: string) {
  return (workbookAffiliates[abbreviation.toUpperCase()] || []).map(([mlbTeamId, mlbTeamName], index) => ({
    id: -(teamId * 10 + index + 1), fantasy_team_id: teamId, season_year: seasonYear,
    slot: (index + 1) as 1 | 2, mlb_team_id: mlbTeamId, mlb_team_name: mlbTeamName,
  }));
}

export async function fetchMlbAffiliates(teamId: number, seasonYear: number, abbreviation: string) {
  const { data, error } = await supabase.from("fantasy_team_mlb_affiliates").select("*").eq("fantasy_team_id", teamId).eq("season_year", seasonYear).order("slot");
  if (error || !data?.length) return fallbackAffiliates(teamId, seasonYear, abbreviation);
  return data as MlbAffiliate[];
}

async function fetchDraft(year: number): Promise<MlbFarmProspect[]> {
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/draft/${year}`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data?.drafts?.rounds || []).flatMap((round: any) => (round?.picks || []).filter((pick: any) => Number(pick?.signingBonus || 0) > 0 || String(pick?.person?.draftYear || "") === String(year)).map((pick: any) => ({
    key: `draft:${year}:${pick?.pickNumber || pick?.person?.id}`,
    playerId: pick?.person?.id,
    playerName: pick?.person?.fullName || "Unknown Player",
    position: pick?.person?.primaryPosition?.abbreviation || pick?.position?.abbreviation || "—",
    birthDate: pick?.person?.birthDate,
    organizationId: pick?.team?.id,
    organizationName: pick?.team?.name || "MLB organization",
    acquiredYear: year,
    source: "DRAFT" as const,
    round: Number(pick?.pickRound || round?.round || 0),
    pick: Number(pick?.pickNumber || 0),
    })));
  } catch {
    return [];
  }
}

export async function fetchAcquiredProspectOwners(seasonYear: number) {
  const { data, error } = await supabase.from("mlb_acquired_prospect_rights").select("player_name,acquisition_note,fantasy_team:fantasy_teams(id,team_name,abbreviation,logo)").eq("season_year", seasonYear);
  if (error) return [] as AcquiredProspectOwner[];
  return (data || []) as unknown as AcquiredProspectOwner[];
}

export async function fetchMlbInitialSigning(playerApiId: number) {
  const { data, error } = await supabase
    .from("mlb_initial_signings")
    .select("player_api_id,player_name,birth_date,position,mlb_team_id,mlb_team_name,signing_year,signing_type")
    .eq("player_api_id", String(playerApiId))
    .order("signing_year", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as MlbInitialSigning | null;
}

export async function fetchMlbFarmProspects(affiliates: MlbAffiliate[], throughYear: number, acquiredPlayerNames: string[] = []) {
  const organizationIds = new Set(affiliates.map((affiliate) => affiliate.mlb_team_id));
  const acquiredNameKeys = new Set(acquiredPlayerNames.map(ownershipNameKey));
  const draftYears = Array.from({ length: Math.max(throughYear - 2014, 1) }, (_, index) => throughYear - index);
  const [drafts, signingsResult] = await Promise.all([
    Promise.all(draftYears.map(fetchDraft)),
    supabase.from("mlb_initial_signings").select("*").lte("signing_year", throughYear),
  ]);
  const drafted = drafts.flat().filter((prospect) => organizationIds.has(prospect.organizationId) || acquiredNameKeys.has(ownershipNameKey(prospect.playerName)));
  const fallbackSignings: MlbFarmProspect[] = [
    { key: "signed:walcott", playerName: "Sebastian Walcott", position: "SS", birthDate: "2006-03-14", organizationId: 140, organizationName: "Texas Rangers", acquiredYear: 2023, source: "INTERNATIONAL" },
    { key: "signed:murakami", playerName: "Munetaka Murakami", position: "3B", birthDate: "2000-02-02", organizationId: 145, organizationName: "Chicago White Sox", acquiredYear: 2026, source: "OTHER" },
  ];
  const signed = signingsResult.error
    ? fallbackSignings.filter((row) => (organizationIds.has(row.organizationId) || acquiredNameKeys.has(ownershipNameKey(row.playerName))) && row.acquiredYear <= throughYear)
    : (signingsResult.data || [])
      .filter((row: any) => organizationIds.has(row.mlb_team_id) || acquiredNameKeys.has(ownershipNameKey(row.player_name)))
      .map((row: any) => ({ key: `signed:${row.id}`, playerId: row.player_api_id ? Number(row.player_api_id) : undefined, playerName: row.player_name, position: row.position || "—", birthDate: row.birth_date || undefined, organizationId: row.mlb_team_id, organizationName: row.mlb_team_name, acquiredYear: row.signing_year, source: row.signing_type })) as MlbFarmProspect[];
  return [...drafted, ...signed];
}

export function ageOnSeasonDate(birthDate: string | undefined, seasonYear: number) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  // Do not age prospects against a future season date. Rights expire when a
  // player actually turns 27, not when the fantasy league rolls forward.
  const seasonCutoff = new Date(`${seasonYear}-07-01T00:00:00`);
  const now = new Date();
  const cutoff = seasonCutoff > now ? now : seasonCutoff;
  let age = cutoff.getFullYear() - birth.getFullYear();
  if (cutoff.getMonth() < birth.getMonth() || (cutoff.getMonth() === birth.getMonth() && cutoff.getDate() < birth.getDate())) age--;
  return age;
}

function ownershipNameKey(value: string) {
  const parts = value.toLowerCase().split(",").map((part) => part.trim()).filter(Boolean);
  const ordered = parts.length === 2 ? [parts[1], parts[0]] : parts;
  return ordered.join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

export async function fetchAllMlbProspectOwners(seasonYear: number) {
  const { data, error } = await supabase
    .from("fantasy_team_mlb_affiliates")
    .select("*, fantasy_team:fantasy_teams(id,team_name,abbreviation,logo)")
    .eq("season_year", seasonYear);
  if (error) throw error;

  const affiliateRows = (data || []) as unknown as Array<MlbAffiliate & { fantasy_team: MlbProspectOwner["team"] }>;
  const prospects = await fetchMlbFarmProspects(affiliateRows, seasonYear);
  const owners = new Map<string, MlbProspectOwner>();
  const teamByOrganization = new Map(affiliateRows.map((row) => [row.mlb_team_id, row.fantasy_team]));

  prospects
    .filter((prospect) => (ageOnSeasonDate(prospect.birthDate, seasonYear) ?? 0) < 27)
    .forEach((prospect) => {
      const team = teamByOrganization.get(prospect.organizationId);
      if (!team) return;
      const owner = { team, source: "affiliate" as const, playerId: prospect.playerId, birthDate: prospect.birthDate };
      if (prospect.playerId) owners.set(`id:${prospect.playerId}`, owner);
      const nameOwnerKey = `name:${ownershipNameKey(prospect.playerName)}`;
      // Draft years are loaded newest-first. Do not let an older, different
      // player with the same normalized name overwrite the current identity.
      if (!owners.has(nameOwnerKey)) owners.set(nameOwnerKey, owner);
    });

  const acquired = await fetchAcquiredProspectOwners(seasonYear);
  acquired.forEach((row) => {
    const key = ownershipNameKey(row.player_name);
    const matchingProspects = prospects.filter((prospect) => ownershipNameKey(prospect.playerName) === key);
    const owner = { team: row.fantasy_team, source: "acquired" as const, birthDate: matchingProspects.find((prospect) => prospect.birthDate)?.birthDate };
    owners.set(`name:${key}`, owner);
    matchingProspects.filter((prospect) => prospect.playerId).forEach((prospect) => owners.set(`id:${prospect.playerId}`, { ...owner, playerId: prospect.playerId }));
  });
  return owners;
}

export function findMlbProspectOwner(record: { playerId?: number; playerName: string }, owners: Map<string, MlbProspectOwner>) {
  const idOwner = record.playerId ? owners.get(`id:${record.playerId}`) : undefined;
  if (idOwner) return idOwner;
  const nameOwner = owners.get(`name:${ownershipNameKey(record.playerName)}`);
  if (record.playerId && nameOwner?.playerId && nameOwner.playerId !== record.playerId) return undefined;
  return nameOwner;
}

export function daysUntilProspectAgeOut(birthDate?: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const ageOut = new Date(birth);
  ageOut.setFullYear(ageOut.getFullYear() + 27);
  const days = Math.ceil((ageOut.getTime() - Date.now()) / 86_400_000);
  return days > 0 ? days : null;
}
