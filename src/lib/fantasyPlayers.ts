import { POOLSTERS_LEAGUE_ID } from "./leagueIdentity";
import { supabase } from "./supabase";
import type { FantasyTeam } from "./fantasyTeams";
import { projectSeasonContracts } from "./projectSeasonContracts";

export type FantasyPlayer = {
  id: number;
  player_api_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  on_trade_block: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FantasyPlayerInput = {
  player_api_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  on_trade_block: boolean;
  notes: string | null;
};

export type PlayerSeason = {
  league_id?: string;
  id: number;
  player_id: number;
  season_year: number;
  fantasy_team_id: number | null;
  salary: number | null;
  position: string | null;
  term_end_year: number | null;
  contract_group: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PlayerSeasonWithRelations = PlayerSeason & {
  player: FantasyPlayer | null;
  fantasy_team: FantasyTeam | null;
};

export type PlayerSeasonInput = {
  player_id: number;
  season_year: number;
  fantasy_team_id: number | null;
  salary: number | null;
  position: string | null;
  term_end_year: number | null;
  contract_group: string | null;
  notes: string | null;
};

export async function fetchFantasyPlayers() {
  const pageSize = 1000;
  const players: FantasyPlayer[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("full_name", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as FantasyPlayer[];
    players.push(...page);
    if (page.length < pageSize) break;
  }

  return players;
}

export async function fetchFantasyPlayerByApiId(playerApiId: string) {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("player_api_id", playerApiId)
    .maybeSingle();

  if (error) throw error;
  return data as FantasyPlayer | null;
}

export async function createFantasyPlayer(player: FantasyPlayerInput) {
  const { data, error } = await supabase
    .from("players")
    .insert(player)
    .select()
    .single();

  if (error) throw error;
  return data as FantasyPlayer;
}

export async function createFantasyPlayers(players: FantasyPlayerInput[]) {
  const created: FantasyPlayer[] = [];
  const chunkSize = 250;

  for (let index = 0; index < players.length; index += chunkSize) {
    const chunk = players.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("players")
      .insert(chunk)
      .select();

    if (error) throw error;
    created.push(...((data ?? []) as FantasyPlayer[]));
  }

  return created;
}

export async function updateFantasyPlayer(id: number, player: FantasyPlayerInput) {
  const { data, error } = await supabase
    .from("players")
    .update(player)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as FantasyPlayer;
}

export async function deleteFantasyPlayer(id: number) {
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPlayerSeasons(leagueId = POOLSTERS_LEAGUE_ID) {
  const rows: PlayerSeasonWithRelations[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("player_seasons")
      .select("*, player:players(*), fantasy_team:fantasy_teams(*)").eq("league_id",leagueId)
      .order("season_year",{ascending:false}).order("id").range(from,from+999);
    if (error) throw error;
    const page = (data || []) as PlayerSeasonWithRelations[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function fetchPlayerSeasonsByTeamAndSeason(
  fantasyTeamId: number,
  seasonYear: number,
  leagueId = POOLSTERS_LEAGUE_ID,
) {
  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .eq("league_id", leagueId)
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("season_year", seasonYear)
    .order("position", { ascending: true, nullsFirst: false })
    .order("full_name", {
      ascending: true,
      referencedTable: "players",
      nullsFirst: false,
    });

  if (error) throw error;
  return (data ?? []) as PlayerSeasonWithRelations[];
}

export async function fetchPlayerSeasonsByTeam(fantasyTeamId: number, leagueId = POOLSTERS_LEAGUE_ID) {
  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .eq("league_id", leagueId)
    .eq("fantasy_team_id", fantasyTeamId)
    .order("season_year", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PlayerSeasonWithRelations[];
}

export async function fetchPlayerSeasonsBySeason(seasonYear: number, leagueId = POOLSTERS_LEAGUE_ID) {
  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .eq("league_id", leagueId)
    .eq("season_year", seasonYear);

  if (error) throw error;
  return (data ?? []) as PlayerSeasonWithRelations[];
}

export async function fetchProjectedPlayerSeasonsBySeason(seasonYear: number, leagueId = POOLSTERS_LEAGUE_ID) {
  const rows: PlayerSeasonWithRelations[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("player_seasons")
      .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
      .eq("league_id", leagueId)
      .lte("season_year", seasonYear)
      .order("season_year", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as PlayerSeasonWithRelations[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return projectSeasonContracts(rows, seasonYear, leagueId);
}

export async function fetchPlayerSeasonsByPlayer(playerId: number, leagueId = POOLSTERS_LEAGUE_ID) {
  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .eq("league_id", leagueId)
    .eq("player_id", playerId)
    .order("season_year", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlayerSeasonWithRelations[];
}

export async function createPlayerSeason(season: PlayerSeasonInput, leagueId = POOLSTERS_LEAGUE_ID) {
  const { data, error } = await supabase
    .from("player_seasons")
    .insert({ ...season, league_id: leagueId })
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .single();

  if (error) throw error;
  return data as PlayerSeasonWithRelations;
}

export async function updatePlayerSeason(id: number, season: PlayerSeasonInput, leagueId = POOLSTERS_LEAGUE_ID) {
  const { data, error } = await supabase
    .from("player_seasons")
    .update(season)
    .eq("league_id", leagueId)
    .eq("id", id)
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .single();

  if (error) throw error;
  return data as PlayerSeasonWithRelations;
}

export async function deletePlayerSeason(id: number, leagueId = POOLSTERS_LEAGUE_ID) {
  const { error } = await supabase.from("player_seasons").delete().eq("league_id", leagueId).eq("id", id);
  if (error) throw error;
}
