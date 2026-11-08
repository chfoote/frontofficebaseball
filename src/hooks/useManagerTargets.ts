import { validTargetEstimate } from "../lib/managerTargets";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export type ManagerTarget = {
  player_api_id: string;
  player_name: string;
  position: string;
  stat_group: "hitting" | "pitching";
  estimated_salary: number;
  term: number;
};
export type TargetPlayer = Omit<ManagerTarget, "estimated_salary" | "term">;

export function useManagerTargets() {
  const { user } = useAuth();
  const userId = user?.id;
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const [targets, setTargets] = useState<ManagerTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setTargets([]);
    setError("");
    setLoading(true);
    if (!userId) { setLoading(false); return; }
    void supabase.from("manager_targets").select("*").eq("user_id", userId).order("created_at").then(({ data, error }) => {
      if (!active) return;
      if (error) setError("Unable to load your targets. Please try again later.");
      else setTargets(data || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);

  const save = useCallback(async (target: ManagerTarget) => {
    if (!userId || busy || loading) return;
    if (!validTargetEstimate(target.estimated_salary, target.term)) {
      setError("Enter an annual salary of at least $250,000 and a term of 1–5 whole years."); return;
    }
    setBusy(true); setError("");
    try {
      const { error } = await supabase.from("manager_targets").upsert({ ...target, user_id: userId }, { onConflict: "user_id,player_api_id" });
      if (error) throw error;
      if (currentUser.current === userId) setTargets((rows) => [...rows.filter((row) => row.player_api_id !== target.player_api_id), target]);
    } catch { if (currentUser.current === userId) setError("Could not save this target. Your changes have not been saved; please try again."); }
    finally { setBusy(false); }
  }, [userId, busy, loading]);

  const remove = useCallback(async (playerId: string) => {
    if (!userId || busy || loading) return;
    setBusy(true); setError("");
    try {
      const { error } = await supabase.from("manager_targets").delete().eq("user_id", userId).eq("player_api_id", playerId);
      if (error) throw error;
      if (currentUser.current === userId) setTargets((rows) => rows.filter((row) => row.player_api_id !== playerId));
    } catch { if (currentUser.current === userId) setError("Could not remove this target. Please try again."); }
    finally { setBusy(false); }
  }, [userId, busy, loading]);
  return { targets, loading, busy, error, save, remove, signedIn: Boolean(userId) };
}
