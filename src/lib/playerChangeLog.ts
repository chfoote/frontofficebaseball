import { supabase } from "./supabase";

export type PlayerChange = {
  id: number;
  changed_at: string;
  actor_id: string | null;
  actor_email: string | null;
  table_name: "players" | "player_seasons";
  operation: "INSERT" | "UPDATE" | "DELETE";
  row_id: number;
  player_id: number;
  player_name: string | null;
  season_year: number | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export async function fetchPlayerChanges(beforeId?: number, search?: string, limit = 50) {
  let query = supabase.from("player_change_log").select("*").order("id", { ascending: false }).limit(limit);
  if (beforeId) query = query.lt("id", beforeId);
  if (search?.trim()) query = query.ilike("player_name", `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PlayerChange[];
}
