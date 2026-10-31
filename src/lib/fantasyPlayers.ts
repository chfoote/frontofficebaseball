import { supabase } from "./supabase";
import type { FantasyTeam } from "./fantasyTeams";

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

export async function fetchPlayerSeasons() {
  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .order("season_year", { ascending: false })
    .order("full_name", {
      ascending: true,
      referencedTable: "players",
      nullsFirst: false,
    });

  if (error) throw error;
  return (data ?? []) as PlayerSeasonWithRelations[];
}

export async function fetchPlayerSeasonsByTeamAndSeason(
  fantasyTeamId: number,
  seasonYear: number,
) {
  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
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

export async function fetchPlayerSeasonsByTeam(fantasyTeamId: number) {
  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .eq("fantasy_team_id", fantasyTeamId)
    .order("season_year", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PlayerSeasonWithRelations[];
}

export async function fetchPlayerSeasonsBySeason(seasonYear: number) {
  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .eq("season_year", seasonYear);

  if (error) throw error;
  return (data ?? []) as PlayerSeasonWithRelations[];
}

export async function fetchPlayerSeasonsByPlayer(playerId: number) {
  const { data, error } = await supabase
    .from("player_seasons")
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .eq("player_id", playerId)
    .order("season_year", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlayerSeasonWithRelations[];
}

export async function createPlayerSeason(season: PlayerSeasonInput) {
  const { data, error } = await supabase
    .from("player_seasons")
    .insert(season)
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .single();

  if (error) throw error;
  return data as PlayerSeasonWithRelations;
}

export async function updatePlayerSeason(id: number, season: PlayerSeasonInput) {
  const { data, error } = await supabase
    .from("player_seasons")
    .update(season)
    .eq("id", id)
    .select("*, player:players(*), fantasy_team:fantasy_teams(*)")
    .single();

  if (error) throw error;
  return data as PlayerSeasonWithRelations;
}

export async function deletePlayerSeason(id: number) {
  const { error } = await supabase.from("player_seasons").delete().eq("id", id);
  if (error) throw error;
}
