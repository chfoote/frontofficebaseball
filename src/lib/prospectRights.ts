import { supabase } from "./supabase";
import type { FantasyPlayer, PlayerSeasonWithRelations } from "./fantasyPlayers";
import type { FantasyTeam } from "./fantasyTeams";
import { fetchNhlDraftPicks, fetchNhlPlayerLanding, type NhlDraftPick } from "./nhl";

export type ProspectRight = {
  playerApiId?: string;
  playerName?: string;
  positionCode?: string;
  team: FantasyTeam;
  source: "farm_system" | "prospect_record" | "call_up" | "draft_match";
};

type RightsTransactionRow = {
  player: FantasyPlayer | null;
  fantasy_team: FantasyTeam | null;
  season_year: number;
  action: "called_up" | "signed";
};

const nhlTeamAbbreviations: Record<string, string> = {
  anaheimduck: "ANA", anaheimducks: "ANA", bostonbruins: "BOS", buffalosabres: "BUF",
  calgaryflames: "CGY", carolinahurricanes: "CAR", chicagoblackhawks: "CHI",
  coloradoavalanche: "COL", columbusbluejackets: "CBJ", dallasstars: "DAL",
  detroitredrings: "DET", detroitredwings: "DET", edmontonoilers: "EDM",
  floridapanthers: "FLA", losangeleskings: "LAK", minnesotawild: "MIN",
  montrealcanadiens: "MTL", nashvillepredators: "NSH", newjerseydevils: "NJD",
  newyorkislanders: "NYI", newyorkrangers: "NYR", ottawasenators: "OTT",
  philadelphiaflyers: "PHI", pittsburghpenguins: "PIT", sanjosesharks: "SJS",
  seattlekraken: "SEA", stlouisblues: "STL", tampabaylightning: "TBL",
  torontomapleleafs: "TOR", utahhockeyclub: "UTA", utahmammoth: "UTA",
  vancouvercanucks: "VAN", vegasgoldenknights: "VGK", washingtoncapitals: "WSH",
  winnipegjets: "WPG",
};

const landingCache = new Map<number, ReturnType<typeof fetchNhlPlayerLanding>>();
const draftCache = new Map<number, ReturnType<typeof fetchNhlDraftPicks>>();

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function farmAbbreviations(team: FantasyTeam) {
  const farms = [team.eastern_farm_system, team.western_farm_system].filter((value): value is string => Boolean(value));
  const abbreviations = new Set(farms.map((farm) => nhlTeamAbbreviations[normalize(farm)]).filter(Boolean));
  if (abbreviations.has("UTA")) abbreviations.add("ARI");
  return abbreviations;
}

function draftPicks(year: number) {
  const cached = draftCache.get(year);
  if (cached) return cached;
  const request = fetchNhlDraftPicks(year);
  draftCache.set(year, request);
  return request;
}

function draftPickName(pick: NhlDraftPick) {
  return [pick.firstName?.default, pick.lastName?.default].filter(Boolean).join(" ");
}

function nameKey(name: string) {
  return `name:${normalize(name)}`;
}

export function getProspectRight(rights: Map<string, ProspectRight>, playerApiId: string | number, playerName: string) {
  return rights.get(String(playerApiId)) || rights.get(nameKey(playerName));
}

