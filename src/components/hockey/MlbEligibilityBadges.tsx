import PositionBadge from "./PositionBadge";
import type { MlbEligiblePosition } from "../../lib/mlbEligibility";

export default function MlbEligibilityBadges({ positions, loading = false, error = "" }: { positions?: MlbEligiblePosition[]; loading?: boolean; error?: string }) {
  if (loading || error) return <span className="text-[10px] text-gray-400" title={error || undefined}>{loading ? "Loading eligibility…" : "Eligibility unavailable"}</span>;
  if (!positions?.length) return <span className="text-[10px] text-gray-400">No qualifying position</span>;
  return <span className="inline-flex flex-wrap justify-center gap-1" aria-label={`Eligible positions: ${positions.join(", ")}`}>{positions.map((position) => <PositionBadge key={position} position={position} />)}</span>;
}
