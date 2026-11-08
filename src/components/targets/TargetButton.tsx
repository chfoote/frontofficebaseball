import type { TargetPlayer, useManagerTargets } from "../../hooks/useManagerTargets";

export default function TargetButton({ player, list }: { player: TargetPlayer; list: ReturnType<typeof useManagerTargets> }) {
  const saved = list.targets.some((target) => target.player_api_id === player.player_api_id);
  return <button type="button" aria-pressed={saved} aria-label={`${saved ? "Remove" : "Favorite"} ${player.player_name}${saved ? " from targets" : " as a target"}`} title={list.signedIn ? saved ? "Remove from My Targets" : "Add to My Targets in Roster Lab" : "Sign in to save targets"} disabled={!list.signedIn || list.loading || list.busy || !player.player_api_id} onClick={() => void (saved ? list.remove(player.player_api_id) : list.save({ ...player, estimated_salary: 250000, term: 1 }))} className={`rounded-lg border px-2 py-1 text-lg disabled:opacity-40 ${saved ? "border-amber-300 bg-amber-50 text-amber-600" : "border-gray-200 text-gray-400 hover:text-amber-500 dark:border-gray-700"}`}>{saved ? "★" : "☆"}</button>;
}