function ageFromBirthDate(birthDate?: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export async function removeAgedOutProspectRights(
  rights: Map<string, ProspectRight>,
  players: Array<{ playerId: number; playerName: string; birthDate?: string }>,
) {
  const filtered = new Map(rights);
  await Promise.all(players.map(async ({ playerId, playerName, birthDate }) => {
    if (!getProspectRight(rights, playerId, playerName)) return;
    try {
      const resolvedBirthDate = birthDate || (await playerLanding(playerId)).birthDate;
      const age = ageFromBirthDate(resolvedBirthDate);
      if (age !== null && age >= 27) {
        filtered.delete(String(playerId));
        filtered.delete(nameKey(playerName));
      }
    } catch {
      // Preserve the right when the NHL does not provide enough data to verify age.
    }
  }));
  return filtered;
}

function playerLanding(playerId: number) {
  const cached = landingCache.get(playerId);
  if (cached) return cached;
  const request = fetchNhlPlayerLanding(playerId);
  landingCache.set(playerId, request);
  return request;
}

export async function fetchProspectRights(seasonYear: number) {
  const draftYears = Array.from({ length: 10 }, (_, index) => seasonYear - 1 - index);
  const [prospectResult, callUpResult, fantasyTeamResult, draftResults] = await Promise.all([
    supabase
      .from("player_seasons")
      .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
      .in("position", ["PROSPECT", "AP"])
      .not("fantasy_team_id", "is", null),
    supabase
      .from("league_transactions")
      .select("season_year, action, player:players(*), fantasy_team:fantasy_teams(*)")
      .in("action", ["called_up", "signed"])
      .not("fantasy_team_id", "is", null),
    supabase.from("fantasy_teams").select("*").eq("active", true),
    Promise.all(draftYears.map(async (year) => ({ year, picks: await draftPicks(year) }))),
  ]);
  if (prospectResult.error) throw prospectResult.error;
  if (callUpResult.error) throw callUpResult.error;
  if (fantasyTeamResult.error) throw fantasyTeamResult.error;

  const rights = new Map<string, ProspectRight>();
  const fantasyTeams = (fantasyTeamResult.data ?? []) as FantasyTeam[];
  draftResults.forEach(({ picks }) => picks.forEach((pick) => {
    const owner = fantasyTeams.find((team) => farmAbbreviations(team).has(pick.teamAbbrev));
    const playerName = draftPickName(pick);
    if (owner && playerName) rights.set(nameKey(playerName), { playerName, positionCode: pick.positionCode, team: owner, source: "farm_system" });
  }));

  const prospectRows = (prospectResult.data ?? []) as PlayerSeasonWithRelations[];
  [...prospectRows]
    .sort((a, b) => Math.abs(a.season_year - seasonYear) - Math.abs(b.season_year - seasonYear) || b.season_year - a.season_year)
    .forEach((row) => {
      const apiId = row.player?.player_api_id;
      if (apiId && row.fantasy_team && !rights.has(apiId)) {
        const right = { playerApiId: apiId, playerName: row.player?.full_name || undefined, positionCode: row.position || undefined, team: row.fantasy_team, source: "prospect_record" as const };
        rights.set(apiId, right);
        if (row.player) rights.set(nameKey(row.player.full_name || [row.player.first_name, row.player.last_name].filter(Boolean).join(" ")), right);
      }
    });

  const futureTransactions = ((callUpResult.data ?? []) as unknown as RightsTransactionRow[])
    .filter((row) => row.season_year > seasonYear)
    .sort((a, b) => a.season_year - b.season_year);
  futureTransactions.filter((row) => row.action === "called_up").forEach((row) => {
      const apiId = row.player?.player_api_id;
      if (apiId && row.fantasy_team && !rights.has(apiId)) {
        const right = { playerApiId: apiId, playerName: row.player?.full_name || undefined, team: row.fantasy_team, source: "call_up" as const };
        rights.set(apiId, right);
        rights.set(nameKey(row.player?.full_name || ""), right);
      }
    });

  await Promise.all(futureTransactions.filter((row) => row.action === "signed").map(async (row) => {
    const apiId = row.player?.player_api_id;
    const playerId = apiId ? Number(apiId) : NaN;
    if (!apiId || !Number.isFinite(playerId) || !row.fantasy_team || rights.has(apiId)) return;
    try {
      const landing = await playerLanding(playerId);
      const draftTeam = landing.draftDetails?.teamAbbrev;
      if (draftTeam && farmAbbreviations(row.fantasy_team).has(draftTeam)) {
        const right = { playerApiId: apiId, playerName: row.player?.full_name || undefined, team: row.fantasy_team, source: "draft_match" as const };
        rights.set(apiId, right);
        rights.set(nameKey(row.player?.full_name || ""), right);
      }
    } catch {
      // A missing NHL landing record should not prevent the stats page from loading.
    }
  }));

  return rights;
}
