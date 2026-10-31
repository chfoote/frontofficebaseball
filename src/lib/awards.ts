import { supabase } from "./supabase";
import type { FantasyPlayer } from "./fantasyPlayers";

export type Award = { id: number; name: string; image_url: string | null; active: boolean; created_at: string };
export type PlayerAward = {
  id: number;
  award_id: number;
  player_id: number;
  season_year: number;
  award: Award | null;
  player: FantasyPlayer | null;
  is_monthly?: boolean;
  month_index?: number;
  fantasy_team_id?: number | null;
  games_played?: number;
  fantasy_points?: number;
};

export type MonthlyHonourInput = {
  season_year: number;
  month_index: number;
  category: "forward" | "defenceman" | "goalie";
  player_id: number;
  fantasy_team_id: number | null;
  games_played: number;
  fantasy_points: number;
};

export async function fetchAwards(includeInactive = false) {
  let query = supabase.from("awards").select("*").order("name");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Award[];
}

export async function createAward(input: { name: string; image_url: string | null }) {
  const { data, error } = await supabase.from("awards").insert(input).select().single();
  if (error) throw error;
  return data as Award;
}

export async function deleteAward(id: number) {
  const { error } = await supabase.from("awards").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPlayerAwards(seasonYear?: number, includeMonthly = true) {
  let query = supabase
    .from("player_awards")
    .select("*, award:awards(*), player:players(*)")
    .order("season_year", { ascending: false });
  if (seasonYear) query = query.eq("season_year", seasonYear);
  const { data, error } = await query;
  if (error) throw error;
  const seasonal = (data ?? []) as PlayerAward[];
  if (!includeMonthly) return seasonal;
  let monthlyQuery = supabase.from("monthly_player_honours").select("*, player:players(*)").order("season_year", { ascending: false }).order("month_index", { ascending: false });
  if (seasonYear) monthlyQuery = monthlyQuery.eq("season_year", seasonYear);
  const { data: monthlyData, error: monthlyError } = await monthlyQuery;
  if (monthlyError) {
    if (monthlyError.code === "42P01" || monthlyError.code === "PGRST205") return seasonal;
    throw monthlyError;
  }
  const categoryNames = { forward: "Forward of the Month", defenceman: "Defenceman of the Month", goalie: "Goalie of the Month" } as const;
  const monthly = (monthlyData ?? []).map((row) => ({
    id: -Number(row.id), award_id: -1, player_id: Number(row.player_id), season_year: Number(row.season_year), player: row.player as FantasyPlayer | null,
    award: { id: -1, name: categoryNames[row.category as keyof typeof categoryNames], image_url: null, active: true, created_at: row.created_at as string },
    is_monthly: true, month_index: Number(row.month_index), fantasy_team_id: row.fantasy_team_id == null ? null : Number(row.fantasy_team_id), games_played: Number(row.games_played), fantasy_points: Number(row.fantasy_points),
  } satisfies PlayerAward));
  return [...seasonal, ...monthly];
}

export async function syncMonthlyHonours(rows: MonthlyHonourInput[]) {
  if (!rows.length) return;
  const { error } = await supabase.from("monthly_player_honours").upsert(rows, { onConflict: "season_year,month_index,category" });
  if (error) throw error;
}

export async function assignPlayerAward(input: { award_id: number; player_id: number; season_year: number }) {
  const { data, error } = await supabase.from("player_awards").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function deletePlayerAward(id: number) {
  const { error } = await supabase.from("player_awards").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadAwardImage(file: File) {
  const extension = file.name.split(".").pop() || "png";
  const fileName = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("award-images").upload(fileName, file);
  if (error) throw error;
  return supabase.storage.from("award-images").getPublicUrl(fileName).data.publicUrl;
}

export function mapAwardsByPlayer(rows: PlayerAward[]) {
  return rows.reduce<Map<number, PlayerAward[]>>((map, row) => {
    map.set(row.player_id, [...(map.get(row.player_id) || []), row]);
    return map;
  }, new Map());
}
