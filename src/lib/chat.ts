import { supabase } from "./supabase";

export type ChatMessage = {
  id: number;
  user_id: string;
  message: string;
  author_name: string;
  fantasy_team_id: number | null;
  team_name: string | null;
  team_abbreviation: string | null;
  team_logo: string | null;
  is_system: boolean;
  system_label: string | null;
  link: string | null;
  created_at: string;
};

export async function fetchChatMessages(limit = 50, beforeId?: number) {
  let query = supabase
    .from("chat_messages")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);
  if (beforeId) query = query.lt("id", beforeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function sendChatMessage(userId: string, message: string) {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ user_id: userId, message })
    .select("*")
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

export async function deleteChatMessage(messageId: number) {
  const { error } = await supabase.from("chat_messages").delete().eq("id", messageId);
  if (error) throw error;
}
