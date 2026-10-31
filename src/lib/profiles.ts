import { supabase } from "./supabase";

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("display_name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function upsertProfile({
  userId,
  email,
  displayName,
}: {
  userId: string;
  email: string | null;
  displayName: string | null;
}) {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        email,
        display_name: displayName,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function updateProfileDisplayName({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string | null;
}) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}
