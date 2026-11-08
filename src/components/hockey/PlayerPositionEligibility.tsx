import PositionBadge from "./PositionBadge";
import MlbEligibilityBadges from "./MlbEligibilityBadges";
import type { MlbEligiblePosition } from "../../lib/mlbEligibility";

export default function PlayerPositionEligibility({ position, positions, loading, error }: {
  position: string;
  positions?: MlbEligiblePosition[];
  loading?: boolean;
  error?: string;
}) {
  return <span className="inline-flex flex-wrap items-center gap-1.5 text-left">
    <span title="Assigned position"><PositionBadge position={position} /></span>
    <span className="text-[9px] font-normal text-gray-400">Eligible</span>
    <MlbEligibilityBadges positions={positions?.filter((code) => code !== "SP" && code !== "RP")} loading={loading} error={error} />
  </span>;
}
